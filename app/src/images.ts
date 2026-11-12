// 解説の画像。初回だけネットから読み込み、端末内で長辺1280pxに縮めて保存する（2回目からは通信なし）。
import { createStore, get, set } from 'idb-keyval';

const cache = createStore('machiaruki-images', 'images');
const MAX_EDGE = 1280;

// Wikimedia Commons の原寸URLから、縮小版（幅960px）のURLを作る
export function commonsThumb(url: string, width = 960): string | null {
  const m = url.match(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^/]+)$/);
  if (!m) return null;
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${m[1]}/${m[2]}/${m[3]}/${width}px-${m[3]}`;
}

export async function shrink(blob: Blob, maxEdge = MAX_EDGE, quality = 0.75): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('縮小に失敗'))), 'image/jpeg', quality));
}

export async function imageUrl(src: string): Promise<string | null> {
  let blob = await get<Blob>(src, cache);
  if (!blob) {
    const tries = [commonsThumb(src), src].filter((u): u is string => !!u);
    for (const u of tries) {
      try {
        const r = await fetch(u);
        if (!r.ok) continue;
        blob = await shrink(await r.blob());
        await set(src, blob, cache);
        break;
      } catch {
        /* 次の候補へ */
      }
    }
  }
  return blob ? URL.createObjectURL(blob) : null;
}
