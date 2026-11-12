// 画面の共通部品
import type * as maplibregl from 'maplibre-gl';

export const app = document.getElementById('app')!;
let currentMap: maplibregl.Map | null = null;
let cleanups: (() => void)[] = [];

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const km = (m: number) => (m / 1000).toFixed(1);
export const DUR_LABEL: Record<number, string> = { 60: '1時間', 120: '2時間', 240: '半日' };

// 画面を切り替える。前の画面の地図と位置情報の監視は片付ける。
export function render(html: string) {
  cleanups.forEach((f) => f());
  cleanups = [];
  currentMap?.remove();
  currentMap = null;
  app.innerHTML = html;
  window.scrollTo(0, 0);
}

export function setMap(m: maplibregl.Map | null) {
  currentMap = m;
}

export function onLeave(fn: () => void) {
  cleanups.push(fn);
}

export function on(sel: string, ev: string, fn: (e: Event) => void) {
  app.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, fn));
}

export function sourcesHtml(sources: { title: string; publisher: string; url: string }[]): string {
  return `<ul class="sources">${sources
    .map((s) => `<li><a href="${esc(s.url)}" target="_blank">${esc(s.title)}</a>（${esc(s.publisher)}）</li>`)
    .join('')}</ul>`;
}
