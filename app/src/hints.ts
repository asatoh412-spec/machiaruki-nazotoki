// ヒントの範囲の計算（地図に描く円）
import type { Point } from './types.ts';

// 文字列から決まる疑似乱数（同じ地点・同じ実施なら、ヒントの円はいつも同じ位置）
function seeded(key: string): () => number {
  let h = 2166136261;
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return () => {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    return h / 2 ** 32;
  };
}

// ヒントの範囲の円。中心を地点から半径の55%以内でずらすので、地点は必ず円の中に入る。
export function hintCircle(p: Point, hintIndex: number, runId: string) {
  const h = p.hints[hintIndex];
  const r = seeded(`${runId}:${p.id}:${hintIndex}`);
  const ang = r() * 2 * Math.PI;
  const dist = h.radius_m * 0.55 * Math.sqrt(r());
  const dLat = (dist * Math.sin(ang)) / 111320;
  const dLon = (dist * Math.cos(ang)) / (111320 * Math.cos((p.lat * Math.PI) / 180));
  return { lat: p.lat + dLat, lon: p.lon + dLon, radius: h.radius_m };
}


// 2点間の向き（8方位）と距離の言い方。地図に地名を出さないので、向きと距離で円の場所を伝える。
const DIRS = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
export function bearing(aLat: number, aLon: number, bLat: number, bLon: number): string {
  const y = (bLat - aLat) * 111320;
  const x = (bLon - aLon) * 111320 * Math.cos((aLat * Math.PI) / 180);
  const deg = ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
  return DIRS[Math.round(deg / 45) % 8];
}
export function roughMeters(m: number): string {
  if (m < 1000) return `約${Math.max(50, Math.round(m / 50) * 50)}m`;
  return `約${(m / 1000).toFixed(1)}km`;
}
export function meters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const y = (bLat - aLat) * 111320;
  const x = (bLon - aLon) * 111320 * Math.cos((aLat * Math.PI) / 180);
  return Math.hypot(x, y);
}
// 「〇〇から北東へ約700m」。円の中にいるときは「円の中にいます」
export function guideText(from: { lat: number; lon: number }, c: { lat: number; lon: number; radius: number }, fromName: string): string {
  const d = meters(from.lat, from.lon, c.lat, c.lon);
  if (d <= c.radius) return `${fromName}は探す範囲（半径${c.radius}m）の中です。円の中心は${bearing(from.lat, from.lon, c.lat, c.lon)}へ${roughMeters(d)}。`;
  return `探す範囲（半径${c.radius}mの円）の中心は、${fromName}から${bearing(from.lat, from.lon, c.lat, c.lon)}へ${roughMeters(d)}。`;
}
// 狭まった円が前の円のどのあたりか
export function narrowText(prev: { lat: number; lon: number; radius: number }, next: { lat: number; lon: number; radius: number }): string {
  const d = meters(prev.lat, prev.lon, next.lat, next.lon);
  if (d < prev.radius * 0.2) return `範囲は前の円のほぼ真ん中、半径${next.radius}mに狭まりました。`;
  return `範囲は前の円の${bearing(prev.lat, prev.lon, next.lat, next.lon)}寄り（中心から${roughMeters(d)}）、半径${next.radius}mに狭まりました。`;
}
