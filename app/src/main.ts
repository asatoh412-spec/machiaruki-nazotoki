// 画面: ホーム、パック、コースの条件、コース案、保存したコース。現地での進行は run.ts。
import './styles.css';
import { Geolocation } from '@capacitor/geolocation';
import { assemble, isEligible, planOf } from './course.ts';
import { checkShare, OPERATORS, type Operator } from './gbfs.ts';
import { routeMeters } from './routing.ts';
import { sunsetOf, weatherFor } from './sky.ts';
import { createMap, showPorts } from './map.ts';
import * as db from './store.ts';
import { deleteAllPhotos, photoStats } from './photos.ts';
import { getSettings, saveSettings } from './settings.ts';
import { PHOTO_MODELS } from './claude.ts';
import type { Course, CourseRequest, Mode, Pack } from './types.ts';

import { app, DUR_LABEL, esc, km, on, render, setMap } from './ui.ts';
import { abortRun, startRun, resumeRun, recordsScreen } from './run.ts';

// 同梱のパックを初回に入れる。新しい版が同梱されていれば差し替える（地点の記録は別に保存しているので残る）。
async function installBundledPacks() {
  for (const file of ['shinjuku-ushigome.json']) {
    try {
      const p = (await (await fetch(`packs/${file}`)).json()) as Pack;
      const have = await db.getPack(p.pack_id);
      if (!have || have.version.localeCompare(p.version, undefined, { numeric: true }) < 0) await db.putPack(p);
    } catch (e) {
      console.error('同梱パックを読めません', file, e);
    }
  }
}

// ---------- ホーム ----------
export async function home() {
  const [packs, courses, runs] = await Promise.all([db.listPacks(), db.listCourses(), db.listRuns()]);
  const active = runs.find((r) => !r.finishedAt);
  const done = runs.filter((r) => r.finishedAt).length;
  const packTitle = new Map(packs.map((p) => [p.pack_id, p.title]));
  render(`
    <header><h1>街歩き謎解き</h1><p class="sub">謎を解いて、街の歴史をたどる</p></header>
    <main>
      ${active ? `<button class="primary big" id="resume">続きから（${esc(packTitle.get(active.packId) ?? '')}・${active.index + 1}地点目）</button>` : ''}
      ${active ? '<button class="linkish" id="abort">途中のコースを中止する</button>' : ''}
      <button class="${active ? '' : 'primary '}big" id="new">新しいコースを作る</button>
      <section>
        <h2>保存したコース</h2>
        ${courses.length === 0 ? '<p class="muted">まだありません。</p>' : `<ul class="list">${courses
          .map(
            (c) => `<li><a href="#" data-course="${c.id}"><b>${esc(packTitle.get(c.packId) ?? c.packId)}</b><span>${c.pointIds.length}地点・約${km(c.distanceM)}km・約${c.minutes}分・${esc(c.request.start.kind === 'station' ? c.request.start.name + '駅発' : '現在地発')}</span><small>${new Date(c.createdAt).toLocaleString('ja-JP')}</small></a></li>`,
          )
          .join('')}</ul>`}
      </section>
      <section>
        <h2>地区のパック</h2>
        <p class="muted">${packs.length}地区：${packs.map((p) => esc(p.title)).join('、') || 'なし'}</p>
        <button id="packs">パックを管理する</button>
      </section>
      <section>
        <h2>記録</h2>
        <p class="muted">回り終えたコース ${done}件。読んだ解説はここで読み返せます。</p>
        <button id="records">記録を見る</button>
      </section>
      <section>
        <h2>設定</h2>
        <button id="settings">設定を開く</button>
      </section>
    </main>`);
  on('#resume', 'click', () => active && resumeRun(active));
  on('#abort', 'click', async () => {
    if (active && confirm('途中のコースを中止します。ここまでの結果とメモは記録に残ります。')) {
      await abortRun(active);
      home();
    }
  });
  on('#records', 'click', () => recordsScreen());
  on('#settings', 'click', () => settingsScreen());
  on('#new', 'click', () => newCourse());
  on('#packs', 'click', () => packsScreen());
  on('[data-course]', 'click', async (e) => {
    e.preventDefault();
    const c = await db.getCourse((e.currentTarget as HTMLElement).dataset.course!);
    if (c) preview(c, [], true);
  });
}

// ---------- 設定 ----------
async function settingsScreen(msg = '') {
  const s = await getSettings();
  const ph = await photoStats();
  const radii = [30, 50, 80];
  render(`
    <header><button class="back" id="back">← 戻る</button><h1>設定</h1></header>
    <main>
      ${msg ? `<p class="notice">${esc(msg)}</p>` : ''}
      <fieldset><legend>到着の判定の半径</legend>
        ${radii.map((r) => `<label class="radio"><input type="radio" name="rad" value="${r}" ${(s.arrivalRadiusM ?? 50) === r ? 'checked' : ''}>${r}m</label>`).join('')}
        <p class="muted small">初期値は50m。位置の精度が悪いときは、判定に精度の分（最大30m）を足しています。</p>
      </fieldset>
      <fieldset><legend>自宅の位置（自転車・徒歩の自宅発着用）</legend>
        <p>${s.home ? '登録済み（この端末の中だけに保存。書き出しには含めません）' : '未登録'}</p>
        <button id="sethome">今いる場所を自宅にする</button> ${s.home ? '<button id="clrhome">消す</button>' : ''}
      </fieldset>
      <fieldset><legend>自転車の距離の上限</legend>
        <label>自分の自転車（1周）<select id="bikemax">${[30, 40, 50, 55].map((k) => `<option value="${k}" ${s.bikeMaxKm === k ? 'selected' : ''}>${k}km</option>`).join('')}</select></label>
        <label>シェアサイクル（自転車区間）<select id="sharemax">${[20, 30, 40].map((k) => `<option value="${k}" ${s.shareMaxKm === k ? 'selected' : ''}>${k}km</option>`).join('')}</select></label>
      </fieldset>
      <fieldset><legend>経路計算（任意）</legend>
        <label>OpenRouteService のAPIキー<input id="orskey" type="password" value="${esc(s.orsKey)}" autocomplete="off"></label>
        <p class="muted small">入れると、距離の目安を直線距離×1.3ではなく実際の道のりで出します（無料、1日2,000回まで）。キーは openrouteservice.org で自分で取得します。経路の線は地図に描きません。</p>
        <button id="saveors">保存</button>
      </fieldset>
      <fieldset><legend>写真で答える（任意・Claude API）</legend>
        <label>Claude API のキー<input id="claudekey" type="password" value="${esc(s.claudeKey)}" autocomplete="off"></label>
        <label>判定に使うモデル<select id="photomodel">${PHOTO_MODELS.map((m) => `<option value="${m.id}" ${s.photoModel === m.id ? 'selected' : ''}>${m.label}</option>`).join('')}</select></label>
        <p class="muted small">キーを入れると、現地で文字で答えにくいときに「写真で答える」が使えます。写真は長辺1024pxに縮めて送ります。1回あたりの見積もりは Sonnet 5.5 で約0.6円、Haiku 5.5 で0.1円未満（実際のトークン数と費用は記録に残ります）。キーは console.anthropic.com で自分で取得します。</p>
        <button id="saveclaude">保存</button>
      </fieldset>
      <fieldset><legend>写真</legend>
        <p>${ph.count}枚・${(ph.bytes / 1024 / 1024).toFixed(1)}MB</p>
        <button id="delphotos" ${ph.count ? '' : 'disabled'}>写真をすべて削除する</button>
      </fieldset>
      <fieldset><legend>出典・利用しているデータ</legend>
        <p class="small">地図：地理院地図Vector（国土地理院）／シェアサイクル：株式会社ドコモ・バイクシェア、OpenStreet株式会社 / 公共交通オープンデータ協議会（CC BY 4.0、台数は参考値）／経路：openrouteservice（キーを入れた場合）／天気：Open-Meteo.com（CC BY 4.0）／古地図：今昔マップ on the web（谷謙二）／史跡：新宿区の文化財一覧（CC BY）ほか、各パックの出典／駅：国土数値情報（鉄道データ）／解説の画像：Wikimedia Commons（各画像に作者とライセンスを表示）</p>
      </fieldset>
    </main>`);
  on('#back', 'click', () => home());
  on('input[name=rad]', 'change', async (e) => {
    s.arrivalRadiusM = Number((e.target as HTMLInputElement).value);
    await saveSettings(s);
    settingsScreen(`到着の判定の半径を${s.arrivalRadiusM}mにしました。`);
  });
  on('#sethome', 'click', async () => {
    try {
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
      s.home = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      await saveSettings(s);
      settingsScreen('今いる場所を自宅として登録しました。');
    } catch {
      settingsScreen('現在地を取れませんでした。位置情報の許可を確かめてください。');
    }
  });
  on('#clrhome', 'click', async () => {
    s.home = null;
    await saveSettings(s);
    settingsScreen('自宅の位置を消しました。');
  });
  on('#bikemax', 'change', async (e) => {
    s.bikeMaxKm = Number((e.target as HTMLSelectElement).value);
    await saveSettings(s);
  });
  on('#sharemax', 'change', async (e) => {
    s.shareMaxKm = Number((e.target as HTMLSelectElement).value);
    await saveSettings(s);
  });
  on('#saveors', 'click', async () => {
    s.orsKey = app.querySelector<HTMLInputElement>('#orskey')!.value.trim();
    await saveSettings(s);
    settingsScreen(s.orsKey ? '経路計算のキーを保存しました。' : '経路計算のキーを消しました。');
  });
  on('#saveclaude', 'click', async () => {
    s.claudeKey = app.querySelector<HTMLInputElement>('#claudekey')!.value.trim();
    s.photoModel = app.querySelector<HTMLSelectElement>('#photomodel')!.value;
    await saveSettings(s);
    settingsScreen(s.claudeKey ? '写真で答える機能の設定を保存しました。' : 'Claude API のキーを消しました。');
  });
  on('#delphotos', 'click', async () => {
    if (!confirm('記録に付けた写真をすべて削除します。元に戻せません。')) return;
    await deleteAllPhotos();
    settingsScreen('写真を削除しました。');
  });
}

// ---------- パック ----------
async function packsScreen(msg = '') {
  const packs = await db.listPacks();
  const recs = await db.recordsFor(packs.flatMap((p) => p.points.map((x) => x.id)));
  const left = (p: Pack) => p.points.filter((x) => isEligible(recs.get(x.id))).length;
  render(`
    <header><button class="back" id="back">← 戻る</button><h1>地区のパック</h1></header>
    <main>
      ${msg ? `<p class="notice">${msg}</p>` : ''}
      <ul class="list">${packs
        .map(
          (p) => `<li><div><b>${esc(p.title)}</b><span>未訪問 ${left(p)} ／ 全${p.points.length}地点・版 ${esc(p.version)}</span>
            <small>${p.attribution.map((a) => `<a href="${esc(a.url)}" target="_blank">${esc(a.text)}</a>`).join('<br>')}</small></div></li>`,
        )
        .join('')}</ul>
      <label class="file">パックのファイル（.json）を読み込む<input type="file" id="file" accept=".json,application/json"></label>
      <p class="muted">「街歩き」フォルダーの packs にあるファイルを選びます。同じ地区の新しい版を読み込むと置き換わります。回った記録は残ります。</p>
    </main>`);
  on('#back', 'click', () => home());
  on('#file', 'change', async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const errs = db.validatePack(data);
      if (errs.length) return packsScreen(`読み込めません：${esc(errs.slice(0, 3).join(' / '))}`);
      await db.putPack(data as Pack);
      packsScreen(`「${esc((data as Pack).title)}」を読み込みました（${(data as Pack).points.length}地点）。`);
    } catch {
      packsScreen('JSONとして読めないファイルです。');
    }
  });
}

// ---------- コースの条件 ----------
async function newCourse() {
  const packs = await db.listPacks();
  if (packs.length === 0) return packsScreen('先に地区のパックを読み込んでください。');
  render(`
    <header><button class="back" id="back">← 戻る</button><h1>新しいコース</h1></header>
    <main>
      <form id="f">
        <label>地区<select name="pack">${packs.map((p) => `<option value="${esc(p.pack_id)}">${esc(p.title)}</option>`).join('')}</select></label>
        <fieldset><legend>移動手段</legend>
          <label class="radio"><input type="radio" name="mode" value="walk" checked>徒歩</label>
          <label class="radio"><input type="radio" name="mode" value="share">電車＋シェアサイクル</label>
          <label class="radio"><input type="radio" name="mode" value="bike-own">自分の自転車（自宅発着）</label>
        </fieldset>
        <label id="startlabel">出発<select name="start" id="start"></select></label>
        <p id="modenote" class="muted small"></p>
        <label>出発の時刻<input type="time" name="depart" id="depart"></label>
        <fieldset><legend>所要時間</legend>
          ${[60, 120, 240].map((d) => `<label class="radio"><input type="radio" name="dur" value="${d}" ${d === 120 ? 'checked' : ''}>${DUR_LABEL[d]}</label>`).join('')}
        </fieldset>
        <p class="muted">謎の難しさは「ふつう」です。各地点の評価をためて、あとで調整します。</p>
        <button class="primary big" type="submit">コースを作る</button>
        <p id="err" class="notice" hidden></p>
      </form>
    </main>`);
  const form = app.querySelector<HTMLFormElement>('#f')!;
  const packSel = form.querySelector<HTMLSelectElement>('select[name=pack]')!;
  const startSel = app.querySelector<HTMLSelectElement>('#start')!;
  const settings = await getSettings();
  const mode = () => (form.querySelector('input[name=mode]:checked') as HTMLInputElement).value as Mode;
  const fillStations = () => {
    const p = packs.find((x) => x.pack_id === packSel.value)!;
    const m = mode();
    const st = p.stations.map((s) => `<option value="st:${esc(s.name)}">${esc(s.name)}駅</option>`).join('');
    startSel.innerHTML =
      m === 'share' ? st : m === 'bike-own' ? (settings.home ? '<option value="home">自宅</option>' : '') : st + '<option value="here">現在地</option>' + (settings.home ? '<option value="home">自宅</option>' : '');
    const note = app.querySelector<HTMLElement>('#modenote')!;
    note.textContent =
      m === 'share'
        ? `出発の駅の近くのポートで借り、終点の駅の近くのポートで返します。借りた会社のポートにしか返せません。自転車区間の上限は${settings.shareMaxKm}km。`
        : m === 'bike-own'
          ? settings.home
            ? `自宅から自転車で出て、自宅に戻ります。1周の上限は${settings.bikeMaxKm}km。輪行はしません。`
            : '自宅の位置が未登録です。設定で登録してください。'
          : '';
  };
  fillStations();
  packSel.addEventListener('change', fillStations);
  const nowHM = new Date(Date.now() + 10 * 60000).toTimeString().slice(0, 5);
  app.querySelector<HTMLInputElement>('#depart')!.value = nowHM;
  on('input[name=mode]', 'change', fillStations);
  on('#back', 'click', () => home());
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = app.querySelector<HTMLElement>('#err')!;
    const pack = packs.find((x) => x.pack_id === packSel.value)!;
    let start: CourseRequest['start'];
    if (!startSel.value) {
      err.hidden = false;
      err.textContent = '出発の場所を選べません。自分の自転車は、設定で自宅の位置を登録してください。';
      return;
    }
    if (startSel.value === 'home' && settings.home) {
      start = { kind: 'home', lat: settings.home.lat, lon: settings.home.lon };
    } else if (startSel.value === 'here') {
      try {
        const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
        start = { kind: 'here', lat: pos.coords.latitude, lon: pos.coords.longitude };
      } catch {
        err.hidden = false;
        err.textContent = '現在地を取れませんでした。位置情報の許可を確かめるか、駅から選んでください。';
        return;
      }
    } else {
      const st = pack.stations.find((s) => `st:${s.name}` === startSel.value)!;
      start = { kind: 'station', name: st.name, lat: st.lat, lon: st.lon };
    }
    const req: CourseRequest = {
      packId: pack.pack_id,
      durationMin: Number((form.querySelector('input[name=dur]:checked') as HTMLInputElement).value),
      mode: mode(),
      start,
      month: new Date().getMonth() + 1,
      maxMeters: mode() === 'share' ? settings.shareMaxKm * 1000 : mode() === 'bike-own' ? settings.bikeMaxKm * 1000 : undefined,
    };
    // 出発の時刻（今日。過ぎていれば今）
    const [hh, mm] = (app.querySelector<HTMLInputElement>('#depart')!.value || nowHM).split(':').map(Number);
    const depart = new Date();
    depart.setHours(hh, mm, 0, 0);
    if (depart.getTime() < Date.now()) depart.setTime(Date.now());
    req.departAt = depart.toISOString();
    const notes: string[] = [];
    // 日没までに終わる長さにする
    const center = { lat: (pack.area.bbox[0] + pack.area.bbox[2]) / 2, lon: (pack.area.bbox[1] + pack.area.bbox[3]) / 2 };
    const sunset = sunsetOf(depart, center.lat, center.lon);
    const untilSunset = Math.floor((sunset.getTime() - depart.getTime()) / 60000);
    const hm = (d: Date) => d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    if (untilSunset < 30) {
      err.hidden = false;
      err.textContent = `日没（${hm(sunset)}）まで30分もありません。出発の時刻を早めてください。`;
      return;
    }
    if (untilSunset < req.durationMin) {
      notes.push(`日没（${hm(sunset)}）までに終わるよう、所要時間を${req.durationMin}分から${untilSunset}分に縮めました。`);
      req.durationMin = untilSunset;
    }
    // 天気：雨や寒い日は屋内の地点を優先する
    const wx = await weatherFor(center.lat, center.lon, depart, req.durationMin);
    if (wx) {
      req.indoorBoost = (wx.rainy ? 3 : 0) + (wx.cold ? 2 : 0);
      const indoorN = pack.points.filter((p) => p.indoor).length;
      if (wx.rainy) notes.push(`雨の予報です（降水確率 最大${wx.maxProb ?? '?'}%・${wx.precipMm ?? '?'}mm）。屋内の地点を優先しました（この地区の屋内の地点は${indoorN}か所）。短いコースにすることも考えてください。`);
      if (wx.rainy && req.mode !== 'walk') notes.push('雨の日の自転車は滑りやすく危険です。徒歩にするか、日を改めることをおすすめします。');
      if (wx.cold && !wx.rainy) notes.push(`寒い予報です（最低${wx.minTemp}℃）。屋内の地点を優先しました（この地区の屋内の地点は${indoorN}か所）。`);
    }
    const records = await db.recordsFor(pack.points.map((p) => p.id));
    const r = assemble(pack, req, records);
    if (!r.course) {
      err.hidden = false;
      err.textContent = r.warnings.join(' ');
      return;
    }
    r.course.sunset = sunset.toISOString();
    r.course.weather = wx;
    await refineByRoute(r.course, pack);
    preview(r.course, [...notes, ...r.warnings], false);
  });
}

// ---------- コース案 ----------
async function preview(c: Course, warnings: string[], saved: boolean) {
  const pack = await db.getPack(c.packId);
  if (!pack) return home();
  const pts = c.pointIds.map((id) => pack.points.find((p) => p.id === id)).filter((p) => !!p);
  const startName = c.request.start.kind === 'station' ? `${c.request.start.name}駅` : c.request.start.kind === 'home' ? '自宅' : '現在地';
  const endName = c.endStation.name === '自宅' ? '自宅' : `${c.endStation.name}駅`;
  const MODE_LABEL: Record<string, string> = { walk: '徒歩', share: '電車＋シェアサイクル', 'bike-own': '自分の自転車' };
  const isBike = c.request.mode !== 'walk';
  const indoor = pts.filter((p) => p.indoor).length;
  const seasonal = pts.filter((p) => p.seasonal.some((s) => s.months.includes(c.request.month))).length;
  const outdated = c.packVersion !== pack.version;
  render(`
    <header><button class="back" id="back">← 戻る</button><h1>${esc(pack.title)}</h1></header>
    <main>
      <div id="map" class="map"></div>
      <p class="muted small">地図には地区の範囲と駅だけを出します。地点の位置は謎とヒントで探します。</p>
      <dl class="stats">
        <div><dt>地点</dt><dd>${pts.length}</dd></div>
        <div><dt>距離（目安）</dt><dd>${km(c.distanceM)}km</dd></div>
        <div><dt>所要（目安）</dt><dd>${c.minutes}分</dd></div>
      </dl>
      <p>${esc(startName)}発 → ${esc(endName)}着・${DUR_LABEL[c.request.durationMin] ?? c.request.durationMin + '分'}・${MODE_LABEL[c.request.mode ?? 'walk']}${indoor ? `・屋内${indoor}か所` : ''}${seasonal ? `・今月の見どころ${seasonal}か所` : ''}</p>
      ${skyLine(c)}
      ${warnings.map((w) => `<p class="notice">${esc(w)}</p>`).join('')}
      ${outdated ? '<p class="notice">このコースを作ったあとに、地区のパックが新しい版になっています。</p>' : ''}
      <p class="muted small">${c.routed ? '距離は経路計算（openrouteservice）の道のり' : '距離は直線距離×1.3'}、時間は${isBike ? '時速12km（駐輪の時間は1地点7分に含む）' : '時速4.5km'}と1地点7分（記念館・博物館は35分）${c.request.mode === 'share' ? '、借りる・返す10分' : ''}で見積もっています。</p>
      ${c.request.mode === 'share' ? '<section id="share"><h2>シェアサイクル</h2><p class="muted">ポートの台数を取得しています…</p></section>' : ''}
      <h2>謎</h2>
      <ol class="riddles">${pts.map((p) => `<li>${esc(p.riddle)}${p.indoor ? '<span class="tag">屋内</span>' : ''}</li>`).join('')}</ol>
      <div class="actions">
        ${saved ? '<button id="del">削除</button>' : '<button id="again">作り直す</button><button class="primary" id="save">保存する</button>'}
        <button id="go" class="primary">出発する</button>
      </div>
      <p id="msg" class="notice" hidden></p>
    </main>`);
  const marks = [{ station: c.endStation, label: `着 ${c.endStation.name}` }];
  if (c.request.start.kind === 'home') marks.unshift({ station: { name: '自宅', lines: [], lat: c.request.start.lat, lon: c.request.start.lon }, label: '発 自宅' });
  if (c.request.start.kind === 'station') {
    const st = pack.stations.find((s) => c.request.start.kind === 'station' && s.name === c.request.start.name);
    if (st) marks.unshift({ station: st, label: `発 ${st.name}` });
  }
  let map: ReturnType<typeof createMap> | null = null;
  try {
    map = createMap(app.querySelector('#map')!, pack, marks);
    setMap(map);
  } catch (e) {
    app.querySelector('#map')!.textContent = '地図を表示できませんでした。';
    console.error(e);
  }
  const msg = app.querySelector<HTMLElement>('#msg')!;
  if (c.request.mode === 'share') shareSection(c, pack, map);
  on('#back', 'click', () => (saved ? home() : newCourse()));
  on('#again', 'click', () => {
    const records = db.recordsFor(pack.points.map((p) => p.id));
    records.then((r) => {
      const res = assemble(pack, c.request, r);
      if (!res.course) return;
      res.course.sunset = c.sunset;
      res.course.weather = c.weather;
      refineByRoute(res.course, pack).then(() => preview(res.course!, res.warnings, false));
    });
  });
  on('#save', 'click', async () => {
    await db.putCourse(c);
    preview(c, warnings, true);
  });
  on('#del', 'click', async () => {
    await db.deleteCourse(c.id);
    home();
  });
  on('#go', 'click', async () => {
    const runs = await db.listRuns();
    if (runs.some((r) => !r.finishedAt)) {
      msg.hidden = false;
      msg.textContent = '途中のコースがあります。ホームの「続きから」で終えるか、そのコースを中止してから出発してください。';
      return;
    }
    await db.putCourse(c);
    startRun(c);
  });
}

// 出発・日没・天気の一行
function skyLine(c: Course): string {
  const hm = (s?: string) => (s ? new Date(s).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '—');
  const w = c.weather;
  const wx = w
    ? `気温${w.minTemp ?? '?'}〜${w.maxTemp ?? '?'}℃・降水確率 最大${w.maxProb ?? '?'}%<small>（Weather data by <a href="https://open-meteo.com/" target="_blank">Open-Meteo.com</a>）</small>`
    : '天気は取得できませんでした';
  return `<p class="sky">出発 ${hm(c.request.departAt)}・日没 ${hm(c.sunset)}<br>${wx}</p>`;
}

// 経路計算のキーがあれば、道のりで距離と時間を見積もり直す
async function refineByRoute(c: Course, pack: Pack) {
  const s = await getSettings();
  if (!s.orsKey) return;
  const pts = c.pointIds.map((id) => pack.points.find((p) => p.id === id)!).filter(Boolean);
  const coords = [{ lat: c.request.start.lat, lon: c.request.start.lon }, ...pts, c.endStation];
  try {
    const bike = c.request.mode !== 'walk';
    const m = await routeMeters(s.orsKey, bike ? 'cycling-regular' : 'foot-walking', coords);
    const plan = planOf(pack, c.request);
    c.minutes = Math.round(c.minutes + (m - c.distanceM) / plan.mPerMin);
    c.distanceM = Math.round(m);
    c.routed = true;
  } catch (e) {
    console.warn('経路計算に失敗。直線距離の見積もりのまま', e);
  }
}

// シェアサイクル：起点と終点のポート、台数、取得時刻。出発直前に更新ボタンで取り直す。
async function shareSection(c: Course, pack: Pack, map: ReturnType<typeof createMap> | null) {
  const box = app.querySelector<HTMLElement>('#share');
  if (!box) return;
  const start = c.request.start;
  const r = await checkShare(start, c.endStation, pack.area.bbox);
  if (!app.contains(box)) return;
  const time = r.at.length ? r.at.map((d) => d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })).join('／') : '—';
  const row = (p: (typeof r.start)[number], what: 'bikes' | 'docks') =>
    `<li><span class="op ${p.op}">${p.op === 'docomo' ? 'ドコモ' : 'HELLO'}</span>${esc(p.name)}<b>${what === 'bikes' ? `${p.bikes ?? '?'}台` : `空き${p.docks ?? '?'}`}</b><small>徒歩約${Math.round(p.walkM / 80)}分</small></li>`;
  const label = (op: Operator) => OPERATORS[op].label;
  box.innerHTML = `<h2>シェアサイクル</h2>
    ${r.errors.map((e) => `<p class="notice">${esc(e)}</p>`).join('')}
    ${r.startOk ? '' : '<p class="notice">出発の駅から徒歩1km以内に、借りられるポートが2か所未満です（条件を満たしません）。</p>'}
    ${r.usable.length ? `<p>このコースで使える会社：<b>${r.usable.map(label).join('、')}</b>（借りた会社のポートに返す）</p>` : '<p class="notice">出発で借りて終点で返せる会社がありません。台数は変わるので、出発直前に更新してください。</p>'}
    <h3>出発（${esc(c.request.start.kind === 'station' ? c.request.start.name : '')}駅の近く・借りられる台数）</h3>
    <ul class="ports">${r.start.slice(0, 8).map((p) => row(p, 'bikes')).join('') || '<li>なし</li>'}</ul>
    <h3>終点（${esc(c.endStation.name)}駅の近く・返せる空き）</h3>
    <ul class="ports">${r.end.slice(0, 8).map((p) => row(p, 'docks')).join('') || '<li>なし</li>'}</ul>
    <p class="muted small">取得時刻 ${time}。台数は参考値です。貸出・返却・返却予約は各社のアプリで行います。ドコモ・バイクシェアは同じエリア（東京の連携区）の中でだけ返せます。地区の中のポートは地図に点で出しています（途中の乗り換え用）。</p>
    <p class="muted small">出典：${esc(OPERATORS.docomo.credit)}／${esc(OPERATORS.hello.credit)}。正確性は保証されません。</p>
    <button id="refresh">台数を更新する</button>`;
  if (map) showPorts(map, r.along.map((p) => ({ lat: p.lat, lon: p.lon, op: p.op, bikes: p.bikes ?? 0 })));
  box.querySelector('#refresh')!.addEventListener('click', () => {
    box.innerHTML = '<h2>シェアサイクル</h2><p class="muted">取り直しています…</p>';
    shareSection(c, pack, map);
  });
}

(async () => {
  await installBundledPacks();
  await home();
})();
export { preview };
