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
