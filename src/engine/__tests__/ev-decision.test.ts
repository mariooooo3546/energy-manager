import { describe, it, expect } from "vitest";
import { decideEv, DEFAULT_EV_CONFIG } from "../ev-decision";
import { EvDecisionInput, EvMode } from "@/src/lib/types";

function input(overrides: Partial<EvDecisionInput> & { mode?: EvMode } = {}): EvDecisionInput {
  const { mode, ...rest } = overrides;
  return {
    override: { mode: mode ?? "AUTO", setAt: new Date().toISOString() },
    gridPower: 0,
    soc: 70,
    buyPrice: 0.6,
    inSellSchedule: false,
    isCharging: false,
    ...rest,
  };
}

describe("decideEv", () => {
  it("STOP override → STOP when charging, HOLD when idle", () => {
    expect(decideEv(input({ mode: "STOP", isCharging: true })).action).toBe("STOP");
    expect(decideEv(input({ mode: "STOP", isCharging: false })).action).toBe("HOLD");
  });

  it("FAST override → always 16A × 3f, ignores sell-schedule", () => {
    const d = decideEv(input({ mode: "FAST", inSellSchedule: true, isCharging: false }));
    expect(d.action).toBe("START");
    expect(d.amps).toBe(16);
    expect(d.phases).toBe(3);
  });

  it("AUTO + inSellSchedule → blocks EV (peak-sell priority)", () => {
    const d = decideEv(input({ mode: "AUTO", inSellSchedule: true, gridPower: -5000 }));
    expect(d.action).toBe("HOLD");
    expect(d.reason).toMatch(/peak-sell/);
  });

  it("ECO + no surplus → HOLD (never drains battery)", () => {
    const d = decideEv(input({ mode: "ECO", gridPower: 500 })); // importing
    expect(d.action).toBe("HOLD");
    expect(d.reason).toMatch(/ECO.*PV/);
  });

  it("ECO + strong PV surplus (≥4.2 kW) → 3-phase START", () => {
    // 5000 W surplus → 5000/(3*230) = 7.2 → 7 A × 3
    const d = decideEv(input({ mode: "ECO", gridPower: -5000 }));
    expect(d.action).toBe("START");
    expect(d.phases).toBe(3);
    expect(d.amps).toBeGreaterThanOrEqual(6);
    expect(d.amps).toBeLessThanOrEqual(16);
  });

  it("ECO + medium PV surplus (~2 kW) → 1-phase charge", () => {
    // 2000 W / 230 = 8.7 → 8 A × 1
    const d = decideEv(input({ mode: "ECO", gridPower: -2000 }));
    expect(d.phases).toBe(1);
    expect(d.amps).toBe(8);
  });

  it("CHEAP + price above threshold → HOLD", () => {
    const d = decideEv(input({ mode: "CHEAP", buyPrice: 0.6 }));
    expect(d.action).toBe("HOLD");
  });

  it("CHEAP + price below threshold → full-power START", () => {
    const d = decideEv(input({ mode: "CHEAP", buyPrice: 0.2 }));
    expect(d.action).toBe("START");
    expect(d.amps).toBe(16);
  });

  it("AUTO + PV surplus has priority over cheap-price rule", () => {
    const d = decideEv(input({ mode: "AUTO", gridPower: -5000, buyPrice: 0.2 }));
    expect(d.reason).toMatch(/PV surplus/);
  });

  it("AUTO + low price + low battery SOC → HOLD (protect battery)", () => {
    const d = decideEv(input({ mode: "AUTO", buyPrice: 0.2, soc: 30 }));
    expect(d.action).toBe("HOLD");
  });

  it("AUTO + low price + sufficient battery → START", () => {
    const d = decideEv(input({ mode: "AUTO", buyPrice: 0.2, soc: 60 }));
    expect(d.action).toBe("START");
    expect(d.amps).toBe(16);
  });

  it("AUTO + no surplus + expensive → HOLD idle / STOP charging", () => {
    expect(decideEv(input({ mode: "AUTO", isCharging: false })).action).toBe("HOLD");
    expect(decideEv(input({ mode: "AUTO", isCharging: true })).action).toBe("STOP");
  });

  it("respects DEFAULT_EV_CONFIG.maxAmps clamp", () => {
    // Massive surplus should not exceed maxAmps (16)
    const d = decideEv(input({ mode: "ECO", gridPower: -30_000 }));
    expect(d.amps).toBeLessThanOrEqual(DEFAULT_EV_CONFIG.maxAmps);
  });
});
