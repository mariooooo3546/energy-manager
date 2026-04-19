/**
 * Forecast.Solar API client
 * Free API: https://api.forecast.solar/estimate/:lat/:lon/:dec/:az/:kwp
 *
 * Configure via env vars: PV_LAT, PV_LON, PV_POSTAL_CODE, PV_DEC, PV_AZ, PV_KWP
 */

export interface PvForecastHour {
  time: string;    // ISO timestamp
  hour: number;    // 0-23
  watts: number;   // average watts for this hour
  wattHours: number; // energy in this hour (Wh)
}

export interface PvForecastDay {
  date: string;           // YYYY-MM-DD
  totalWh: number;        // total Wh for the day
  totalKwh: number;       // total kWh for the day
  hours: PvForecastHour[];
}

export interface PvForecastResponse {
  today: PvForecastDay | null;
  tomorrow: PvForecastDay | null;
}

const DEFAULT_CONFIG = {
  dec: 35,        // 35° tilt (typical Poland)
  az: 0,          // South-facing
  kwp: 10,        // 10 kWp
};

export class ForecastSolarClient {
  private lat: number;
  private lon: number;
  private postalCode: string | null;
  private dec: number;
  private az: number;
  private kwp: number;

  constructor(config?: Partial<typeof DEFAULT_CONFIG> & { lat?: number; lon?: number; postalCode?: string }) {
    const c = { ...DEFAULT_CONFIG, ...config };
    const lat = process.env.PV_LAT ?? (config?.lat !== undefined ? String(config.lat) : undefined);
    const lon = process.env.PV_LON ?? (config?.lon !== undefined ? String(config.lon) : undefined);
    if (!lat || !lon) {
      throw new Error("PV_LAT and PV_LON env vars are required (or pass lat/lon to constructor)");
    }
    this.lat = parseFloat(lat);
    this.lon = parseFloat(lon);
    this.postalCode = process.env.PV_POSTAL_CODE ?? config?.postalCode ?? null;
    this.dec = parseFloat(process.env.PV_DEC || String(c.dec));
    this.az = parseFloat(process.env.PV_AZ || String(c.az));
    this.kwp = parseFloat(process.env.PV_KWP || String(c.kwp));
  }

  async getForecast(): Promise<PvForecastResponse> {
    const url = `https://api.forecast.solar/estimate/${this.lat}/${this.lon}/${this.dec}/${this.az}/${this.kwp}`;

    const res = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      throw new Error(`Forecast.Solar error: ${res.status}`);
    }

    const json = await res.json();
    // API returns { result: { watts: { "2026-04-15 06:00:00": 123, ... }, watt_hours_period: {...}, watt_hours_day: {...} } }
    const watts = json.result?.watts ?? {};
    const whPeriod = json.result?.watt_hours_period ?? {};
    const whDay = json.result?.watt_hours_day ?? {};

    const today = new Date().toISOString().split("T")[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

    return {
      today: this.parseDayForecast(today, watts, whPeriod, whDay),
      tomorrow: this.parseDayForecast(tomorrow, watts, whPeriod, whDay),
    };
  }

  private parseDayForecast(
    date: string,
    watts: Record<string, number>,
    whPeriod: Record<string, number>,
    whDay: Record<string, number>
  ): PvForecastDay | null {
    const hours: PvForecastHour[] = [];

    // Group by hour
    const hourlyWatts = new Map<number, number[]>();
    const hourlyWh = new Map<number, number>();

    for (const [timeStr, w] of Object.entries(watts)) {
      if (!timeStr.startsWith(date)) continue;
      const hour = parseInt(timeStr.split(" ")[1].split(":")[0]);
      if (!hourlyWatts.has(hour)) hourlyWatts.set(hour, []);
      hourlyWatts.get(hour)!.push(w);
    }

    for (const [timeStr, wh] of Object.entries(whPeriod)) {
      if (!timeStr.startsWith(date)) continue;
      const hour = parseInt(timeStr.split(" ")[1].split(":")[0]);
      hourlyWh.set(hour, (hourlyWh.get(hour) ?? 0) + wh);
    }

    for (const [hour, wArr] of hourlyWatts) {
      const avgWatts = Math.round(wArr.reduce((a, b) => a + b, 0) / wArr.length);
      hours.push({
        time: `${date}T${String(hour).padStart(2, "0")}:00:00`,
        hour,
        watts: avgWatts,
        wattHours: hourlyWh.get(hour) ?? 0,
      });
    }

    hours.sort((a, b) => a.hour - b.hour);

    const totalWh = whDay[date] ?? hours.reduce((sum, h) => sum + h.wattHours, 0);

    if (hours.length === 0) return null;

    return {
      date,
      totalWh,
      totalKwh: Math.round(totalWh / 10) / 100,
      hours,
    };
  }
}
