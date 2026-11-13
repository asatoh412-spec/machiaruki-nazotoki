// 同梱の全パックの検査：形式、地点IDの重複、どの駅からもコースができるか
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { assemble } from './course.ts';
import { validatePackShape } from './packcheck.ts';
import type { Pack } from './types.ts';

const dir = new URL('../public/packs/', import.meta.url);
const files: string[] = JSON.parse(readFileSync(new URL('index.json', dir), 'utf8'));
const seen = new Map<string, string>();
let rnd = 1;
const rng = () => ((rnd = (rnd * 1664525 + 1013904223) >>> 0) / 2 ** 32);
for (const f of files) {
  const pack: Pack = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
  assert.deepEqual(validatePackShape(pack), [], f);
  for (const p of pack.points) {
    assert.ok(!seen.has(p.id), `${p.id} が ${seen.get(p.id)} と ${f} で重複`);
    seen.set(p.id, f);
    assert.equal(p.hints.length, 3, `${p.name}: ヒントは3つ`);
  }
  const made = pack.stations.filter((st) => assemble(pack, { packId: pack.pack_id, durationMin: 120, mode: 'walk', start: { kind: 'station', ...st }, month: 11 }, new Map(), rng).course).length;
  assert.ok(made >= 1, `${f}: コースが作れる駅がある`);
  console.log(`${pack.title}: ${pack.points.length}地点、駅${pack.stations.length}（120分のコースができる駅 ${made}）`);
}
console.log('packs ok');
