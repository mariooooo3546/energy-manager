import { describe, it, expect, vi, beforeEach } from "vitest";
import { PstrykClient } from "../pstryk";

const mockPriceResponse = {
  frames: [
    {
      start: "2026-04-14T00:00:00Z",
      end: "2026-04-14T01:00:00Z",
      metrics: {
        pricing: {
          price_gross: 0.35,
          price_prosumer_gross: 0.2,
          is_cheap: true,
          is_expensive: false,
        },
      },
    },
    {
      start: "2026-04-14T01:00:00Z",
      end: "2026-04-14T02:00:00Z",
      metrics: {
        pricing: {
          price_gross: 0.85,
          price_prosumer_gross: 0.55,
          is_cheap: false,
          is_expensive: true,
        },
      },
    },
  ],
};

describe("PstrykClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches today prices with correct URL and auth header", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(mockPriceResponse), { status: 200 })
    );

    const client = new PstrykClient("test-api-key");
    const result = await client.getTodayPrices();

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toContain("api.pstryk.pl/integrations/meter-data/unified-metrics");
    expect(url).toContain("metrics=pricing");
    expect(url).toContain("resolution=hour");
    expect((options as RequestInit).headers).toHaveProperty("Authorization", "test-api-key");
    expect(result.frames).toHaveLength(2);
    expect(result.frames[0].metrics.pricing.price_gross).toBe(0.35);
  });

  it("throws on non-200 response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Unauthorized", { status: 401 })
    );

    const client = new PstrykClient("bad-key");
    await expect(client.getTodayPrices()).rejects.toThrow("Pstryk API error: 401");
  });
});
