// 地図（MapLibre＋地理院タイル）。地点の正確な位置は出さず、地区の範囲・駅・ヒントの範囲・現在地だけを描く。
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre の描画用ワーカーを Vite に同梱させる
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { Pack, Station } from './types.ts';

maplibregl.setWorkerUrl(workerUrl);

const GSI_ATTR = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">地理院地図Vector（国土地理院）</a>';
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export function createMap(el: HTMLElement, pack: Pack, marks: { station: Station; label: string }[]): maplibregl.Map {
  const [s, w, n, e] = pack.area.bbox;
  const map = new maplibregl.Map({
    container: el,
    style: {
      version: 8,
      sources: {
        // 地理院地図Vector。注記（地名・寺社名などの文字）の層は使わない（謎の答えが地図に出てしまうため）
        gsi: {
          type: 'vector',
          tiles: ['https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/{z}/{x}/{y}.pbf'],
          minzoom: 4,
          maxzoom: 16,
          attribution: GSI_ATTR,
        },
        area: {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
          },
        },
        hint: { type: 'geojson', data: EMPTY },
        me: { type: 'geojson', data: EMPTY },
      },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': '#f3efe6' } },
        { id: 'water', type: 'fill', source: 'gsi', 'source-layer': 'WA', paint: { 'fill-color': '#bcd6e6' } },
        { id: 'bld', type: 'fill', source: 'gsi', 'source-layer': 'BldA', minzoom: 14, paint: { 'fill-color': '#e2d9c8', 'fill-outline-color': '#cfc3ad' } },
        { id: 'road-edge', type: 'line', source: 'gsi', 'source-layer': 'RdEdg', minzoom: 15, paint: { 'line-color': '#c9bfae', 'line-width': 0.8 } },
        {
          id: 'road', type: 'line', source: 'gsi', 'source-layer': 'RdCL',
          paint: {
            'line-color': ['match', ['get', 'vt_rdctg'], '国道', '#f2c46d', '都道府県道', '#f6dc9c', '#ffffff'],
            'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.6, 15, 2.5, 18, 8],
          },
        },
        { id: 'rail', type: 'line', source: 'gsi', 'source-layer': 'RailCL', filter: ['!=', ['get', 'vt_railstate'], '地下'], paint: { 'line-color': '#8c8c8c', 'line-width': 1.5 } },
        { id: 'area-fill', type: 'fill', source: 'area', paint: { 'fill-color': '#b0412e', 'fill-opacity': 0.06 } },
        { id: 'area-line', type: 'line', source: 'area', paint: { 'line-color': '#b0412e', 'line-width': 2, 'line-dasharray': [2, 1] } },
        { id: 'hint-fill', type: 'fill', source: 'hint', paint: { 'fill-color': '#d98c2b', 'fill-opacity': 0.2 } },
        { id: 'hint-line', type: 'line', source: 'hint', paint: { 'line-color': '#b8681a', 'line-width': 2 } },
        { id: 'me', type: 'circle', source: 'me', paint: { 'circle-radius': 7, 'circle-color': '#2463c7', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } },
      ],
    },
    bounds: [[w, s], [e, n]],
    fitBoundsOptions: { padding: 24 },
    attributionControl: { compact: true },
  });
  for (const m of marks) {
    const div = document.createElement('div');
    div.className = 'station-mark';
    div.textContent = m.label;
    new maplibregl.Marker({ element: div }).setLngLat([m.station.lon, m.station.lat]).addTo(map);
  }
  return map;
}

function whenLoaded(map: maplibregl.Map, fn: () => void) {
  if (map.isStyleLoaded()) fn();
  else map.once('load', fn);
}

function circle(lat: number, lon: number, radiusM: number): GeoJSON.Feature {
  const pts: [number, number][] = [];
  const dLat = radiusM / 111320;
  const dLon = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    pts.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [pts] } };
}

// ヒントの範囲。中心は地点からずらしてあり、円の中に地点が入る。
export function showHintCircle(map: maplibregl.Map, c: { lat: number; lon: number; radius: number } | null, fit = true) {
  whenLoaded(map, () => {
    const src = map.getSource('hint') as maplibregl.GeoJSONSource;
    if (!c) return src.setData(EMPTY);
    src.setData(circle(c.lat, c.lon, c.radius));
    if (fit) {
      const dLat = c.radius / 111320;
      const dLon = c.radius / (111320 * Math.cos((c.lat * Math.PI) / 180));
      map.fitBounds([[c.lon - dLon, c.lat - dLat], [c.lon + dLon, c.lat + dLat]], { padding: 30, maxZoom: 18 });
    }
  });
}

export function showMe(map: maplibregl.Map, lat: number, lon: number) {
  whenLoaded(map, () => {
    (map.getSource('me') as maplibregl.GeoJSONSource).setData({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [lon, lat] } });
  });
}

// 古地図（今昔マップ on the web の首都圏データ）。解説の画面だけで使う（答えのあとなので地点の位置を出してよい）。
// 利用条件: 外部アプリからの表示は可。画面に「今昔マップ on the web」を表示する。タイルの保存・再配信はしない。
export const OLD_PERIODS = [
  { id: 'now', label: '現在' },
  { id: '2man', label: '明治（1896-1909）' },
  { id: '00', label: '大正（1917-1924）' },
  { id: '01', label: '昭和初期（1927-1939）' },
  { id: '02', label: '戦後（1944-1954）' },
] as const;
const KJ_ATTR = '<a href="https://ktgis.net/kjmapw/" target="_blank">今昔マップ on the web（谷謙二）</a>';

export function createOldMap(el: HTMLElement, lat: number, lon: number): { map: maplibregl.Map; setPeriod: (id: string) => void } {
  const sources: Record<string, maplibregl.SourceSpecification> = {
    gsi: { type: 'vector', tiles: ['https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/{z}/{x}/{y}.pbf'], minzoom: 4, maxzoom: 16, attribution: GSI_ATTR },
  };
  const layers: maplibregl.LayerSpecification[] = [
    { id: 'bg', type: 'background', paint: { 'background-color': '#f3efe6' } },
    { id: 'water', type: 'fill', source: 'gsi', 'source-layer': 'WA', paint: { 'fill-color': '#bcd6e6' } },
    { id: 'bld', type: 'fill', source: 'gsi', 'source-layer': 'BldA', minzoom: 14, paint: { 'fill-color': '#e2d9c8' } },
    { id: 'road', type: 'line', source: 'gsi', 'source-layer': 'RdCL', paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.6, 15, 2.5, 18, 8] } },
  ];
  for (const p of OLD_PERIODS) {
    if (p.id === 'now') continue;
    sources[`kj${p.id}`] = { type: 'raster', tiles: [`https://ktgis.net/kjmapw/kjtilemap/tokyo50/${p.id}/{z}/{x}/{y}.png`], scheme: 'tms', tileSize: 256, minzoom: 8, maxzoom: 15, attribution: KJ_ATTR };
    layers.push({ id: `kj${p.id}`, type: 'raster', source: `kj${p.id}`, layout: { visibility: 'none' } });
  }
  const map = new maplibregl.Map({
    container: el,
    style: { version: 8, sources, layers },
    center: [lon, lat],
    zoom: 15,
    maxZoom: 16.5,
    attributionControl: { compact: true },
  });
  const dot = document.createElement('div');
  dot.className = 'spot-mark';
  new maplibregl.Marker({ element: dot }).setLngLat([lon, lat]).addTo(map);
  const setPeriod = (id: string) =>
    whenLoaded(map, () => {
      for (const p of OLD_PERIODS) if (p.id !== 'now') map.setLayoutProperty(`kj${p.id}`, 'visibility', p.id === id ? 'visible' : 'none');
    });
  return { map, setPeriod };
}

// シェアサイクルのポート（地区の中）。台数0は薄く描く。
export function showPorts(map: maplibregl.Map, ports: { lat: number; lon: number; op: string; bikes: number }[]) {
  whenLoaded(map, () => {
    const data: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: ports.map((p) => ({ type: 'Feature', properties: { op: p.op, bikes: p.bikes }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } })),
    };
    const src = map.getSource('ports') as maplibregl.GeoJSONSource | undefined;
    if (src) return src.setData(data);
    map.addSource('ports', { type: 'geojson', data });
    map.addLayer({
      id: 'ports',
      type: 'circle',
      source: 'ports',
      paint: {
        'circle-radius': 4,
        'circle-color': ['match', ['get', 'op'], 'docomo', '#c8102e', '#f5a300'],
        'circle-opacity': ['case', ['>', ['get', 'bikes'], 0], 0.9, 0.3],
        'circle-stroke-color': '#fff',
        'circle-stroke-width': 1,
      },
    });
  });
}

// ---------- 地区を地図で選ぶ ----------
// 各地区の地点を囲む枠（地点の凸包を約250m広げた多角形）を描き、枠をタップして選ぶ。
// 地点の位置そのものは出さない（枠だけ）。枠が重なる所では、小さい方の地区を選ぶ。
export function packOutline(pack: Pack): [number, number][] {
  const pad = 250;
  const pts: [number, number][] = [];
  for (const p of pack.points) {
    const dLat = pad / 111320;
    const dLon = pad / (111320 * Math.cos((p.lat * Math.PI) / 180));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * 2 * Math.PI;
      pts.push([p.lon + dLon * Math.cos(a), p.lat + dLat * Math.sin(a)]);
    }
  }
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  hull.push(hull[0]);
  return hull;
}

function ringArea(r: [number, number][]): number {
  let s = 0;
  for (let i = 1; i < r.length; i++) s += r[i - 1][0] * r[i][1] - r[i][0] * r[i - 1][1];
  return Math.abs(s / 2);
}

const shortTitle = (t: string) => t.replace(/（.*?）/g, '');

export function createPackPicker(
  el: HTMLElement,
  packs: Pack[],
  selected: string,
  onPick: (packId: string) => void,
  home?: { lat: number; lon: number } | null,
): { map: maplibregl.Map; select: (packId: string) => void } {
  const fc: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: packs.map((p) => {
      const ring = packOutline(p);
      return { type: 'Feature', properties: { id: p.pack_id, area: ringArea(ring), sel: p.pack_id === selected ? 1 : 0 }, geometry: { type: 'Polygon', coordinates: [ring] } };
    }),
  };
  const all = fc.features.flatMap((f) => (f.geometry as GeoJSON.Polygon).coordinates[0]);
  const lons = all.map((c) => c[0]);
  const lats = all.map((c) => c[1]);
  const map = new maplibregl.Map({
    container: el,
    style: {
      version: 8,
      sources: {
        gsi: { type: 'vector', tiles: ['https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/{z}/{x}/{y}.pbf'], minzoom: 4, maxzoom: 16, attribution: GSI_ATTR },
        packs: { type: 'geojson', data: fc },
      },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': '#f3efe6' } },
        { id: 'water', type: 'fill', source: 'gsi', 'source-layer': 'WA', paint: { 'fill-color': '#bcd6e6' } },
        { id: 'road', type: 'line', source: 'gsi', 'source-layer': 'RdCL', paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.3, 14, 1.5] } },
        { id: 'rail', type: 'line', source: 'gsi', 'source-layer': 'RailCL', filter: ['!=', ['get', 'vt_railstate'], '地下'], paint: { 'line-color': '#8c8c8c', 'line-width': 1 } },
        { id: 'packs-fill', type: 'fill', source: 'packs', paint: { 'fill-color': ['case', ['==', ['get', 'sel'], 1], '#b0412e', '#2f5d3a'], 'fill-opacity': ['case', ['==', ['get', 'sel'], 1], 0.28, 0.1] } },
        { id: 'packs-line', type: 'line', source: 'packs', paint: { 'line-color': ['case', ['==', ['get', 'sel'], 1], '#b0412e', '#2f5d3a'], 'line-width': ['case', ['==', ['get', 'sel'], 1], 3, 1.5] } },
      ],
    },
    bounds: [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
    fitBoundsOptions: { padding: 20 },
    attributionControl: { compact: true },
  });
  // 地区名の札（地図の文字の層は使わないので HTML で置く）
  const labels = new Map<string, HTMLElement>();
  for (const p of packs) {
    const ring = packOutline(p);
    const lon = ring.reduce((s, c) => s + c[0], 0) / ring.length;
    const lat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
    const div = document.createElement('button');
    div.type = 'button';
    div.className = 'pack-label' + (p.pack_id === selected ? ' chosen' : '');
    div.textContent = shortTitle(p.title).split('・')[0];
    div.addEventListener('click', (e) => {
      e.stopPropagation();
      select(p.pack_id);
      onPick(p.pack_id);
    });
    labels.set(p.pack_id, div);
    new maplibregl.Marker({ element: div }).setLngLat([lon, lat]).addTo(map);
  }
  if (home) {
    const h = document.createElement('div');
    h.className = 'station-mark';
    h.textContent = '自宅';
    new maplibregl.Marker({ element: h }).setLngLat([home.lon, home.lat]).addTo(map);
  }
  // 引いた縮尺では札が重なるので、選んだ地区の札だけ出す。拡大すると全部の札を出す
  const syncLabels = () => el.classList.toggle('zoomed', map.getZoom() >= 12.6);
  map.on('zoom', syncLabels);
  whenLoaded(map, syncLabels);
  const select = (id: string) => {
    for (const f of fc.features) f.properties!.sel = f.properties!.id === id ? 1 : 0;
    whenLoaded(map, () => (map.getSource('packs') as maplibregl.GeoJSONSource).setData(fc));
    labels.forEach((el, k) => el.classList.toggle('chosen', k === id));
  };
  map.on('click', 'packs-fill', (e) => {
    const hits = (e.features ?? []).slice().sort((a, b) => (a.properties!.area as number) - (b.properties!.area as number));
    if (!hits.length) return;
    const id = hits[0].properties!.id as string;
    select(id);
    onPick(id);
  });
  return { map, select };
}
