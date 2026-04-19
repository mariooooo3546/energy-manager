import { EvAction, EvConfig, EvDecisionInput } from "@/src/lib/types";

export const DEFAULT_EV_CONFIG: EvConfig = {
  maxAmps: 16,
  surplusThresholdW: 1400,      // ≈ 6 A × 230 V — minimum to start 1-phase
  cheapPriceThreshold: 0.30,    // below 0.30 zł/kWh → consider grid charging
  minBatterySoc: 40,            // don't drain battery below 40% into EV
  phaseSwitchThresholdW: 4200,  // ≥ 4.2 kW surplus → go 3-phase
};

/**
 * Given current inverter + price + override state, decide what the EV
 * charger should do this tick. Pure function — no side effects.
 *
 * Priority (user requested): battery (magazyn) > EV > sell.
 * Rules:
 *   STOP override → STOP
 *   FAST          → force 16 A × 3 ph (ignore economics)
 *   ECO           → only when PV surplus, amps tracked to surplus
 *   CHEAP         → only when buyPrice < threshold AND not in sell-schedule
 *   AUTO          → surplus first, then cheap prices (never during sell-schedule,
 *                   never below battery SOC floor)
 */
export function decideEv(
  input: EvDecisionInput,
  config: EvConfig = DEFAULT_EV_CONFIG
): EvAction {
  const { override, gridPower, soc, buyPrice, inSellSchedule, isCharging } = input;

  // ── Explicit STOP ──────────────────────────────────────────────────────
  if (override.mode === "STOP") {
    return isCharging
      ? { action: "STOP", amps: 0, phases: 1, reason: "Override STOP" }
      : { action: "HOLD", amps: 0, phases: 1, reason: "Override STOP (nic nie \u0142aduje)" };
  }

  // ── During inverter sell-schedule, block EV to protect peak revenue ────
  // (user-stated priority: sprzedaż out of battery > EV in normal AUTO,
  //  but FAST override can still force charging)
  if (override.mode !== "FAST" && inSellSchedule) {
    return isCharging
      ? { action: "STOP", amps: 0, phases: 1, reason: "Aktywny peak-sell baterii \u2192 blokada EV" }
      : { action: "HOLD", amps: 0, phases: 1, reason: "Aktywny peak-sell baterii" };
  }

  // ── FAST: force full power ────────────────────────────────────────────
  if (override.mode === "FAST") {
    return isCharging
      ? { action: "SET_CURRENT", amps: config.maxAmps, phases: 3, reason: `FAST: ${config.maxAmps} A \u00d7 3f` }
      : { action: "START", amps: config.maxAmps, phases: 3, reason: `FAST start: ${config.maxAmps} A \u00d7 3f` };
  }

  // ── Battery protection: don't discharge battery into EV ────────────────
  // gridPower <= 0 means we're not importing (either balanced or exporting).
  // If battery SOC is low AND there's no real PV surplus, stop.
  const pvSurplusW = Math.max(0, -gridPower); // export to grid as positive
  const batteryBelowFloor = soc < config.minBatterySoc;

  // ── ECO: only PV surplus ──────────────────────────────────────────────
  if (override.mode === "ECO") {
    if (pvSurplusW < config.surplusThresholdW) {
      return isCharging
        ? { action: "STOP", amps: 0, phases: 1, reason: `ECO: brak nadwy\u017cki PV (${pvSurplusW} W < ${config.surplusThresholdW} W)` }
        : { action: "HOLD", amps: 0, phases: 1, reason: "ECO: czekam na nadwy\u017ck\u0119 PV" };
    }
    return pvSurplusAction(pvSurplusW, config, isCharging, "ECO");
  }

  // ── CHEAP: grid charging when price low enough ────────────────────────
  if (override.mode === "CHEAP") {
    if (buyPrice > config.cheapPriceThreshold) {
      return isCharging
        ? { action: "STOP", amps: 0, phases: 1, reason: `CHEAP: cena ${buyPrice.toFixed(2)} > pr\u00f3g ${config.cheapPriceThreshold}` }
        : { action: "HOLD", amps: 0, phases: 1, reason: `CHEAP: czekam na tani\u0105 godzin\u0119 (cena ${buyPrice.toFixed(2)})` };
    }
    return isCharging
      ? { action: "SET_CURRENT", amps: config.maxAmps, phases: 3, reason: `CHEAP: cena ${buyPrice.toFixed(2)} \u2264 ${config.cheapPriceThreshold} \u2192 pe\u0142na moc` }
      : { action: "START", amps: config.maxAmps, phases: 3, reason: `CHEAP start: cena ${buyPrice.toFixed(2)} zl/kWh` };
  }

  // ── AUTO: PV surplus first, then cheap prices (never below battery floor) ─
  if (pvSurplusW >= config.surplusThresholdW) {
    return pvSurplusAction(pvSurplusW, config, isCharging, "AUTO");
  }
  if (buyPrice <= config.cheapPriceThreshold && !batteryBelowFloor) {
    return isCharging
      ? { action: "SET_CURRENT", amps: config.maxAmps, phases: 3, reason: `AUTO: tania godzina (${buyPrice.toFixed(2)})` }
      : { action: "START", amps: config.maxAmps, phases: 3, reason: `AUTO start: tania godzina (${buyPrice.toFixed(2)})` };
  }

  // Default AUTO: idle
  if (isCharging) {
    return { action: "STOP", amps: 0, phases: 1, reason: "AUTO: brak nadwy\u017cki PV ani taniego pr\u0105du" };
  }
  return { action: "HOLD", amps: 0, phases: 1, reason: "AUTO: czekam na PV surplus lub tani\u0105 godzin\u0119" };
}

function pvSurplusAction(
  surplusW: number,
  config: EvConfig,
  isCharging: boolean,
  tag: string
): EvAction {
  const phases: 1 | 3 = surplusW >= config.phaseSwitchThresholdW ? 3 : 1;
  const denom = phases * 230;
  const ampsRaw = Math.floor(surplusW / denom);
  const amps = Math.min(config.maxAmps, Math.max(6, ampsRaw)); // go-e min is 6 A
  const reason = `${tag}: PV surplus ${surplusW} W \u2192 ${amps} A \u00d7 ${phases}f`;
  return isCharging
    ? { action: "SET_CURRENT", amps, phases, reason }
    : { action: "START", amps, phases, reason };
}
