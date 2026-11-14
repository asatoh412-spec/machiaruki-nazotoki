// 現地での進め方（段階2）: 謎→ヒント→到着の判定→回答→解説→次の地点。中断・再開、完了、記録。
import { Geolocation } from '@capacitor/geolocation';
import { haversine, trackMeters } from './geo.ts';
export { trackMeters };
import { guideText, hintCircle, narrowText } from './hints.ts';
import { isCorrect } from './judge.ts';
import { createMap, createOldMap, OLD_PERIODS, showHintCircle, showMe } from './map.ts';
import { imageUrl } from './images.ts';
import { addPhoto, deletePhoto, photosOf } from './photos.ts';
import { getSettings } from './settings.ts';
import { exportRecords } from './export.ts';
import { costYen, judgePhoto } from './claude.ts';
import { legsOf } from './timing.ts';
import * as db from './store.ts';
import type { Course, Pack, Point, Run, StopResult } from './types.ts';
import { app, esc, km, on, onLeave, render, setMap, sourcesHtml } from './ui.ts';
import { home, preview } from './main.ts';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};


async function load(run: Run): Promise<{ course: Course; pack: Pack; pts: Point[] } | null> {
  const course = await db.getCourse(run.courseId);
  const pack = course && (await db.getPack(course.packId));
  if (!course || !pack) return null;
  const pts = course.pointIds.map((id) => pack.points.find((p) => p.id === id)).filter((p): p is Point => !!p);
  return { course, pack, pts };
}

export async function startRun(course: Course) {
  const run: Run = {
    id: `r-${Date.now().toString(36)}`,
    courseId: course.id,
    packId: course.packId,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    index: 0,
    hintsShown: 0,
    results: [],
    track: [],
  };
  await db.putRun(run);
  resumeRun(run, false);
}

// fromHome: ホームから再開した（いまの地点の時間は中断を含むので平均に使わない）
export async function resumeRun(run: Run, fromHome = true) {
  if (fromHome && run.cur?.shownAt) {
    run.cur.interrupted = true;
    await db.putRun(run);
  }
  const ctx = await load(run);
  if (!ctx) {
    render(`<main><p class="notice">このコースか地区のパックが見つかりません。</p><button id="home">ホームへ</button><button id="abort">この記録を消す</button></main>`);
    on('#home', 'click', () => home());
    on('#abort', 'click', async () => {
      await db.deleteRun(run.id);
      home();
    });
    return;
  }
  if (run.index >= ctx.pts.length) return finish(run, ctx);
  stopScreen(run, ctx);
}

// ---------- 地点の画面 ----------
async function stopScreen(run: Run, ctx: { course: Course; pack: Pack; pts: Point[] }) {
  const p = ctx.pts[run.index];
  const settings = await getSettings();
  const radius = settings.arrivalRadiusM ?? (ctx.pack.rules.arrival_radius_m || 50);
  const judges: NonNullable<StopResult['photoJudge']> = [];
  let arrived = false;
  let manual = false;
  run.cur ??= {};
  if (!run.cur.shownAt) {
    run.cur.shownAt = new Date().toISOString();
    await db.putRun(run);
  }
  // 探す範囲の円は最初から出す（地名を知らなくても地図で向かえるように）。ヒント2・3で狭まる
  const circleNow = hintCircle(p, Math.max(0, run.hintsShown - 1), run.id);
  const prevPt = run.index > 0 ? ctx.pts[run.index - 1] : null;
  const st = ctx.course.request.start;
  const from = prevPt ?? st;
  const fromName = prevPt ? `前の地点（${prevPt.name}）` : st.kind === 'station' ? `${st.name}駅` : st.kind === 'home' ? '自宅' : '出発した場所';
  const hm = (iso: string) => new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  const departHtml =
    run.index !== 0 || run.results.length
      ? ''
      : run.departedAt
        ? `<p class="muted small">出発 ${hm(run.departedAt)} を記録しました。</p>`
        : '<button id="depart" class="depart">いま出発する（時間の記録用。押さなくても進められます）</button>';
  render(`
    <header class="runhead"><button class="back" id="pause">← 中断</button><span>${run.index + 1} / ${ctx.pts.length}</span></header>
    <main>
      ${departHtml}
      <h2>謎 ${run.index + 1}</h2>
      <p class="riddle">${esc(p.riddle)}</p>
      <div id="map" class="map"></div>
      <p id="guide" class="guide">${esc(guideText(from, circleNow, fromName))}</p>
      <p id="status" class="status">位置を確かめています…</p>
      <ol class="hints">${p.hints
        .slice(0, run.hintsShown)
        .map((h, i) => `<li>${esc(h.text)}${i > 0 ? `<br><span class="muted small">${esc(narrowText(hintCircle(p, i - 1, run.id), hintCircle(p, i, run.id)))}</span>` : ''}</li>`)
        .join('')}</ol>
      ${run.hintsShown < p.hints.length ? `<button id="hint">ヒント${run.hintsShown + 1}を見る${run.hintsShown === 0 ? '' : '（範囲が狭まります）'}</button>` : ''}
      <div id="onsite" hidden>
        <button id="onsitebtn">現地のヒント（何を探すか）</button>
        <ul id="onsitelist" class="onsite" hidden>${(p.onsite_hints ?? [])
          .map((h) => `<li>${esc(h.text)}${h.confidence === '未確認' ? '<span class="tag warn">未確認</span>' : ''}</li>`)
          .join('') || '<li>この地点の現地のヒントはまだありません。</li>'}</ul>
      </div>
      <form id="ans" class="answer" hidden>
        <label>${esc(p.answer.prompt)}<input name="a" autocomplete="off" enterkeyhint="done"></label>
        <button class="primary" type="submit">答える</button>
        <p id="wrong" class="notice" hidden>違います。もう一度どうぞ。</p>
        ${settings.claudeKey ? '<label class="file small" id="photoans">文字で答えにくいときは、写真で答える（Claude が判定）<input type="file" id="photoin" accept="image/*" capture="environment"></label><p id="judging" class="muted small" hidden></p>' : ''}
      </form>
      <div class="actions">
        <button id="manual" class="linkish">着いているのに判定されない</button>
        <button id="notfound">見つからない</button>
      </div>
    </main>`);
  const map = createMap(app.querySelector('#map')!, ctx.pack, []);
  setMap(map);
  showHintCircle(map, circleNow);
  const guide = app.querySelector<HTMLElement>('#guide')!;
  const status = app.querySelector<HTMLElement>('#status')!;
  const form = app.querySelector<HTMLFormElement>('#ans')!;
  const openForm = () => {
    form.hidden = false;
    app.querySelector<HTMLElement>('#onsite')!.hidden = false;
    form.querySelector('input')!.focus();
  };

  // 位置情報の監視。地点までの距離は画面に出さない（出すと答えが分かるため）。出すのは探す範囲の円の中心までの向きと距離だけ。
  let watchId: string | null = null;
  let lastSave = 0;
  Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 }, (pos, err) => {
    if (err || !pos) {
      status.textContent = '位置情報が取れません。設定で位置情報を許可してください。';
      return;
    }
    const { latitude: lat, longitude: lon, accuracy } = pos.coords;
    showMe(map, lat, lon);
    if (accuracy <= 100) guide.textContent = guideText({ lat, lon }, circleNow, '現在地');
    const last = run.track[run.track.length - 1];
    if (accuracy <= 50 && (!last || haversine(last[0], last[1], lat, lon) >= 15)) {
      run.track.push([lat, lon, Date.now()]);
      if (Date.now() - lastSave > 10000) {
        lastSave = Date.now();
        db.putRun(run);
      }
    }
    const d = haversine(lat, lon, p.lat, p.lon);
    if (!arrived && d <= radius + Math.min(accuracy, 30)) {
      arrived = true;
      if (run.cur && !run.cur.arrivedAt) {
        run.cur.arrivedAt = new Date().toISOString();
        db.putRun(run);
      }
      status.textContent = '到着しました。答えを入力してください。';
      status.classList.add('ok');
      if (navigator.vibrate) navigator.vibrate(200);
      openForm();
    } else if (!arrived) {
      status.textContent = `探しています（位置の精度 約${Math.round(accuracy)}m）。地点に着くと答えを入力できます。`;
    }
  })
    .then((id) => (watchId = id))
    .catch(() => (status.textContent = '位置情報が使えません。設定で位置情報を許可してください。'));
  onLeave(() => {
    if (watchId) Geolocation.clearWatch({ id: watchId });
    db.putRun(run);
  });

  on('#pause', 'click', async () => {
    if (run.cur) run.cur.interrupted = true;
    await db.putRun(run);
    home();
  });
  on('#depart', 'click', async () => {
    run.departedAt = new Date().toISOString();
    await db.putRun(run);
    stopScreen(run, ctx);
  });
  on('#onsitebtn', 'click', () => {
    app.querySelector<HTMLElement>('#onsitelist')!.hidden = false;
    app.querySelector<HTMLElement>('#onsitebtn')!.hidden = true;
  });
  on('#hint', 'click', async () => {
    run.hintsShown += 1;
    await db.putRun(run);
    stopScreen(run, ctx);
  });
  on('#manual', 'click', () => {
    if (arrived) return openForm();
    if (!confirm('位置情報で到着を確かめずに答えます。現地にいる場合だけ使ってください。')) return;
    manual = true;
    openForm();
  });
  on('#notfound', 'click', async () => {
    if (!confirm('答えを表示して次の地点へ進みます。この地点は以後のコースに出なくなります。')) return;
    await finishStop(run, ctx, p, 'notfound', arrived && !manual, 'text', judges);
  });
  app.querySelector<HTMLInputElement>('#photoin')?.addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    const msg = app.querySelector<HTMLElement>('#judging')!;
    msg.hidden = false;
    msg.textContent = '写真を判定しています…';
    try {
      const v = await judgePhoto(settings.claudeKey, settings.photoModel, p, f);
      judges.push({ model: v.model, inputTokens: v.inputTokens, outputTokens: v.outputTokens, match: v.match, reason: v.reason });
      const yen = costYen(v);
      const cost = Number.isFinite(yen) ? `（入力${v.inputTokens}・出力${v.outputTokens}トークン、約${yen.toFixed(2)}円）` : '';
      if (v.match) {
        await finishStop(run, ctx, p, 'correct', arrived && !manual, 'photo', judges);
      } else {
        msg.textContent = `写真では確かめられませんでした：${v.reason}${cost}。手がかりがはっきり写るように撮り直すか、文字で答えてください。`;
      }
    } catch (err) {
      msg.textContent = `判定できませんでした：${String(err)}`;
    }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = (form.elements.namedItem('a') as HTMLInputElement).value;
    if (isCorrect(v, p.answer.accept)) {
      await finishStop(run, ctx, p, 'correct', arrived && !manual, 'text', judges);
    } else {
      app.querySelector<HTMLElement>('#wrong')!.hidden = false;
    }
  });
}

async function finishStop(
  run: Run,
  ctx: { course: Course; pack: Pack; pts: Point[] },
  p: Point,
  outcome: StopResult['outcome'],
  byGps: boolean,
  method: StopResult['method'] = 'text',
  judges: StopResult['photoJudge'] = [],
) {
  const cur = run.cur ?? {};
  const res: StopResult = {
    pointId: p.id,
    outcome,
    hintsUsed: run.hintsShown,
    arrivedByGps: byGps,
    rating: null,
    at: new Date().toISOString(),
    shownAt: cur.shownAt,
    arrivedAt: byGps ? cur.arrivedAt : undefined,
    interrupted: cur.interrupted || undefined,
    method,
    photoJudge: judges?.length ? judges : undefined,
  };
  run.cur = {};
  run.results.push(res);
  run.index += 1;
  run.hintsShown = 0;
  await db.applyResult(p.id, outcome, today());
  await db.putRun(run);
  explainScreen(run, ctx, p, res);
}

// ---------- 解説 ----------
function explainScreen(run: Run, ctx: { course: Course; pack: Pack; pts: Point[] }, p: Point, res: StopResult) {
  const last = run.index >= ctx.pts.length;
  render(`
    <header class="runhead"><span></span><span>${run.index} / ${ctx.pts.length}</span></header>
    <main>
      <p class="verdict ${res.outcome === 'correct' ? 'ok' : ''}">${res.outcome === 'correct' ? (res.method === 'photo' ? '正解（写真で確認）' : '正解') : '答え'}：${esc(p.answer.display)}</p>
      <h2>${esc(p.name)}</h2>
      ${imagesHtml(p)}
      <p>${esc(p.short)}</p>
      <details id="oldmapbox"><summary>古地図で見る</summary>
        <div class="periods">${OLD_PERIODS.map((x, i) => `<button data-period="${x.id}" class="${i === 0 ? 'chosen' : ''}">${x.label}</button>`).join('')}</div>
        <div id="oldmap" class="map"></div>
        <p class="muted small">古地図は今昔マップ on the web（谷謙二）の首都圏データを表示しています。点がこの地点です。</p>
      </details>
      <details><summary>詳しい解説</summary><div class="long">${esc(p.long).replace(/\n+/g, '<br><br>')}</div>
        <h3>出典</h3>${sourcesHtml(p.sources)}</details>
      ${p.access ? `<p class="muted small">訪問の注意：${esc(p.access)}</p>` : ''}
      ${
        res.outcome === 'correct'
          ? `<fieldset class="rate"><legend>この謎の難しさは？</legend>
          <button data-r="easy">易しすぎた</button><button data-r="ok">ちょうど</button><button data-r="hard">難しすぎた</button></fieldset>`
          : '<p class="muted small">この地点は「見つからない」として記録しました。以後のコースには出ません。</p>'
      }
      ${recordSectionHtml(res.memo ?? '')}
      <button class="primary big" id="next">${last ? 'コースを終える' : '次の謎へ'}</button>
    </main>`);
  bindRecordSection(p.id, run.id, async (memo) => {
    res.memo = memo;
    await db.putRun(run);
  });
  on('[data-r]', 'click', async (e) => {
    res.rating = (e.currentTarget as HTMLElement).dataset.r as StopResult['rating'];
    app.querySelectorAll('[data-r]').forEach((b) => b.classList.toggle('chosen', b === e.currentTarget));
    await db.putRun(run);
  });
  on('#next', 'click', () => resumeRun(run, false));
  loadImages();
  let old: ReturnType<typeof createOldMap> | null = null;
  app.querySelector('#oldmapbox')!.addEventListener('toggle', (e) => {
    if (!(e.target as HTMLDetailsElement).open || old) return;
    old = createOldMap(app.querySelector('#oldmap')!, p.lat, p.lon);
    setMap(old.map);
  });
  on('[data-period]', 'click', (e) => {
    const id = (e.currentTarget as HTMLElement).dataset.period!;
    app.querySelectorAll('[data-period]').forEach((b) => b.classList.toggle('chosen', b === e.currentTarget));
    old?.setPeriod(id);
  });
}

function imagesHtml(p: Point): string {
  if (!p.images?.length) return '';
  return `<div class="figs">${p.images
    .map(
      (im) => `<figure><img data-src="${esc(im.image_url)}" alt="${esc(im.caption)}"><figcaption>${esc(im.caption)}<br><small>${esc(im.author)}・${
        im.license_url ? `<a href="${esc(im.license_url)}" target="_blank">${esc(im.license)}</a>` : esc(im.license)
      }・<a href="${esc(im.file_page)}" target="_blank">出典</a></small></figcaption></figure>`,
    )
    .join('')}</div>`;
}

// 画像は端末に縮小して保存し、表示する。通信できないときは説明文だけ残す。
function loadImages() {
  app.querySelectorAll<HTMLImageElement>('img[data-src]').forEach(async (img) => {
    const url = await imageUrl(img.dataset.src!);
    if (url) img.src = url;
    else img.replaceWith(Object.assign(document.createElement('p'), { className: 'muted small', textContent: '画像を読み込めませんでした（通信を確かめてください）。' }));
  });
}

// ---------- 完了 ----------
async function finish(run: Run, ctx: { course: Course; pack: Pack; pts: Point[] }) {
  if (!run.finishedAt) {
    run.finishedAt = new Date().toISOString();
    await db.putRun(run);
  }
  const min = Math.round((Date.parse(run.finishedAt) - Date.parse(run.startedAt)) / 60000);
  const correct = run.results.filter((r) => r.outcome === 'correct').length;
  const meters = trackMeters(run.track);
  render(`
    <header><h1>完了</h1><p class="sub">${esc(ctx.pack.title)}</p></header>
    <main>
      <dl class="stats">
        <div><dt>正解</dt><dd>${correct}/${ctx.pts.length}</dd></div>
        <div><dt>歩いた距離</dt><dd>${km(meters)}km</dd></div>
        <div><dt>所要時間</dt><dd>${min}分</dd></div>
      </dl>
      <p class="muted small">見積もりは約${km(ctx.course.distanceM)}km・約${ctx.course.minutes}分でした。歩いた距離は位置情報の記録から計算しています。</p>
      ${legsHtml(run, ctx)}
      ${runListHtml(run, ctx.pts)}
      <button class="primary big" id="home">ホームへ</button>
    </main>`);
  loadImages();
  on('#home', 'click', () => home());
}

// 地点ごとの時間（見積もりと実際）
function legsHtml(run: Run, ctx: { course: Course; pts: Point[] }): string {
  const legs = legsOf(run, ctx.course, ctx.pts);
  if (!legs.some((l) => l.travelMin !== null || l.searchMin !== null)) return '';
  const f = (x: number | null) => (x === null ? '—' : `${Math.round(x)}分`);
  const rows = legs
    .map((l) => {
      const p = ctx.pts.find((x) => x.id === l.pointId);
      return `<tr><td>${l.index + 1}. ${esc(p?.name ?? '')}</td><td>${f(l.estTravelMin)}</td><td>${f(l.travelMin)}</td><td>${f(l.searchMin)}</td><td>${f(l.readMin)}</td></tr>${
        l.usable ? '' : `<tr class="why"><td colspan="5">平均に使わない：${esc(l.why)}</td></tr>`
      }`;
    })
    .join('');
  return `<details class="legs"><summary>地点ごとの時間</summary>
    <table><thead><tr><th>地点</th><th>移動の見積もり</th><th>移動</th><th>探す</th><th>読む</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="muted small">移動＝謎を出してから位置情報で着くまで（1つ目は「出発」から）。探す＝着いてから正解まで。読む＝正解から次の謎まで。たまった区間の中央値は設定の画面で見られます。</p></details>`;
}

function runListHtml(run: Run, pts: Point[]): string {
  return `<ol class="done">${run.results
    .map((r) => {
      const p = pts.find((x) => x.id === r.pointId);
      if (!p) return '';
      return `<li><details><summary><b>${esc(p.name)}</b> ${r.outcome === 'correct' ? '<span class="tag">正解</span>' : '<span class="tag warn">見つからない</span>'}</summary>
        ${imagesHtml(p)}<p>${esc(p.short)}</p><div class="long">${esc(p.long).replace(/\n+/g, '<br><br>')}</div>${sourcesHtml(p.sources)}</details></li>`;
    })
    .join('')}</ol>`;
}


// ---------- 記録 ----------
export async function recordsScreen(tab: 'runs' | 'points' = 'runs', msg = '') {
  const runs = (await db.listRuns()).filter((r) => r.finishedAt);
  const packList = await db.listPacks();
  const packs = new Map(packList.map((p) => [p.pack_id, p]));
  const recs = await db.allRecords();
  // 回った地点と「見つからない」の地点だけを出す（未訪問の地点名は出さない＝謎の答えを見せない）
  const shown = recs.filter((r) => r.visits > 0 || r.status === 'excluded');
  const point = (id: string) => packList.flatMap((p) => p.points.map((x) => ({ x, pack: p }))).find((o) => o.x.id === id);
  render(`
    <header><button class="back" id="back">← 戻る</button><h1>記録</h1></header>
    <main>
      ${msg ? `<p class="notice">${esc(msg)}</p>` : ''}
      <div class="tabs"><button data-tab="runs" class="${tab === 'runs' ? 'chosen' : ''}">コース</button><button data-tab="points" class="${tab === 'points' ? 'chosen' : ''}">地点</button></div>
      ${
        tab === 'runs'
          ? (runs.length === 0 ? '<p class="muted">まだ回り終えたコースはありません。</p>' : '') +
            `<ul class="list">${runs
              .map((r) => {
                const ok = r.results.filter((x) => x.outcome === 'correct').length;
                return `<li><a href="#" data-run="${r.id}"><b>${esc(packs.get(r.packId)?.title ?? r.packId)}</b><span>${r.aborted ? '中止・' : ''}正解 ${ok}/${r.results.length}・${km(trackMeters(r.track))}km</span><small>${new Date(r.startedAt).toLocaleString('ja-JP')}</small></a></li>`;
              })
              .join('')}</ul>`
          : (shown.length === 0 ? '<p class="muted">まだ回った地点はありません。</p>' : '') +
            `<ul class="list">${shown
              .map((r) => {
                const o = point(r.id);
                if (!o) return '';
                const st = r.status === 'excluded' ? '<span class="tag warn">見つからない</span>' : '<span class="tag">済</span>';
                return `<li><a href="#" data-point="${esc(r.id)}"><b>${esc(o.x.name)} ${st}</b><span>${esc(o.pack.title)}</span><small>${r.lastChecked ? `最後に見つけた日 ${r.lastChecked}` : '見つけた記録なし'}</small></a></li>`;
              })
              .join('')}</ul>`
      }
      <section>
        <h2>書き出し</h2>
        <p class="muted small">回った結果、難しさの評価、メモ、所要時間と歩いた距離をファイルにします。「街歩き」フォルダーに置くと、素材パックの修正と時間の見積もりの調整に使えます。位置の軌跡は含みません。</p>
        <button id="export">記録を書き出す</button>
      </section>
    </main>`);
  on('#back', 'click', () => home());
  on('[data-tab]', 'click', (e) => recordsScreen((e.currentTarget as HTMLElement).dataset.tab as 'runs' | 'points'));
  on('#export', 'click', async () => {
    try {
      const f = await exportRecords();
      recordsScreen(tab, `${f} を書き出しました。`);
    } catch (err) {
      recordsScreen(tab, `書き出せませんでした：${String(err)}`);
    }
  });
  on('[data-run]', 'click', async (e) => {
    e.preventDefault();
    const run = await db.getRun((e.currentTarget as HTMLElement).dataset.run!);
    if (!run) return;
    const ctx = await load(run);
    if (!ctx) return;
    render(`
      <header><button class="back" id="back">← 戻る</button><h1>${esc(ctx.pack.title)}</h1><p class="sub">${new Date(run.startedAt).toLocaleString('ja-JP')}</p></header>
      <main>${runListHtml(run, ctx.pts)}<button id="course">このコースを見る</button></main>`);
    loadImages();
    on('#back', 'click', () => recordsScreen('runs'));
    on('#course', 'click', () => preview(ctx.course, [], true));
  });
  on('[data-point]', 'click', async (e) => {
    e.preventDefault();
    const id = (e.currentTarget as HTMLElement).dataset.point!;
    const o = point(id);
    const rec = recs.find((r) => r.id === id);
    if (!o || !rec) return;
    const memos = runs.flatMap((r) => r.results.filter((s) => s.pointId === id && s.memo).map((s) => `${new Date(s.at).toLocaleDateString('ja-JP')}：${s.memo}`));
    render(`
      <header><button class="back" id="back">← 戻る</button><h1>${esc(o.x.name)}</h1><p class="sub">${esc(o.pack.title)}</p></header>
      <main>
        ${imagesHtml(o.x)}
        <p>${esc(o.x.short)}</p>
        <details><summary>詳しい解説</summary><div class="long">${esc(o.x.long).replace(/\n+/g, '<br><br>')}</div><h3>出典</h3>${sourcesHtml(o.x.sources)}</details>
        ${memos.length ? `<h3>メモ</h3><ul>${memos.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
        ${recordSectionHtml('')}
        ${rec.status === 'excluded' ? '<button id="restore">「見つからない」を取り消す（またコースに出す）</button>' : ''}
      </main>`);
    loadImages();
    bindRecordSection(id, '', null);
    on('#back', 'click', () => recordsScreen('points'));
    on('#restore', 'click', async () => {
      await db.restorePoint(id);
      recordsScreen('points', `${o.x.name} を、またコースに出すようにしました。`);
    });
  });
}

// 途中のコースを中止する（ホームから使う）。結果とメモは残し、「中止」として記録に残す。
export async function abortRun(run: Run) {
  run.finishedAt = new Date().toISOString();
  run.aborted = true;
  await db.putRun(run);
}


// ---------- 写真とメモ（記録） ----------
function recordSectionHtml(memo: string): string {
  return `<section class="rec">
    <h3>この地点の記録</h3>
    <div id="photos" class="photos"></div>
    <label class="file small">写真を付ける<input type="file" id="addphoto" accept="image/*"></label>
    <label class="memo">現地で気づいたこと（説明板の位置、見つけにくさ、ヒントとの違いなど）
      <textarea id="memo" rows="3" placeholder="例：説明板は門を入って右。ヒントの『左手』は違った">${esc(memo)}</textarea></label>
    <p class="muted small">メモは「記録を書き出す」で素材パックを直す材料になります。写真は縮小して端末内に保存します。</p>
  </section>`;
}

export function bindRecordSection(pointId: string, runId: string, saveMemo: ((memo: string) => Promise<void>) | null) {
  const box = app.querySelector<HTMLElement>('#photos');
  if (!box) return;
  const urls: string[] = [];
  const draw = async () => {
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls.length = 0;
    const list = await photosOf(pointId);
    box.innerHTML = list
      .map((ph) => {
        const u = URL.createObjectURL(ph.blob);
        urls.push(u);
        return `<figure class="ph"><img src="${u}" alt=""><button class="del" data-del="${esc(ph.id)}" aria-label="削除">×</button><figcaption>${new Date(ph.at).toLocaleDateString('ja-JP')}・${Math.round(ph.blob.size / 1024)}KB</figcaption></figure>`;
      })
      .join('');
    box.querySelectorAll<HTMLElement>('[data-del]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm('この写真を削除します。')) return;
        await deletePhoto(b.dataset.del!);
        draw();
      }),
    );
  };
  onLeave(() => urls.forEach((u) => URL.revokeObjectURL(u)));
  draw();
  app.querySelector<HTMLInputElement>('#addphoto')?.addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    try {
      await addPhoto(pointId, runId, f);
    } catch {
      alert('写真を読み込めませんでした。');
    }
    input.value = '';
    draw();
  });
  const memo = app.querySelector<HTMLTextAreaElement>('#memo');
  if (memo && saveMemo) memo.addEventListener('change', () => saveMemo(memo.value.trim()));
  else if (memo) memo.closest('label')!.hidden = true;
}
