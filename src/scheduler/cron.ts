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

async function applyAction(
  deye: DeyeCloudClient,
  action: DecisionAction
): Promise<void> {
  const maxPower = getMaxSellPower();

  switch (action) {
    case "CHARGE":
      await deye.setDynamicControl({
        workMode: "ZERO_EXPORT_TO_LOAD",
        solarSellAction: "off",
        gridChargeAction: "on",
        touAction: "off",
        maxSellPower: 0,
        timeUseSettingItems: await buildTouSlots(),
      });
      break;
    case "SELL": {
      const slots = await buildTouSlots();
      await deye.setDynamicControl({
        workMode: "SELLING_FIRST",
        solarSellAction: "on",
        gridChargeAction: "off",
        touAction: "on",
        maxSellPower: maxPower,
        maxSolarPower: 15000,
        timeUseSettingItems: slots,
      });
      break;
    }
    case "NORMAL":
      await deye.setDynamicControl({
        workMode: "ZERO_EXPORT_TO_LOAD",
        solarSellAction: "off",
        gridChargeAction: "off",
        touAction: "off",
        maxSellPower: 0,
        timeUseSettingItems: await buildTouSlots(),
      });
      break;
  }
}
