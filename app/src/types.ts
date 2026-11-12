// 素材パック（machiaruki-pack/1）の型。仕様書_v2.md と packs/素材パックの作り方.md に対応する。

export interface Source {
  title: string;
  publisher: string;
  url: string;
  kind: string;
  accessed: string;
}

export interface Hint {
  text: string;
  radius_m: number;
}

export interface Answer {
  prompt: string;
  display: string;
  accept: string[];
  basis: string;
}

export interface Point {
  id: string;
  name: string;
  kana: string;
  lat: number;
  lon: number;
  address: string;
  kind: string;
  indoor: boolean;
  access: string | null;
  seasonal: { months: number[]; note: string }[];
  riddle: string;
  hints: Hint[];
  answer: Answer;
  onsite: string | null;
  short: string;
  long: string;
  sources: Source[];
  status: string;
  notes?: string;
  // 自転車を停めて歩いて探す必要がある地点（境内・公園・構内など）。道路から見える地点は false
  on_foot?: boolean;
  // 到着後に開ける「現地のヒント」（何を探すか、現存か、近くの目印）。答えの文字は〇〇に伏せてある
  onsite_hints?: { text: string; confidence: '出典あり' | '未確認'; source_url: string | null }[];
  // 解説に出す画像（Wikimedia Commons など、作者とライセンスを確かめたものだけ）
  images?: { file_page: string; image_url: string; caption: string; author: string; license: string; license_url: string | null }[];
}

export interface Station {
  name: string;
  lines: string[];
  lat: number;
  lon: number;
}

export interface Pack {
  schema: 'machiaruki-pack/1';
  pack_id: string;
  version: string;
  title: string;
  prefecture: string;
  city: string;
  created: string;
  rules: { arrival_radius_m: number; difficulty: string };
  stations: Station[];
  attribution: { text: string; url: string }[];
  area: { bbox: [number, number, number, number] }; // [南, 西, 北, 東]
  points: Point[];
}

// 地点ごとの記録（パックを差し替えても地点IDで引き継ぐ）
export interface PointRecord {
  id: string;
  status: 'unverified' | 'verified' | 'excluded';
  lastChecked: string | null; // 最後に現地で見つかった日
  notFoundCount: number;
  visits: number;
}

// walk: 徒歩（駅・現在地・自宅から）／bike-own: 自分の自転車（自宅発着）／share: 電車＋シェアサイクル
export type Mode = 'walk' | 'bike-own' | 'share';

export interface CourseRequest {
  packId: string;
  durationMin: number; // 60 / 120 / 240
  mode: Mode;
  start:
    | { kind: 'station'; name: string; lat: number; lon: number }
    | { kind: 'here'; lat: number; lon: number }
    | { kind: 'home'; lat: number; lon: number };
  maxMeters?: number; // 自転車区間の上限（自分の自転車・シェアサイクル）
  month: number; // 1-12
}

export interface Course {
  id: string;
  createdAt: string;
  packId: string;
  packVersion: string;
  request: CourseRequest;
  pointIds: string[];
  endStation: Station; // 自宅着のときは name が「自宅」
  distanceM: number; // 目安（直線距離×係数、または経路計算の道のり）
  routed?: boolean; // 経路計算の道のりで見積もったか
  minutes: number; // 目安（移動＋滞在）
}

// 実施（現地で回った1回分）
export type StopOutcome = 'correct' | 'notfound';

export interface StopResult {
  pointId: string;
  outcome: StopOutcome;
  hintsUsed: number;
  arrivedByGps: boolean; // 位置情報で到着を確かめたか（手動で答えた場合は false）
  rating: 'easy' | 'ok' | 'hard' | null; // 難しさの評価
  memo?: string; // 現地で気づいたこと（説明板の位置など）。パックを直す材料にする
  at: string;
}

export interface Run {
  id: string;
  courseId: string;
  packId: string;
  startedAt: string;
  finishedAt: string | null;
  aborted?: boolean; // 途中で中止した
  index: number; // いま解いている地点の番号
  hintsShown: number; // いまの地点で出したヒントの数
  results: StopResult[];
  track: [number, number, number][]; // [緯度, 経度, 時刻ms]（距離の実測用）
}
