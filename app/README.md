# 街歩き謎解き（アプリ本体）

仕様は1つ上のフォルダーの「仕様書_v2.md」。素材パックは `../packs/`。

## 構成

- Web技術（TypeScript＋Vite）を Capacitor 8 で APK にする
- 地図: MapLibre GL＋地理院地図Vector（optimal_bvmap-v1）。注記（文字）の層は描かない。寺社名などが地図に出ると謎の答えになってしまうため。地図には地区の範囲、駅、ヒントの円、現在地だけを出す
- 保存: 端末内の IndexedDB（パック、地点ごとの記録、保存したコース）
- コースの組み立て: `src/course.ts`（端末内、API不要）。正解済みと「見つからない」の地点は使わない。検査は `npm test`

| ファイル | 役割 |
| --- | --- |
| src/types.ts | 素材パック（machiaruki-pack/1）とコースの型 |
| src/geo.ts | 距離と時間の目安（直線距離×1.3、時速4.5km、1地点7分、記念館・博物館35分） |
| src/course.ts | 地点の選択と並べ替え（貪欲法＋2-opt） |
| src/store.ts | IndexedDB とパックの検査 |
| src/map.ts | 地図 |
| src/main.ts | 画面（ホーム、パック、条件、コース案） |
| src/run.ts | 現地での進行（謎、ヒント、到着の判定、回答、解説、完了、記録） |
| src/judge.ts | 答えの判定（表記ゆれの吸収） |
| src/gbfs.ts | シェアサイクルのポートと台数（ODPTのGBFS、キー不要） |
| src/routing.ts | 経路計算（OpenRouteService、任意のキー。距離だけを使い、線は描かない） |
| src/photos.ts | 記録の写真（縮小して保存） |
| src/export.ts | 記録の書き出し |
| src/settings.ts | 設定（自宅の位置、距離の上限、到着の半径、経路計算のキー） |
| src/sky.ts | 日没（suncalc、端末内）と天気（Open-Meteo） |
| src/claude.ts | 写真で答える（Claude API、使用者のキー）と費用の計算 |
| src/timing.ts | 実際にかかった時間（地点ごとの移動・探す・読む、中央値） |
| src/packcheck.ts | パックの形式の検査 |
| src/hints.ts | ヒントの円（中心を地点からずらし、地点が円に入るようにする） |
| public/packs/ | APK に同梱するパック（起動時に新しい版なら入れ替える）。同梱の一覧は public/packs/index.json。地区を足すときはファイルを置いて一覧に書くだけ（`npm test` が全パックを検査する） |

## ビルド（クラウド側の作業の場で行う）

```
npm ci
npm test
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

- Android SDK（platform 36、build-tools 36）と JDK 21 が必要
- Maven Central が 429 を返すときは、Gradle の初期化スクリプトで `https://maven-central.storage-download.googleapis.com/maven2/` に向ける
- 署名: 更新インストールのため、毎回同じ鍵で署名する。鍵は `~/街歩き/keystore/debug.keystore`（Git には入れない）。ビルド前に `~/.android/debug.keystore` に置く
- `android/` は `npx cap add android` で作ったもの。位置情報の権限（ACCESS_COARSE_LOCATION、ACCESS_FINE_LOCATION）を AndroidManifest.xml に足してある
