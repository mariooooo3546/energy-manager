import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DecisionLogger } from "../logger";
import { getStore } from "../storage";

describe("DecisionLogger", () => {
  let logger: DecisionLogger;

  beforeEach(async () => {
    logger = new DecisionLogger();
    // Clear decisions before each test
    await getStore().set("decisions", []);
  });

  it("logs a decision and reads it back", async () => {
    const decision = {
      timestamp: "2026-04-14T12:00:00Z",
      action: "CHARGE" as const,
      reason: "Tania energia",
      soc: 45,
      buyPrice: 0.15,
      sellPrice: 0.09,
      thresholds: { lowPrice: 0.2, highPrice: 0.7 },
    };

    await logger.log(decision);
    const history = await logger.getHistory(10);
    expect(history).toHaveLength(1);
    expect(history[0].action).toBe("CHARGE");
  });

  it("returns most recent entries", async () => {
    for (let i = 0; i < 5; i++) {
      await logger.log({
        timestamp: `2026-04-14T${10 + i}:00:00Z`,
        action: "NORMAL",
        reason: `entry ${i}`,
        soc: 50,
        buyPrice: 0.5,
        sellPrice: 0.3,
        thresholds: { lowPrice: 0.2, highPrice: 0.7 },
      });
    }

    const history = await logger.getHistory(3);
    expect(history).toHaveLength(3);
    expect(history[0].reason).toBe("entry 2");
  });
});
