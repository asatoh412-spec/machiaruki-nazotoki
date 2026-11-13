// 地点ごとの時間の検査
import assert from 'node:assert/strict';
import { legsOf, median, statsOf } from './timing.ts';
import type { Course, Point, Run } from './types.ts';

const pt = (id: string, lat: number, kind = '寺社') => ({ id, lat, lon: 139.73, kind }) as unknown as Point;
const pts = [pt('a', 35.700), pt('b', 35.705), pt('c', 35.710, '博物館')];
const course = { id: 'c1', request: { mode: 'walk', start: { kind: 'station', name: 'x', lat: 35.695, lon: 139.73 } }, pointIds: ['a', 'b', 'c'] } as unknown as Course;
const t = (m: number) => new Date(Date.UTC(2026, 10, 13, 1, 0) + m * 60000).toISOString();
const r = (id: string, shown: number, arr: number | null, at: number, extra = {}) => ({ pointId: id, outcome: 'correct', hintsUsed: 0, arrivedByGps: arr !== null, rating: null, shownAt: t(shown), arrivedAt: arr === null ? undefined : t(arr), at: t(at), ...extra });
const run = { id: 'r', courseId: 'c1', packId: 'p', startedAt: t(-5), finishedAt: t(80), index: 3, hintsShown: 0, track: [], results: [r('a', 0, 9, 12), r('b', 15, 23, 26), r('c', 30, 38, 70)] } as unknown as Run;

let legs = legsOf(run, course, pts);
assert.equal(legs[0].usable, false); // 出発の記録なし
assert.equal(legs[0].why, '出発の記録なし');
assert.equal(legs[1].travelMin, 8);
assert.equal(legs[1].searchMin, 3);
assert.equal(legs[1].readMin, 4);
assert.equal(legs[2].readMin, null);
assert.ok(Math.abs(legs[1].meters - 556 * 1.3) < 10);

run.departedAt = t(1);
legs = legsOf(run, course, pts);
assert.equal(legs[0].usable, true);
assert.equal(legs[0].travelMin, 8);
const st = statsOf(legs);
assert.equal(st.speed.walk.n, 3);
assert.equal(st.dwell.normal.n, 2); // a: 3+3, b: 3+4（c は最後なので読む時間なし）
assert.equal(st.dwell.normal.min, 6.5);

(run.results[1] as { interrupted?: boolean }).interrupted = true;
assert.equal(legsOf(run, course, pts)[1].why, '中断した');
// 寄り道（見積もりの3倍以上）
run.results[1] = r('b', 15, 75, 78) as never;
assert.match(legsOf(run, course, pts)[1].why, /3倍/);
assert.equal(median([5, 1, 3, 100]), 4);
console.log('timing ok');
