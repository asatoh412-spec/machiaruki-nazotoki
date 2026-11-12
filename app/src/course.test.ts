// コース組み立ての検査（node --experimental-strip-types で実行）
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { assemble, pathMeters } from './course.ts';
import type { Pack, PointRecord } from './types.ts';

const pack: Pack = JSON.parse(readFileSync(new URL('../public/packs/shinjuku-ushigome.json', import.meta.url), 'utf8'));

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const iidabashi = pack.stations.find((s) => s.name === '飯田橋')!;
const waseda = pack.stations.find((s) => s.name === '早稲田')!;

for (const [dur, st] of [[60, iidabashi], [120, iidabashi], [240, waseda], [120, waseda]] as const) {
  const r = assemble(pack, { packId: pack.pack_id, durationMin: dur, mode: 'walk', start: { kind: 'station', ...st }, month: 11 }, new Map(), seeded(42));
  assert.ok(r.course, 'コースができる');
  const c = r.course!;
  assert.ok(c.minutes <= dur, `所要時間 ${c.minutes} <= ${dur}`);
  assert.equal(new Set(c.pointIds).size, c.pointIds.length, '地点の重複なし');
  assert.ok(c.pointIds.length <= 8);
  const names = c.pointIds.map((id) => pack.points.find((p) => p.id === id)!.name);
  console.log(`${st.name}発 ${dur}分: ${c.pointIds.length}地点 ${c.distanceM}m ${c.minutes}分 → ${c.endStation.name}着`, r.warnings.join(' '));
  console.log('   ', names.join(' → '));
}

// 除外した地点は使わない
const recs = new Map<string, PointRecord>(pack.points.slice(0, 10).map((p) => [p.id, { id: p.id, status: 'excluded', lastChecked: null, notFoundCount: 2, visits: 1 }]));
const r2 = assemble(pack, { packId: pack.pack_id, durationMin: 240, mode: 'walk', start: { kind: 'station', ...iidabashi }, month: 11 }, recs, seeded(7));
assert.ok(r2.course!.pointIds.every((id) => recs.get(id)?.status !== 'excluded'), '除外地点を含まない');

// 距離関数の基本
assert.equal(Math.round(pathMeters({ lat: 35, lon: 139 }, [], { lat: 35, lon: 139 })), 0);
console.log('ok');

// 自分の自転車（自宅発着）：中野あたりを自宅と仮定
const home = { kind: 'home' as const, lat: 35.7074, lon: 139.6638 };
for (const dur of [120, 240]) {
  const r = assemble(pack, { packId: pack.pack_id, durationMin: dur, mode: 'bike-own', start: home, month: 11, maxMeters: 40000 }, new Map(), seeded(3));
  assert.ok(r.course, '自転車のコースができる');
  const c = r.course!;
  assert.equal(c.endStation.name, '自宅', '自宅に戻る');
  assert.ok(c.minutes <= dur && c.distanceM <= 40000);
  console.log(`自宅発着 自転車 ${dur}分: ${c.pointIds.length}地点 ${c.distanceM}m ${c.minutes}分`, r.warnings.join(' '));
}
// 上限を超える遠さなら作らない
const far = assemble(pack, { packId: pack.pack_id, durationMin: 60, mode: 'bike-own', start: home, month: 11, maxMeters: 5000 }, new Map(), seeded(3));
assert.equal(far.course, null, '往復だけで上限を超えるときは作らない');
// シェアサイクル：駅発、駅着
const sr = assemble(pack, { packId: pack.pack_id, durationMin: 120, mode: 'share', start: { kind: 'station', ...iidabashi }, month: 11, maxMeters: 30000 }, new Map(), seeded(5));
assert.ok(sr.course && sr.course.endStation.name !== '自宅');
console.log(`シェア 飯田橋発 120分: ${sr.course!.pointIds.length}地点 ${sr.course!.distanceM}m ${sr.course!.minutes}分 → ${sr.course!.endStation.name}`);
console.log('modes ok');
