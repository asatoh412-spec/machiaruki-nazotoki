// 記録に付ける写真。保存の前に必ず端末内で縮める（長辺1600px、JPEG画質70%）。
// 縮小の過程で位置情報などのメタデータは消える。アルバムの原本には触れない。
import { createStore, del, entries, get, set } from 'idb-keyval';
import { shrink } from './images.ts';

export interface Photo {
  id: string;
  pointId: string;
  runId: string;
  at: string;
  blob: Blob;
}

const store = createStore('machiaruki-photos', 'photos');

export async function addPhoto(pointId: string, runId: string, file: Blob): Promise<Photo> {
  const blob = await shrink(file, 1600, 0.7);
  const ph: Photo = { id: `${pointId}:${Date.now().toString(36)}`, pointId, runId, at: new Date().toISOString(), blob };
  await set(ph.id, ph, store);
  return ph;
}

export async function photosOf(pointId: string): Promise<Photo[]> {
  const all = (await entries<string, Photo>(store)).map(([, v]) => v);
  return all.filter((p) => p.pointId === pointId).sort((a, b) => a.at.localeCompare(b.at));
}

export const getPhoto = (id: string) => get<Photo>(id, store);
export const deletePhoto = (id: string) => del(id, store);

export async function photoStats(): Promise<{ count: number; bytes: number }> {
  const all = (await entries<string, Photo>(store)).map(([, v]) => v);
  return { count: all.length, bytes: all.reduce((a, p) => a + p.blob.size, 0) };
}

export async function deleteAllPhotos() {
  for (const [k] of await entries<string, Photo>(store)) await del(k, store);
}
