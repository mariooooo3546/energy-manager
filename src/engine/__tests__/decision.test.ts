import { describe, it, expect } from "vitest";
import { DecisionEngine } from "../decision";
import { PstrykPriceFrame, TradeConditions } from "@/src/lib/types";

const config: TradeConditions = {
  sellMinPrice: 0.80,
  sellMinSoc: 20,
  buyMaxPrice: 0.30,
  buyMaxSoc: 90,
  minSocFloor: 10,
};

function makeFrames(prices: number[]): PstrykPriceFrame[] {
  return prices.map((p, i) => ({
    start: `2026-04-14T${String(i).padStart(2, "0")}:00:00Z`,
    end: `2026-04-14T${String(i + 1).padStart(2, "0")}:00:00Z`,
    metrics: {
      pricing: {
        price_gross: p,
        price_prosumer_gross: p * 0.6,
        is_cheap: false,
        is_expensive: false,
      },
    },
  }));
}

// Prices: 0.10, 0.20, 0.30, ..., 1.00 (10 hours)
const frames = makeFrames([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]);

describe("DecisionEngine", () => {
  const engine = new DecisionEngine(config);

  it("decides CHARGE when price is low and SOC is low", () => {
    // hour 0, price 0.10 — well below 25th percentile (0.325)
    const decision = engine.decide(frames, 0, 50);
    expect(decision.action).toBe("CHARGE");
  });

  it("decides SELL when price is high and SOC is sufficient", () => {
    // hour 9, price 1.00 — well above 75th percentile (0.775)
    const decision = engine.decide(frames, 9, 80);
    expect(decision.action).toBe("SELL");
  });

  it("decides NORMAL when price is mid-range", () => {
    // hour 5, price 0.60 — between percentiles
    const decision = engine.decide(frames, 5, 50);
    expect(decision.action).toBe("NORMAL");
  });

  it("does not charge when SOC is already high", () => {
    // hour 0, price 0.10 but SOC is 95%
    const decision = engine.decide(frames, 0, 95);
    expect(decision.action).toBe("NORMAL");
  });

  it("does not sell when SOC is too low", () => {
    // hour 9, price 1.00 but SOC is 10%
    const decision = engine.decide(frames, 9, 10);
    expect(decision.action).toBe("NORMAL");
  });
});
