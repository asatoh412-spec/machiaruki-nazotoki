// パックの形式の検査（端末内とテストで共用）
import type { Pack } from './types.ts';

export function validatePackShape(x: unknown): string[] {
  const errs: string[] = [];
  const p = x as Partial<Pack>;
  if (!p || typeof p !== 'object') return ['JSONの形式ではありません'];
  if (p.schema !== 'machiaruki-pack/1') errs.push(`形式が違います（schema: ${String(p.schema)}）`);
  if (!p.pack_id) errs.push('pack_id がありません');
  if (!Array.isArray(p.points) || p.points.length === 0) errs.push('地点がありません');
  if (!Array.isArray(p.stations) || p.stations.length === 0) errs.push('駅がありません');
  for (const pt of p.points ?? []) {
    if (typeof pt.lat !== 'number' || typeof pt.lon !== 'number') errs.push(`${pt.name}: 座標がありません`);
    if (!pt.answer?.accept?.length) errs.push(`${pt.name}: 答えがありません`);
    if (!pt.sources?.length) errs.push(`${pt.name}: 出典がありません`);
  }
  return errs;
}

