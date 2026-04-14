import { PstrykResponse } from "@/src/lib/types";

const BASE_URL = "https://api.pstryk.pl/integrations";

export class PstrykClient {
  constructor(private apiKey: string) {}

  async getTodayPrices(): Promise<PstrykResponse> {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    return this.fetchPrices(startOfDay, endOfDay);
  }

  async getTomorrowPrices(): Promise<PstrykResponse> {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const start = new Date(tomorrow);
    start.setHours(0, 0, 0, 0);

    const end = new Date(tomorrow);
    end.setHours(23, 59, 59, 999);

    return this.fetchPrices(start, end);
  }

  private async fetchPrices(start: Date, end: Date): Promise<PstrykResponse> {
    const params = new URLSearchParams({
      metrics: "pricing",
      resolution: "hour",
      window_start: start.toISOString(),
      window_end: end.toISOString(),
    });

    const res = await fetch(`${BASE_URL}/meter-data/unified-metrics/?${params}`, {
      headers: {
        Authorization: this.apiKey,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`Pstryk API error: ${res.status}`);
    }

    return res.json();
  }
}
