// 写真で答える任意機能（段階6）。使用者自身の Claude API キーで、写真に地点の手がかりが写っているかを判定する。
// 写真は端末内で長辺1024pxに縮めてから送る。結果のトークン数を記録し、実際の費用を確かめられるようにする。
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { shrink } from './images.ts';
import type { Point } from './types.ts';

export const PHOTO_MODELS = [
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5（標準）' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5（安い）' },
] as const;

export interface PhotoVerdict {
  match: boolean;
  reason: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

async function toBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function judgePhoto(key: string, model: string, p: Point, photo: Blob): Promise<PhotoVerdict> {
  const img = await toBase64(await shrink(photo, 1024, 0.8));
  const onsite = (p.onsite_hints ?? []).map((h) => `- ${h.text}`).join('\n');
  const prompt = `あなたは街歩きの謎解きの判定係です。利用者は現地で、次の地点の手がかり（説明板、石碑、建物、山門など）を写真に撮りました。
地点: ${p.name}（${p.address}）
正解: ${p.answer.display}（別の書き方: ${p.answer.accept.join('、')}）
現地で探す物の情報:
${onsite || '（なし）'}

写真に、この地点を示す手がかりが写っているかを判定してください。説明板や碑の文字に正解やこの地点の名前が読み取れる、またはこの地点の建物・碑だと確かに分かる場合だけ match を true にします。ぼやけて読めない、別の場所に見える、関係のない物しか写っていない場合は false にします。
答えは次の JSON だけで返してください: {"match": true または false, "reason": "判定の理由を日本語で1文"}`;
  const body = {
    model,
    max_tokens: 200,
    messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: img } }, { type: 'text', text: prompt }] }],
  };
  const headers = { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };
  let data: { content?: { type: string; text?: string }[]; usage?: { input_tokens: number; output_tokens: number }; error?: { message: string } };
  if (Capacitor.isNativePlatform()) {
    const r = await CapacitorHttp.post({ url: 'https://api.anthropic.com/v1/messages', headers, data: body });
    data = r.data;
    if (r.status >= 400) throw new Error(data?.error?.message ?? `HTTP ${r.status}`);
  } else {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { ...headers, 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify(body),
    });
    data = await r.json();
    if (!r.ok) throw new Error(data?.error?.message ?? `HTTP ${r.status}`);
  }
  const text = (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  const m = text.match(/\{[\s\S]*\}/);
  let match = false;
  let reason = '判定の結果を読み取れませんでした。';
  if (m) {
    try {
      const j = JSON.parse(m[0]);
      match = j.match === true;
      reason = String(j.reason ?? '');
    } catch {
      /* 読めなければ不一致として扱う */
    }
  }
  return { match, reason, model, inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 };
}

// 料金（2026年11月時点の公式料金表、100万トークンあたりのドル）
export const PRICE: Record<string, { in: number; out: number }> = {
  'claude-sonnet-5-5': { in: 2, out: 10 },
  'claude-haiku-5-5': { in: 0.1, out: 0.5 },
};
export function costYen(v: { model: string; inputTokens: number; outputTokens: number }, yenPerUsd = 150): number {
  const p = PRICE[v.model];
  if (!p) return NaN;
  return ((v.inputTokens * p.in + v.outputTokens * p.out) / 1e6) * yenPerUsd;
}
