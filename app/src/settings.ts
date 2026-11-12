// 設定（端末内）
import { createStore, get, set } from 'idb-keyval';

const store = createStore('machiaruki-settings', 'settings');

export interface Settings {
  arrivalRadiusM: number | null; // null ならパックの値（初期値50m）
  home: { lat: number; lon: number } | null; // 自宅の位置（端末内だけに保存。書き出しにも含めない）
  bikeMaxKm: number; // 自分の自転車の1周の上限（初期値40km、55kmまで）
  shareMaxKm: number; // シェアサイクル区間の上限（初期値30km）
  orsKey: string; // OpenRouteService のAPIキー（任意）
  claudeKey: string; // 写真で答える機能の Claude API キー（任意）
  photoModel: string; // 写真の判定に使うモデル
}

const DEFAULTS: Settings = { arrivalRadiusM: null, home: null, bikeMaxKm: 40, shareMaxKm: 30, orsKey: '', claudeKey: '', photoModel: 'claude-sonnet-5-5' };

export async function getSettings(): Promise<Settings> {
  return { ...DEFAULTS, ...((await get<Partial<Settings>>('settings', store)) ?? {}) };
}

export async function saveSettings(s: Settings) {
  await set('settings', s, store);
}
