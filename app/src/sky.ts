// 日没（端末内で計算）と天気（Open-Meteo）。
// 天気: Open-Meteo（非商用は無料、キー不要、CC BY 4.0。表示「Weather data by Open-Meteo.com」）。
// 降水確率は海外のアンサンブルモデル由来で、気象庁の予報の降水確率とは別物（あきの了承済み）。
import SunCalc from 'suncalc';

export function sunsetOf(date: Date, lat: number, lon: number): Date {
  return SunCalc.getTimes(date, lat, lon).sunset;
}

export interface WeatherSummary {
  maxProb: number | null; // 期間中の最大の降水確率（%）
  precipMm: number | null; // 期間中の降水量の合計（mm）
  minTemp: number | null; // 期間中の最低気温（℃）
  maxTemp: number | null;
  rainy: boolean;
  cold: boolean;
}

export const RAIN_PROB = 50; // 降水確率がこれ以上なら雨の扱い
export const RAIN_MM = 0.5;
export const COLD_C = 10; // 最低気温がこれ以下なら寒い日の扱い

export async function weatherFor(lat: number, lon: number, from: Date, minutes: number, timeoutMs = 8000): Promise<WeatherSummary | null> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    '&hourly=temperature_2m,precipitation_probability,precipitation&timezone=Asia%2FTokyo&forecast_days=3';
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) return null;
    const j = await r.json();
    return summarize(j.hourly, from, minutes);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// 時間ごとの予報から、出発から終わりまでの時間帯を取り出してまとめる（時刻は東京時間の "YYYY-MM-DDTHH:00"）
export function summarize(h: { time: string[]; temperature_2m: number[]; precipitation_probability: (number | null)[]; precipitation: number[] }, from: Date, minutes: number): WeatherSummary {
  const end = new Date(from.getTime() + minutes * 60000);
  const tokyo = (d: Date) => new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 13);
  const a = tokyo(from); // 出発した時間帯から
  const b = tokyo(end);
  const idx = h.time.map((s, i) => [s.slice(0, 13), i] as const).filter(([s]) => s >= a && s <= b).map(([, i]) => i);
  const pick = <T,>(arr: T[]) => idx.map((i) => arr[i]).filter((v): v is NonNullable<T> => v !== null && v !== undefined);
  const prob = pick(h.precipitation_probability) as number[];
  const temp = pick(h.temperature_2m) as number[];
  const mm = pick(h.precipitation) as number[];
  const maxProb = prob.length ? Math.max(...prob) : null;
  const precipMm = mm.length ? Math.round(mm.reduce((x, y) => x + y, 0) * 10) / 10 : null;
  const minTemp = temp.length ? Math.min(...temp) : null;
  const maxTemp = temp.length ? Math.max(...temp) : null;
  return {
    maxProb,
    precipMm,
    minTemp,
    maxTemp,
    rainy: (maxProb ?? 0) >= RAIN_PROB || (precipMm ?? 0) >= RAIN_MM,
    cold: minTemp !== null && minTemp <= COLD_C,
  };
}
