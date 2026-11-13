// 端末内の保存（IndexedDB）。パック、地点ごとの記録、保存したコース。
import { createStore, get, set, del, keys, getMany } from 'idb-keyval';
import type { Course, Pack, PointRecord, Run } from './types.ts';

const packs = createStore('machiaruki-packs', 'packs');
const records = createStore('machiaruki-records', 'records');
const courses = createStore('machiaruki-courses', 'courses');

export async function listPacks(): Promise<Pack[]> {
  const ks = await keys(packs);
  return (await getMany(ks, packs)) as Pack[];
}
export const getPack = (id: string) => get<Pack>(id, packs);
export const putPack = (p: Pack) => set(p.pack_id, p, packs);
export const deletePack = (id: string) => del(id, packs);

export async function recordsFor(ids: string[]): Promise<Map<string, PointRecord>> {
  const vals = (await getMany(ids, records)) as (PointRecord | undefined)[];
  const m = new Map<string, PointRecord>();
  vals.forEach((v) => v && m.set(v.id, v));
  return m;
}
export const putRecord = (r: PointRecord) => set(r.id, r, records);

export async function listCourses(): Promise<Course[]> {
  const ks = await keys(courses);
  const cs = (await getMany(ks, courses)) as Course[];
  return cs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export const getCourse = (id: string) => get<Course>(id, courses);
export const putCourse = (c: Course) => set(c.id, c, courses);
export const deleteCourse = (id: string) => del(id, courses);

// パックの検査。形式が違うファイルを読み込まないようにする。
export { validatePackShape as validatePack } from './packcheck.ts';

// 実施の記録
const runs = createStore('machiaruki-runs', 'runs');
export async function listRuns(): Promise<Run[]> {
  const ks = await keys(runs);
  const rs = (await getMany(ks, runs)) as Run[];
  return rs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
export const getRun = (id: string) => get<Run>(id, runs);
export const putRun = (r: Run) => set(r.id, r, runs);
export const deleteRun = (id: string) => del(id, runs);

// 地点の結果を記録に反映する。正解なら済にし、「見つからない」なら以後のコースから外す。
export async function applyResult(pointId: string, outcome: 'correct' | 'notfound', today: string) {
  const cur = (await get<PointRecord>(pointId, records)) ?? { id: pointId, status: 'unverified', lastChecked: null, notFoundCount: 0, visits: 0 };
  if (outcome === 'correct') {
    cur.visits += 1;
    cur.lastChecked = today;
    cur.status = 'verified';
  } else {
    cur.notFoundCount += 1;
    cur.status = 'excluded';
  }
  await set(pointId, cur, records);
}

// 「見つからない」で外した地点を、もう一度コースに出すようにする
export async function restorePoint(pointId: string) {
  const cur = await get<PointRecord>(pointId, records);
  if (!cur) return;
  cur.status = cur.visits > 0 ? 'verified' : 'unverified';
  await set(pointId, cur, records);
}

export async function allRecords(): Promise<PointRecord[]> {
  const ks = await keys(records);
  return (await getMany(ks, records)) as PointRecord[];
}
