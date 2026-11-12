// 距離と所要時間の目安。経路計算を使わない段階では、直線距離に係数を掛けた値を使う。

export const WALK_M_PER_MIN = 75; // 時速4.5km
export const DETOUR = 1.3; // 直線距離→道のりの係数（目安）
export const DWELL_MIN = 7; // 1地点あたりの探索・解答・短い解説の時間（目安）
export const DWELL_INDOOR_MUSEUM_MIN = 35; // 記念館・博物館に入る場合
export const BIKE_M_PER_MIN = 200; // 時速12km（あきの目安：平地で時速12km程度）
export const SHARE_OVERHEAD_MIN = 10; // シェアサイクルを借りる・返す時間と、駅とポートの間の徒歩（目安）

export function haversine(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function walkM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  return haversine(aLat, aLon, bLat, bLon) * DETOUR;
}

export function walkMin(m: number): number {
  return m / WALK_M_PER_MIN;
}

export function trackMeters(track: [number, number, number][]): number {
  let m = 0;
  for (let i = 1; i < track.length; i++) m += haversine(track[i - 1][0], track[i - 1][1], track[i][0], track[i][1]);
  return m;
}
