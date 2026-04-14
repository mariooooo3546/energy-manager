import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DecisionLogger } from "../logger";
import fs from "fs";
import path from "path";

const TEST_LOG_PATH = path.join(process.cwd(), "data", "test-decisions.json");

describe("DecisionLogger", () => {
  let logger: DecisionLogger;

  beforeEach(() => {
    logger = new DecisionLogger(TEST_LOG_PATH);
  });

  afterEach(() => {
    if (fs.existsSync(TEST_LOG_PATH)) fs.unlinkSync(TEST_LOG_PATH);
  });

  it("logs a decision and reads it back", () => {
    const decision = {
      timestamp: "2026-04-14T12:00:00Z",
      action: "CHARGE" as const,
      reason: "Tania energia",
      soc: 45,
      buyPrice: 0.15,
      sellPrice: 0.09,
      thresholds: { lowPrice: 0.2, highPrice: 0.7 },
    };

    logger.log(decision);
    const history = logger.getHistory(10);
    expect(history).toHaveLength(1);
    expect(history[0].action).toBe("CHARGE");
  });

  it("returns most recent entries first", () => {
    for (let i = 0; i < 5; i++) {
      logger.log({
        timestamp: `2026-04-14T${10 + i}:00:00Z`,
        action: "NORMAL",
        reason: `entry ${i}`,
        soc: 50,
        buyPrice: 0.5,
        sellPrice: 0.3,
        thresholds: { lowPrice: 0.2, highPrice: 0.7 },
      });
    }

    const history = logger.getHistory(3);
    expect(history).toHaveLength(3);
    expect(history[0].reason).toBe("entry 4");
  });
});
