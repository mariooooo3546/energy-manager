/**
 * Solcast API client with KV-cached responses.
 *
 * Free Hobbyist tier: 10 calls/day/site. One call returns the full 7-day
 * forecast at 30-min resolution, so we cache for 6h and refresh at most
 * 4×/day — leaving 6 calls/day of headroom.
 *
 * Docs: https://docs.solcast.com.au/#overview
 * Endpoint: GET /rooftop_sites/{resource_id}/forecasts?format=json
 */

import { getStore } from "../lib/storage";

const SOLCAST_BASE = "https://api.solcast.com.au";
const CACHE_KEY = "solcast_forecast";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

export interface PvForecastHour {
  time: string;     // ISO local (Europe/Warsaw) start of hour
  hour: number;     // 0-23
  watts: number;    // average power during hour (W, p50)
  wattHours: number; // energy during hour (Wh, p50)
  wattsP10?: number; // pessimistic
  wattsP90?: number; // optimistic
}

export interface PvForecastDay {
  date: string;     // YYYY-MM-DD (Europe/Warsaw)
  totalWh: number;
  totalKwh: number;
  totalKwhP10: number;
  totalKwhP90: number;
  hours: PvForecastHour[];
}

export interface PvForecastResponse {
  today: PvForecastDay | null;
  tomorrow: PvForecastDay | null;
  source: "solcast";
  fetchedAt: string;
  cached: boolean;
}

interface SolcastRawForecast {
  pv_estimate: number;   // kW p50
  pv_estimate10: number; // kW p10
  pv_estimate90: number; // kW p90
  period_end: string;    // ISO UTC
  period: string;        // ISO-8601 duration, e.g. "PT30M"
}

interface CachedEntry {
  fetchedAt: string;
  forecasts: SolcastRawForecast[];
}

function warsawDate(d: Date): { date: string; hour: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  const h = parseInt(parts.find((p) => p.type === "hour")!.value);
  return { date: `${y}-${m}-${day}`, hour: h };
}

function parsePeriodMinutes(period: string): number {
  // "PT30M" → 30, "PT1H" → 60
  const m = period.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return 30;
  return (parseInt(m[1] ?? "0") * 60) + parseInt(m[2] ?? "0");
}

export class SolcastClient {
  private apiKey: string;
  private siteId: string;

  constructor(config?: { apiKey?: string; siteId?: string }) {
    this.apiKey = config?.apiKey ?? process.env.SOLCAST_API_KEY ?? "";
    this.siteId = config?.siteId ?? process.env.SOLCAST_SITE_ID ?? "";
    if (!this.apiKey || !this.siteId) {
      throw new Error("Solcast: SOLCAST_API_KEY and SOLCAST_SITE_ID are required");
    }
  }

  async getForecast(opts: { forceRefresh?: boolean } = {}): Promise<PvForecastResponse> {
    const cached = await this.readCache();
    const fresh = cached && Date.now() - new Date(cached.fetchedAt).getTime() < CACHE_TTL_MS;

    let entry: CachedEntry;
    let wasCached = false;
    if (cached && fresh && !opts.forceRefresh) {
      entry = cached;
      wasCached = true;
    } else {
      entry = await this.fetchFresh();
      await this.writeCache(entry);
    }

    return {
      ...this.shapeForecast(entry.forecasts),
      source: "solcast",
      fetchedAt: entry.fetchedAt,
      cached: wasCached,
    };
  }

  private async fetchFresh(): Promise<CachedEntry> {
    const url = `${SOLCAST_BASE}/rooftop_sites/${this.siteId}/forecasts?format=json`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Solcast HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = await res.json();
    const forecasts: SolcastRawForecast[] = json.forecasts ?? [];
    return { fetchedAt: new Date().toISOString(), forecasts };
  }

  private async readCache(): Promise<CachedEntry | null> {
    return getStore().get<CachedEntry>(CACHE_KEY);
  }

  private async writeCache(entry: CachedEntry): Promise<void> {
    await getStore().set(CACHE_KEY, entry);
  }

  private shapeForecast(raws: SolcastRawForecast[]): {
    today: PvForecastDay | null;
    tomorrow: PvForecastDay | null;
  } {
    const now = new Date();
    const todayKey = warsawDate(now).date;
    const tomorrowKey = warsawDate(new Date(now.getTime() + 86400000)).date;

    // Group 30-min samples into per-hour buckets, keyed by Warsaw date + hour.
    interface Bucket {
      watts: number[];
      wattsP10: number[];
      wattsP90: number[];
      wh: number;
      whP10: number;
      whP90: number;
    }
    const byDayHour = new Map<string, Map<number, Bucket>>();

    for (const f of raws) {
      const periodMin = parsePeriodMinutes(f.period);
      const hourFraction = periodMin / 60;
      // period_end is the END of the window; treat as the hour it falls into.
      const endDate = new Date(f.period_end);
      const { date, hour } = warsawDate(endDate);
      if (date !== todayKey && date !== tomorrowKey) continue;

      if (!byDayHour.has(date)) byDayHour.set(date, new Map());
      const hourMap = byDayHour.get(date)!;
      if (!hourMap.has(hour)) {
        hourMap.set(hour, { watts: [], wattsP10: [], wattsP90: [], wh: 0, whP10: 0, whP90: 0 });
      }
      const bucket = hourMap.get(hour)!;
      bucket.watts.push(f.pv_estimate * 1000);
      bucket.wattsP10.push(f.pv_estimate10 * 1000);
      bucket.wattsP90.push(f.pv_estimate90 * 1000);
      bucket.wh += f.pv_estimate * 1000 * hourFraction;
      bucket.whP10 += f.pv_estimate10 * 1000 * hourFraction;
      bucket.whP90 += f.pv_estimate90 * 1000 * hourFraction;
    }

    const buildDay = (key: string): PvForecastDay | null => {
      const hourMap = byDayHour.get(key);
      if (!hourMap || hourMap.size === 0) return null;
      const hours: PvForecastHour[] = [];
      let totalWh = 0;
      let totalWhP10 = 0;
      let totalWhP90 = 0;
      for (const [h, b] of [...hourMap.entries()].sort((a, b) => a[0] - b[0])) {
        const avg = (arr: number[]) => Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
        hours.push({
          time: `${key}T${String(h).padStart(2, "0")}:00:00+02:00`,
          hour: h,
          watts: avg(b.watts),
          wattHours: Math.round(b.wh),
          wattsP10: avg(b.wattsP10),
          wattsP90: avg(b.wattsP90),
        });
        totalWh += b.wh;
        totalWhP10 += b.whP10;
        totalWhP90 += b.whP90;
      }
      return {
        date: key,
        totalWh: Math.round(totalWh),
        totalKwh: Math.round(totalWh / 10) / 100,
        totalKwhP10: Math.round(totalWhP10 / 10) / 100,
        totalKwhP90: Math.round(totalWhP90 / 10) / 100,
        hours,
      };
    };

    return {
      today: buildDay(todayKey),
      tomorrow: buildDay(tomorrowKey),
    };
  }
}
