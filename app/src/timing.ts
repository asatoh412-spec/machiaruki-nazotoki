// 実際にかかった時間（地点ごと）。見積もりの数字（速さ・1地点の時間）を実測に合わせる材料。
// 区間 = 謎を出した時刻 → 到着（位置情報）→ 正解 → 次の謎を出した時刻。
// 移動の時間 = 到着 − 出題。探す時間 = 正解 − 到着。読む時間 = 次の出題 − 正解。
// 中断した区間、位置情報で到着を確かめていない区間は使わない。1つ目の区間は「出発」を押したときだけ使う。
import { DETOUR, DWELL_INDOOR_MUSEUM_MIN, DWELL_MIN, haversine, BIKE_M_PER_MIN, WALK_M_PER_MIN } from './geo.ts';
import type { Course, Mode, Point, Run } from './types.ts';

export interface Leg {
  pointId: string;
  index: number;
  mode: Mode;
  museum: boolean;
  meters: number; // 見積もりと同じ測り方（直線距離×1.3）
  estTravelMin: number;
  travelMin: number | null; // 出題（1つ目は出発）→ 到着
  searchMin: number | null; // 到着 → 正解
  readMin: number | null; // 正解 → 次の出題（最後の地点は null）
  usable: boolean; // 平均に使えるか
  why: string; // 使えない理由
}

const min = (a?: string, b?: string) => (a && b ? (Date.parse(b) - Date.parse(a)) / 60000 : null);

export function legsOf(run: Run, course: Course, pts: Point[]): Leg[] {
  const mode = course.request.mode;
  const speed = mode === 'walk' ? WALK_M_PER_MIN : BIKE_M_PER_MIN;
  return run.results.map((r, i) => {
    const p = pts.find((x) => x.id === r.pointId);
    const prev = i === 0 ? course.request.start : pts.find((x) => x.id === run.results[i - 1].pointId);
    const meters = p && prev ? haversine(prev.lat, prev.lon, p.lat, p.lon) * DETOUR : 0;
    // シェアサイクルでも1つ目の区間（駅→地点）は借りる手間を含むので、移動の速さの平均には使わない
    const from = i === 0 ? run.departedAt : r.shownAt;
    const travelMin = min(from, r.arrivedAt);
    const searchMin = min(r.arrivedAt, r.at);
    const readMin = min(r.at, run.results[i + 1]?.shownAt);
    let why = '';
    if (r.interrupted) why = '中断した';
    else if (!r.arrivedAt || !r.arrivedByGps) why = '位置情報の到着なし';
    else if (i === 0 && !run.departedAt) why = '出発の記録なし';
    else if (i === 0 && mode === 'share') why = 'シェアサイクルの1区間目';
    else if (r.outcome !== 'correct') why = '見つからない';
    const estTravelMin = meters / speed;
    if (!why && travelMin !== null && travelMin > Math.max(estTravelMin * 3, estTravelMin + 20)) why = '移動が見積もりの3倍以上（休憩か寄り道）';
    return {
      pointId: r.pointId,
      index: i,
      mode,
      museum: p?.kind === '博物館',
      meters,
      estTravelMin,
      travelMin,
      searchMin,
      readMin,
      usable: !why,
      why,
    };
  });
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export interface TimingStats {
  speed: Record<'walk' | 'bike', { n: number; mPerMin: number | null; current: number }>;
  dwell: Record<'normal' | 'museum', { n: number; min: number | null; current: number }>;
  legs: number;
}

// 平均には中央値を使う（1回の長い休憩に引っ張られないため）
export function statsOf(legs: Leg[]): TimingStats {
  const ok = legs.filter((l) => l.usable);
  const sp = (bike: boolean) => {
    const xs = ok.filter((l) => (l.mode !== 'walk') === bike && l.travelMin && l.travelMin > 0.5 && l.meters > 100).map((l) => l.meters / l.travelMin!);
    return { n: xs.length, mPerMin: median(xs), current: bike ? BIKE_M_PER_MIN : WALK_M_PER_MIN };
  };
  const dw = (museum: boolean) => {
    // 1地点の時間（見積もりの7分）= 探す + 読む。最後の地点は読む時間がないので使わない
    const xs = ok.filter((l) => l.museum === museum && l.searchMin !== null && l.readMin !== null && l.readMin < 90).map((l) => l.searchMin! + l.readMin!);
    return { n: xs.length, min: median(xs), current: museum ? DWELL_INDOOR_MUSEUM_MIN : DWELL_MIN };
  };
  return { speed: { walk: sp(false), bike: sp(true) }, dwell: { normal: dw(false), museum: dw(true) }, legs: ok.length };
}

// 平均を見積もりに使ってよい件数の目安
export const ENOUGH = 10;

// 端末に残っているすべての実施から区間を集める（中止したコースの区間も、条件を満たせば使う）
export async function allLegs(): Promise<Leg[]> {
  const db = await import('./store.ts');
  const [runs, packs, courses] = await Promise.all([db.listRuns(), db.listPacks(), db.listCourses()]);
  const course = new Map(courses.map((c) => [c.id, c]));
  const point = new Map(packs.flatMap((p) => p.points.map((x) => [x.id, x] as const)));
  return runs.flatMap((r) => {
    const c = course.get(r.courseId);
    if (!c) return [];
    const pts = c.pointIds.map((id) => point.get(id)).filter((p): p is Point => !!p);
    return legsOf(r, c, pts);
  });
}
