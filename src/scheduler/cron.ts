import { PstrykClient } from "@/src/clients/pstryk";
import { DeyeCloudClient } from "@/src/clients/deye";
import { DecisionEngine } from "@/src/engine/decision";
import { DecisionLogger } from "@/src/lib/logger";
import {
  getConditions,
  getOverride,
  getScheduleForHour,
  getSchedule,
  getMaxSellPower,
} from "@/src/lib/config";
import { DecisionAction } from "@/src/lib/types";
import { TouTimeSlot } from "@/src/clients/deye";

export interface SchedulerDeps {
  pstryk: PstrykClient;
  deye: DeyeCloudClient;
  logger: DecisionLogger;
  onDecision?: (action: DecisionAction, reason: string, soc: number) => void;
}

export async function runCycle(deps: SchedulerDeps): Promise<void> {
  const { pstryk, deye, logger, onDecision } = deps;

  // Check for manual override
  const override = await getOverride();
  if (override.active && override.action) {
    console.log(`[Scheduler] Override active: ${override.action}`);
    await applyAction(deye, override.action);
    return;
  }

  // 1. Fetch inverter status
  const status = await deye.getStatus();

  // 2. Check hourly schedule (NADRZĘDNY - ma priorytet nad warunkami)
  const currentHour = new Date().getHours();
  const scheduledTarget = await getScheduleForHour(currentHour);
  if (scheduledTarget !== null) {
    // Harmonogram jest ustawiony na tę godzinę - warunki nie mają znaczenia
    const action = status.soc > scheduledTarget ? "SELL" : "NORMAL";
    const reason = status.soc > scheduledTarget
      ? `Harmonogram: SOC ${status.soc}% > cel ${scheduledTarget}% → sprzedaż`
      : `Harmonogram: SOC ${status.soc}% <= cel ${scheduledTarget}% → trzymaj`;
    console.log(`[Scheduler] ${reason}`);
    await applyAction(deye, action);
    await logger.log({
      timestamp: new Date().toISOString(),
      action,
      reason,
      soc: status.soc,
      buyPrice: 0,
      sellPrice: 0,
      thresholds: { lowPrice: 0, highPrice: 0 },
    });
    onDecision?.(action, reason, status.soc);
    return;
  }

  // 3. Brak harmonogramu na tę godzinę → użyj warunków handlu
  const prices = await pstryk.getTodayPrices();
  const conditions = await getConditions();
  const engine = new DecisionEngine(conditions);
  const decision = engine.decide(prices.frames, currentHour, status.soc);

  // 5. Apply
  await applyAction(deye, decision.action);

  // 6. Log
  await logger.log(decision);
  console.log(`[Scheduler] ${decision.action}: ${decision.reason}`);

  // 7. Notify
  onDecision?.(decision.action, decision.reason, status.soc);
}

async function buildTouSlots(): Promise<TouTimeSlot[]> {
  const schedule = await getSchedule();
  const maxPower = getMaxSellPower();

  // Deye requires exactly 6 TOU time slots.
  const activeSlots: TouTimeSlot[] = [];
  for (let h = 0; h < 24; h++) {
    const target = schedule[String(h)];
    if (target !== undefined) {
      activeSlots.push({
        time: `${String(h).padStart(2, "0")}:00`,
        power: maxPower,
        soc: target,
        enableGeneration: true,
        enableGridCharge: false,
      });
    }
  }

  const usedHours = new Set(Object.keys(schedule).map(Number));
  const passiveHours = Array.from({ length: 24 }, (_, i) => i).filter(
    (h) => !usedHours.has(h)
  );

  const passiveSlot = (hour: number): TouTimeSlot => ({
    time: `${String(hour).padStart(2, "0")}:00`,
    power: 0,
    soc: 100,
    enableGeneration: true,
    enableGridCharge: false,
  });

  const slots = [...activeSlots];
  const needed = 6 - slots.length;
  if (needed > 0) {
    const step = Math.max(1, Math.floor(passiveHours.length / needed));
    for (let i = 0; i < needed && i * step < passiveHours.length; i++) {
      slots.push(passiveSlot(passiveHours[i * step]));
    }
  }

  slots.sort((a, b) => a.time.localeCompare(b.time));
  return slots.slice(0, 6);
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function applyAction(
  deye: DeyeCloudClient,
  action: DecisionAction
): Promise<void> {
  const maxPower = getMaxSellPower();

  // Use individual commands (like gboptimizer) for reliable inverter control
  switch (action) {
    case "CHARGE":
      console.log("[Apply] CHARGE: gridCharge=on, solarSell=off, mode=ZERO_EXPORT_TO_LOAD");
      await deye.setGridCharge(true);
      await delay(3000);
      await deye.setSolarSell(false);
      await delay(3000);
      await deye.setWorkMode("ZERO_EXPORT_TO_LOAD");
      break;
    case "SELL": {
      console.log("[Apply] SELL: mode=SELLING_FIRST, solarSell=on");
      // 1. Set selling mode
      await deye.setWorkMode("SELLING_FIRST");
      await delay(3000);
      // 2. Enable solar sell (battery-to-grid export)
      await deye.setSolarSell(true);
      await delay(3000);
      // 3. Disable grid charge
      await deye.setGridCharge(false);
      await delay(3000);
      // 4. Configure TOU slots (non-critical, wrap in try/catch)
      try {
        const slots = await buildTouSlots();
        if (slots.length > 0) {
          await deye.updateTou("on", slots);
        }
      } catch (err) {
        console.warn("[Apply] TOU update failed (non-critical):", err);
      }
      break;
    }
    case "NORMAL":
      console.log("[Apply] NORMAL: solarSell=off, gridCharge=off, mode=ZERO_EXPORT_TO_LOAD");
      await deye.setSolarSell(false);
      await delay(3000);
      await deye.setGridCharge(false);
      await delay(3000);
      await deye.setWorkMode("ZERO_EXPORT_TO_LOAD");
      break;
  }
}
