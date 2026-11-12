import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isCorrect, normalize } from './judge.ts';
import { hintCircle } from './hints.ts';
import { haversine } from './geo.ts';
import type { Pack } from './types.ts';

assert.equal(normalize('ﾌﾞﾝｹｲ 　・ジ'), normalize('ぶんけいじ'));
assert.ok(isCorrect('柳田國男', ['柳田国男']));
assert.ok(isCorrect('やなぎだ くにお', ['やなぎだくにお']));
assert.ok(isCorrect('ヤナギダクニオ', ['やなぎだくにお']));
assert.ok(isCorrect('市ヶ谷', ['市ケ谷']));
assert.ok(isCorrect('ＤＯＯＬＩＴＴＬＥ', ['Doolittle']));
assert.ok(!isCorrect('柳田', ['柳田國男', 'やなぎだくにお']), '姓だけは不正解');
assert.ok(!isCorrect('', ['善国寺']));
assert.ok(isCorrect('善國寺', ['善国寺']));

const pack: Pack = JSON.parse(readFileSync(new URL('../public/packs/shinjuku-ushigome.json', import.meta.url), 'utf8'));
// 正式な表記・読み（ひらがな）が必ず通ること
for (const p of pack.points) {
  assert.ok(isCorrect(p.answer.display, p.answer.accept), `${p.name}: 正式表記`);
  for (let i = 0; i < p.hints.length; i++) {
    for (const run of ['r-a', 'r-b', 'r-c']) {
      const c = hintCircle(p, i, run);
      assert.ok(haversine(c.lat, c.lon, p.lat, p.lon) < c.radius, `${p.name}: ヒント${i + 1}の円に地点が入る`);
    }
  }
}
console.log('judge ok');
