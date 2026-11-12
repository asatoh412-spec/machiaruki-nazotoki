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

