// シェアサイクルのポートと台数（公共交通オープンデータセンターのGBFS、キー不要の公開API）。
// ライセンス: CC BY 4.0 系。提供者名を表示する。正確性は保証されない（参考値として取得時刻を出す）。
// ポートの位置（station_information）は大きい（HELLO CYCLINGで約8MB）ので、必要な項目だけを端末に保存し、7日ごとに取り直す。
// 台数（station_status）は使うときだけ取る（HELLO CYCLINGで約4MB）。
import { createStore, get, set } from 'idb-keyval';
import { haversine, DETOUR } from './geo.ts';

export type Operator = 'docomo' | 'hello';

export const OPERATORS: Record<Operator, { label: string; system: string; credit: string }> = {
  docomo: { label: 'ドコモ・バイクシェア', system: 'docomo-cycle-tokyo', credit: '株式会社ドコモ・バイクシェア / 公共交通オープンデータ協議会（CC BY 4.0）' },
  hello: { label: 'HELLO CYCLING', system: 'hellocycling', credit: 'OpenStreet株式会社 / 公共交通オープンデータ協議会（CC BY 4.0）' },
};
const BASE = 'https://api-public.odpt.org/api/v4/gbfs';
const INFO_TTL_MS = 7 * 24 * 3600 * 1000;

export interface Port {
  op: Operator;
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export interface PortStatus {
  bikes: number; // 借りられる台数
  docks: number; // 返せる空き
  renting: boolean;
  returning: boolean;
}

export interface PortView extends Port, Partial<PortStatus> {
  walkM: number; // 駅などからの徒歩距離の目安
}

const cache = createStore('machiaruki-gbfs', 'gbfs');

async function fetchJson(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

export async function ports(op: Operator, force = false): Promise<Port[]> {
  const key = `info:${op}`;
  const hit = await get<{ at: number; ports: Port[] }>(key, cache);
  if (hit && !force && Date.now() - hit.at < INFO_TTL_MS) return hit.ports;
  const j = await fetchJson(`${BASE}/${OPERATORS[op].system}/station_information.json`);
  const list: Port[] = j.data.stations.map((s: { station_id: string; name: string; lat: number; lon: number }) => ({ op, id: String(s.station_id), name: s.name, lat: s.lat, lon: s.lon }));
  await set(key, { at: Date.now(), ports: list }, cache);
  return list;
}

export async function statuses(op: Operator): Promise<{ at: Date; map: Map<string, PortStatus> }> {
  const j = await fetchJson(`${BASE}/${OPERATORS[op].system}/station_status.json`);
  const map = new Map<string, PortStatus>();
  for (const s of j.data.stations) {
    map.set(String(s.station_id), { bikes: s.num_bikes_available ?? 0, docks: s.num_docks_available ?? 0, renting: !!s.is_renting, returning: !!s.is_returning });
  }
  const at = j.last_updated ? new Date(j.last_updated * 1000) : new Date();
  return { at, map };
}

// 地点の周りのポート（徒歩距離の目安で並べる）
export function near(list: Port[], lat: number, lon: number, maxWalkM: number): (Port & { walkM: number })[] {
  return list
    .map((p) => ({ ...p, walkM: haversine(lat, lon, p.lat, p.lon) * DETOUR }))
    .filter((p) => p.walkM <= maxWalkM)
    .sort((a, b) => a.walkM - b.walkM);
}

export interface ShareCheck {
  at: Date[];
  start: PortView[]; // 起点の駅から徒歩1km以内
  end: PortView[]; // 終点の駅から徒歩1km以内
  along: PortView[]; // 地区の中（途中の乗り換え用）
  startOk: boolean; // 借りられるポートが2か所以上（2社合算）
  endOk: Record<Operator, boolean>; // 会社ごとに、返せるポートが1か所以上
  usable: Operator[]; // 起点で借りられて、終点で返せる会社
  errors: string[];
}

// 仕様: 起点の駅は徒歩1km以内に（2社合算で）借りられるポートが2か所以上。終点は返せる空きのあるポートが1か所以上。
// 借りた会社のポートにしか返せないので、会社ごとに起点と終点の両方を満たすかも見る。
export async function checkShare(
  start: { lat: number; lon: number },
  end: { lat: number; lon: number },
  bbox: [number, number, number, number],
): Promise<ShareCheck> {
  const res: ShareCheck = { at: [], start: [], end: [], along: [], startOk: false, endOk: { docomo: false, hello: false }, usable: [], errors: [] };
  for (const op of Object.keys(OPERATORS) as Operator[]) {
    try {
      const [list, st] = await Promise.all([ports(op), statuses(op)]);
      res.at.push(st.at);
      const view = (p: Port & { walkM: number }): PortView => ({ ...p, ...st.map.get(p.id) });
      const s = near(list, start.lat, start.lon, 1000).map(view);
      const e = near(list, end.lat, end.lon, 1000).map(view);
      const [S, W, N, E] = bbox;
      const a = list.filter((p) => p.lat >= S && p.lat <= N && p.lon >= W && p.lon <= E).map((p) => view({ ...p, walkM: 0 }));
      res.start.push(...s);
      res.end.push(...e);
      res.along.push(...a);
      const canRent = s.some((p) => p.renting && (p.bikes ?? 0) > 0);
      res.endOk[op] = e.some((p) => p.returning && (p.docks ?? 0) > 0);
      if (canRent && res.endOk[op]) res.usable.push(op);
    } catch (err) {
      res.errors.push(`${OPERATORS[op].label}の情報を取れませんでした（${String(err)}）`);
    }
  }
  res.start.sort((a, b) => a.walkM - b.walkM);
  res.end.sort((a, b) => a.walkM - b.walkM);
  res.startOk = res.start.filter((p) => p.renting && (p.bikes ?? 0) > 0).length >= 2;
  return res;
}
