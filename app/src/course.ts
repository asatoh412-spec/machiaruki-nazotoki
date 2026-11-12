// コースの組み立て（端末内、API不要）。
// 素材パックの地点から、所要時間に収まる5〜8地点を選び、移動が短くなる順に並べる。
import type { Course, CourseRequest, Pack, Point, PointRecord, Station } from './types.ts';
import { BIKE_M_PER_MIN, DWELL_INDOOR_MUSEUM_MIN, DWELL_MIN, SHARE_OVERHEAD_MIN, WALK_M_PER_MIN, walkM } from './geo.ts';

export const MIN_POINTS = 5;
export const MAX_POINTS = 8;

export interface AssembleResult {
  course: Course | null;
  warnings: string[];
}

type LatLon = { lat: number; lon: number };

// 移動手段ごとの条件
interface Plan {
  start: LatLon;
  fixedEnd: Station | null; // 自宅着など、終点が決まっている場合
  stations: Station[];
  mPerMin: number;
  extraDwell: number;
  overhead: number;
  maxMeters: number;
  durationMin: number;
}

export function planOf(pack: Pack, req: CourseRequest): Plan {
  const bike = req.mode !== 'walk';
  const home = req.start.kind === 'home' ? { name: '自宅', lines: [], lat: req.start.lat, lon: req.start.lon } : null;
  return {
    start: { lat: req.start.lat, lon: req.start.lon },
    fixedEnd: req.mode === 'share' ? null : home,
    stations: pack.stations,
    mPerMin: bike ? BIKE_M_PER_MIN : WALK_M_PER_MIN,
    extraDwell: 0, // 駐輪の時間は1地点7分の中で吸収する（あきの判断）
    overhead: req.mode === 'share' ? SHARE_OVERHEAD_MIN : 0,
    maxMeters: bike ? (req.maxMeters ?? (req.mode === 'share' ? 30000 : 40000)) : Infinity,
    durationMin: req.durationMin,
  };
}

function dwell(p: Point, plan: Plan): number {
  return (p.kind === '博物館' ? DWELL_INDOOR_MUSEUM_MIN : DWELL_MIN) + (p.on_foot ? plan.extraDwell : 0);
}

export function nearestStation(stations: Station[], at: LatLon): Station {
  let best = stations[0];
  let bestD = Infinity;
  for (const s of stations) {
    const d = walkM(at.lat, at.lon, s.lat, s.lon);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

// 正解済みの地点と、「見つからない」で外した地点は使わない
export function isEligible(rec: PointRecord | undefined): boolean {
  if (!rec) return true;
  return rec.status !== 'excluded' && rec.visits === 0;
}

// 地点の優先度。季節の見どころが今月なら上げる。
export function weight(p: Point, rec: PointRecord | undefined, month: number): number {
  let w = 1;
  if (p.seasonal.some((s) => s.months.includes(month))) w += 2;
  if (rec?.status === 'verified') w += 0.5;
  return w;
}

export function pathMeters(start: LatLon, pts: LatLon[], end: LatLon): number {
  let m = 0;
  let cur = start;
  for (const p of pts) {
    m += walkM(cur.lat, cur.lon, p.lat, p.lon);
    cur = p;
  }
  return m + walkM(cur.lat, cur.lon, end.lat, end.lon);
}

export function evaluate(plan: Plan, pts: Point[]): { minutes: number; meters: number; end: Station } {
  const end = plan.fixedEnd ?? nearestStation(plan.stations, pts[pts.length - 1]);
  const meters = pathMeters(plan.start, pts, end);
  const minutes = meters / plan.mPerMin + pts.reduce((a, p) => a + dwell(p, plan), 0) + plan.overhead;
  return { minutes, meters, end };
}

const fits = (plan: Plan, e: { minutes: number; meters: number }) => e.minutes <= plan.durationMin && e.meters <= plan.maxMeters;

// 2-opt で並びを改善する（出発点は固定）
export function twoOpt(plan: Plan, pts: Point[]): Point[] {
  let best = pts.slice();
  let bestM = evaluate(plan, best).meters;
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const cand = best.slice(0, i).concat(best.slice(i, k + 1).reverse(), best.slice(k + 1));
        const m = evaluate(plan, cand).meters;
        if (m + 1 < bestM) {
          best = cand;
          bestM = m;
          improved = true;
        }
      }
    }
  }
  return best;
}

export function assemble(
  pack: Pack,
  req: CourseRequest,
  records: Map<string, PointRecord>,
  rng: () => number = Math.random,
  trials = 400,
): AssembleResult {
  const warnings: string[] = [];
  const eligible = pack.points.filter((p) => isEligible(records.get(p.id)));
  if (eligible.length < MIN_POINTS) {
    return { course: null, warnings: [`この地区で未訪問の地点は${eligible.length}か所です（正解済みと「見つからない」の地点を除く）。新しい地区のパックを追加してください。`] };
  }
  const plan = planOf(pack, req);
  // 出発点から地区までの往復だけで上限を超えるなら作らない
  const center = { lat: (pack.area.bbox[0] + pack.area.bbox[2]) / 2, lon: (pack.area.bbox[1] + pack.area.bbox[3]) / 2 };
  const approach = walkM(plan.start.lat, plan.start.lon, center.lat, center.lon);
  if (plan.fixedEnd && (approach * 2 > plan.maxMeters || (approach * 2) / plan.mPerMin > req.durationMin * 0.8)) {
    return { course: null, warnings: [`出発点から地区までが遠すぎます（片道 約${(approach / 1000).toFixed(1)}km）。所要時間を長くするか、電車を使う移動手段を選んでください。`] };
  }
  const w = new Map(eligible.map((p) => [p.id, weight(p, records.get(p.id), req.month)]));
  // 所要時間が長いほど、離れた地点まで足をのばす（自転車はさらに広く）
  const reach = Math.max(120, 250 * (req.durationMin / 120)) * (plan.mPerMin / WALK_M_PER_MIN);

  let best: { pts: Point[]; score: number } | null = null;
  for (let t = 0; t < trials; t++) {
    const chosen: Point[] = [];
    let cur: LatLon = plan.start;
    while (chosen.length < MAX_POINTS) {
      const ranked = eligible
        .filter((p) => !chosen.includes(p))
        .map((p) => {
          const d = walkM(cur.lat, cur.lon, p.lat, p.lon);
          return { p, s: ((w.get(p.id) ?? 1) / (1 + d / reach)) * (0.4 + rng()) };
        })
        .sort((a, b) => b.s - a.s);
      // 並べ直したうえで時間と距離に収まるかを見る（途中の並びが悪いだけで諦めないため）
      let hit: Point[] | null = null;
      for (const { p } of ranked.slice(0, 12)) {
        const cand = twoOpt(plan, chosen.concat(p));
        if (fits(plan, evaluate(plan, cand))) {
          hit = cand;
          break;
        }
      }
      if (!hit) break;
      const added = hit.find((x) => !chosen.includes(x))!;
      chosen.splice(0, chosen.length, ...hit);
      cur = added;
    }
    if (chosen.length === 0) continue;
    const ordered = twoOpt(plan, chosen);
    const { minutes } = evaluate(plan, ordered);
    const wsum = ordered.reduce((a, p) => a + (w.get(p.id) ?? 1), 0);
    // 地点数と優先度を重視し、所要時間の8〜9割を使うコースを好む
    const score = ordered.length * 20 + wsum * 10 - Math.abs(req.durationMin * 0.85 - minutes) * 0.3;
    if (!best || score > best.score) best = { pts: ordered, score };
  }
  if (!best) return { course: null, warnings: ['時間内に回れる地点がありません。所要時間を長くしてください。'] };
  if (best.pts.length < MIN_POINTS) {
    warnings.push(`時間内に回れるのは${best.pts.length}地点です（目安は${MIN_POINTS}地点以上）。所要時間を長くすると増えます。`);
  }
  const { minutes, meters, end } = evaluate(plan, best.pts);
  const course: Course = {
    id: `c-${Date.now().toString(36)}-${Math.floor(rng() * 1e6).toString(36)}`,
    createdAt: new Date().toISOString(),
    packId: pack.pack_id,
    packVersion: pack.version,
    request: req,
    pointIds: best.pts.map((p) => p.id),
    endStation: end,
    distanceM: Math.round(meters),
    minutes: Math.round(minutes),
  };
  return { course, warnings };
}
