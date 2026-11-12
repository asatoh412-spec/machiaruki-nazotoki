// 経路計算（OpenRouteService、使用者自身の無料APIキー。1日2,000回まで）。
// 道のりの距離だけを使い、経路の線は地図に描かない（描くと地点の位置が分かってしまうため）。
export type Profile = 'foot-walking' | 'cycling-regular';

export async function routeMeters(key: string, profile: Profile, coords: { lat: number; lon: number }[]): Promise<number> {
  const r = await fetch(`https://api.openrouteservice.org/v2/directions/${profile}`, {
    method: 'POST',
    headers: { Authorization: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ coordinates: coords.map((c) => [c.lon, c.lat]), instructions: false, geometry: false }),
  });
  if (!r.ok) throw new Error(`経路計算 ${r.status}`);
  const j = await r.json();
  const m = j.routes?.[0]?.summary?.distance;
  if (typeof m !== 'number') throw new Error('経路計算の結果を読めません');
  return m;
}
