import { bearing, guideText, hintCircle, narrowText, roughMeters } from './hints.ts';
const eq = (a: unknown, b: unknown, m: string) => { if (a !== b) { console.error('NG', m, a, b); process.exit(1); } };
eq(bearing(35.7, 139.7, 35.71, 139.7), '北', '北');
eq(bearing(35.7, 139.7, 35.7, 139.71), '東', '東');
eq(bearing(35.7, 139.7, 35.69, 139.69), '南西', '南西');
eq(roughMeters(712), '約700m', '700');
eq(roughMeters(10), '約50m', '50');
eq(roughMeters(1530), '約1.5km', 'km');
const p: any = { id: 'x', lat: 35.7, lon: 139.7, hints: [{ radius_m: 500 }, { radius_m: 250 }, { radius_m: 100 }] };
for (let i = 0; i < 3; i++) {
  const c = hintCircle(p, i, 'r');
  const y = (c.lat - p.lat) * 111320, x = (c.lon - p.lon) * 111320 * Math.cos((35.7 * Math.PI) / 180);
  if (Math.hypot(x, y) > c.radius) { console.error('地点が円の外'); process.exit(1); }
}
const g = guideText({ lat: 35.69, lon: 139.7 }, hintCircle(p, 0, 'r'), '新宿駅');
if (!g.includes('新宿駅から') || !g.includes('へ約')) { console.error('NG guide', g); process.exit(1); }
console.log(g, '/', narrowText(hintCircle(p, 0, 'r'), hintCircle(p, 1, 'r')));
console.log('hints ok');
