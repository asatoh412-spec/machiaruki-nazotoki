import assert from 'node:assert/strict';
import { summarize, sunsetOf } from './sky.ts';

// 東京・2026-11-12 の日没（国立天文台の暦では16時34分前後。ライブラリの精度は約1分）
const ss = sunsetOf(new Date('2026-11-12T03:00:00Z'), 35.70, 139.73);
const jst = new Date(ss.getTime() + 9 * 3600000).toISOString().slice(11, 16);
console.log('日没(JST)', jst);
assert.ok(jst >= '16:28' && jst <= '16:40', '東京の11月中旬の日没は16時半ごろ');

// 予報の取り出し（10:00 JST 出発、120分 → 10時〜12時台）
const h = {
  time: ['2026-11-12T09:00', '2026-11-12T10:00', '2026-11-12T11:00', '2026-11-12T12:00', '2026-11-12T13:00'],
  temperature_2m: [9, 10, 11, 12, 13],
  precipitation_probability: [80, 20, 30, 60, 90],
  precipitation: [1, 0, 0, 0.3, 2],
};
const s = summarize(h, new Date('2026-11-12T01:00:00Z'), 120);
console.log(s);
assert.equal(s.minTemp, 10);
assert.equal(s.maxProb, 60);
assert.equal(s.rainy, true);
assert.equal(s.cold, true);
console.log('sky ok');
