// 記録の書き出し。Cowork の作業の場でパックを直し、時間の見積もりを実測値に合わせるための材料。
// 位置の軌跡（track）は書き出さない（距離と時間だけにする）。
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import * as db from './store.ts';
import { trackMeters } from './geo.ts';
import { allLegs, statsOf } from './timing.ts';

export async function buildExport() {
  const [packs, runs, records, courses] = await Promise.all([db.listPacks(), db.listRuns(), db.allRecords(), db.listCourses()]);
  const name = new Map(packs.flatMap((p) => p.points.map((x) => [x.id, x.name] as const)));
  const byPoint = new Map<string, { ratings: string[]; memos: string[]; hintsUsed: number[]; arrivedByGps: boolean[]; photoJudges: unknown[] }>();
  for (const r of runs) {
    for (const s of r.results) {
      const e = byPoint.get(s.pointId) ?? { ratings: [], memos: [], hintsUsed: [], arrivedByGps: [], photoJudges: [] };
      if (s.rating) e.ratings.push(s.rating);
      if (s.memo) e.memos.push(s.memo);
      e.hintsUsed.push(s.hintsUsed);
      e.arrivedByGps.push(s.arrivedByGps);
      if (s.photoJudge) e.photoJudges.push(...s.photoJudge);
      byPoint.set(s.pointId, e);
    }
  }
  const course = new Map(courses.map((c) => [c.id, c]));
  const legs = await allLegs();
  return {
    schema: 'machiaruki-records/1',
    exported_at: new Date().toISOString(),
    packs: packs.map((p) => ({ pack_id: p.pack_id, version: p.version })),
    points: records.map((r) => ({ ...r, name: name.get(r.id) ?? null, ...(byPoint.get(r.id) ?? {}) })),
    runs: runs
      .filter((r) => r.finishedAt)
      .map((r) => {
        const c = course.get(r.courseId);
        return {
          pack_id: r.packId,
          aborted: !!r.aborted,
          started_at: r.startedAt,
          finished_at: r.finishedAt,
          minutes: Math.round((Date.parse(r.finishedAt!) - Date.parse(r.startedAt)) / 60000),
          walked_m: Math.round(trackMeters(r.track)),
          estimate: c ? { minutes: c.minutes, distance_m: c.distanceM, points: c.pointIds.length, duration_min: c.request.durationMin } : null,
          mode: c?.request.mode ?? null,
          start_kind: c?.request.start.kind ?? null,
          departed_at: r.departedAt ?? null,
          results: r.results.map((s) => ({
            id: s.pointId,
            outcome: s.outcome,
            method: s.method ?? 'text',
            shown_at: s.shownAt ?? null,
            arrived_at: s.arrivedAt ?? null,
            at: s.at,
            interrupted: !!s.interrupted,
            hints_used: s.hintsUsed,
          })),
        };
      }),
    // 地点ごとの時間（移動・探す・読む、分）と、平均に使えるか。速さは直線距離×1.3で測る
    legs: legs.map((l) => ({ id: l.pointId, mode: l.mode, museum: l.museum, meters: Math.round(l.meters), est_travel_min: +l.estTravelMin.toFixed(1), travel_min: l.travelMin === null ? null : +l.travelMin.toFixed(1), search_min: l.searchMin === null ? null : +l.searchMin.toFixed(1), read_min: l.readMin === null ? null : +l.readMin.toFixed(1), usable: l.usable, why: l.why })),
    timing: statsOf(legs),
  };
}

export async function exportRecords(): Promise<string> {
  const data = JSON.stringify(await buildExport(), null, 1);
  const d = new Date();
  const fname = `machiaruki-records-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
  if (!Capacitor.isNativePlatform()) {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([data], { type: 'application/json' })), download: fname });
    a.click();
    return fname;
  }
  const w = await Filesystem.writeFile({ path: fname, data, directory: Directory.Cache, encoding: Encoding.UTF8 });
  await Share.share({ title: '街歩き謎解きの記録', files: [w.uri], dialogTitle: '記録の送り先を選ぶ' });
  return fname;
}
