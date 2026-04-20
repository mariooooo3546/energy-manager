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
import { getLocalHour } from "@/src/lib/time";

export interface SchedulerDeps {
  pstryk: PstrykClient;
  deye: DeyeCloudClient;
  logger: DecisionLogger;
  onDecision?: (action: DecisionAction, reason: string, soc: number) => void;
}

export async function runCycle(deps: SchedulerDeps): Promise<void> {
  const { pstryk, deye, logger, onDecision } = deps;
  const currentHour = getLocalHour();

  // Check for manual override
  const override = await getOverride();
  if (override.active && override.action) {
    console.log(`[Scheduler] Override active: ${override.action}`);
    await applyAction(deye, override.action, currentHour);
    return;
  }

  // 1. Fetch inverter status
  const status = await deye.getStatus();

  // 2. Check hourly schedule (NADRZĘDNY - ma priorytet nad warunkami)
  const scheduledTarget = await getScheduleForHour(currentHour);
  if (scheduledTarget !== null) {
    // Harmonogram jest ustawiony na tę godzinę - warunki nie mają znaczenia
    const action = status.soc > scheduledTarget ? "SELL" : "NORMAL";
    const reason = status.soc > scheduledTarget
      ? `Harmonogram: SOC ${status.soc}% > cel ${scheduledTarget}% → sprzedaż`
      : `Harmonogram: SOC ${status.soc}% <= cel ${scheduledTarget}% → trzymaj`;
    console.log(`[Scheduler] ${reason}`);
    await applyAction(deye, action, currentHour);
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

  // 3. Brak harmonogramu na tę godzinę → ZERO_EXPORT_TO_LOAD (samokonsumpcja)
  // Warunki cenowe wyłączone — sterujemy wyłącznie harmonogramem.
  // const prices = await pstryk.getTodayPrices();
  // const conditions = await getConditions();
  // const engine = new DecisionEngine(conditions);
  // const decision = engine.decide(prices.frames, currentHour, status.soc);

  const action: DecisionAction = "NORMAL";
  const reason = "Brak harmonogramu → ZERO_EXPORT_TO_LOAD (samokonsumpcja)";
  console.log(`[Scheduler] ${reason}`);
  await applyAction(deye, action, currentHour);
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
}

/**
 * Build 6 TOU slots for Deye. Active hours (from schedule.json) become
 * sell-slots (power=maxSell, soc=target). When sellNow=true we inject the
 * current hour as a sell slot too — this covers engine-triggered SELLs
 * outside the schedule.json peak hours. Remaining slots are "hold" slots
 * (power=0, soc=100) that prevent battery→grid export.
 */
async function buildTouSlots(opts: { sellNow?: boolean; currentHour?: number } = {}): Promise<TouTimeSlot[]> {
  const schedule = await getSchedule();
  const maxPower = getMaxSellPower();

  const activeMap = new Map<number, number>(); // hour → target SOC
  for (const [h, target] of Object.entries(schedule)) {
    activeMap.set(parseInt(h), target);
  }
  if (opts.sellNow && opts.currentHour !== undefined && !activeMap.has(opts.currentHour)) {
    activeMap.set(opts.currentHour, 30); // default sell-down target
  }

  const slots: TouTimeSlot[] = [];
  for (const [h, soc] of [...activeMap.entries()].sort((a, b) => a[0] - b[0])) {
    slots.push({
      time: `${String(h).padStart(2, "0")}:00`,
      // Positive power required by dynamicControl (negative returns 400).
      // Actual export is unlocked via energyPattern=BATTERY_FIRST in applyAction.
      power: maxPower,
      soc,
      enableGeneration: true,
      enableGridCharge: false,
    });
  }

  // Fill remaining slots with "hold" slots at evenly-spaced hours.
  const passiveCandidates = [0, 4, 8, 12, 16, 20].filter((h) => !activeMap.has(h));
  let idx = 0;
  while (slots.length < 6 && idx < passiveCandidates.length) {
    slots.push({
      time: `${String(passiveCandidates[idx]).padStart(2, "0")}:00`,
      power: 0,
      soc: 100,
      enableGeneration: true,
      enableGridCharge: false,
    });
    idx++;
  }

  slots.sort((a, b) => a.time.localeCompare(b.time));
  return slots.slice(0, 6);
}

async function applyAction(
  deye: DeyeCloudClient,
  action: DecisionAction,
  currentHour: number
): Promise<void> {
  const maxPower = getMaxSellPower();

  switch (action) {
    case "SELL": {
      // Peak-hour sell: switch to SELLING_FIRST + TOU slot for current hour.
      // energyPattern + zeroExportPower are set via separate endpoints
      // (dynamicControl rejects them as "invalid param type").
      const slots = await buildTouSlots({ sellNow: true, currentHour });
      console.log(`[Apply] SELL: SELLING_FIRST + TOU (active hour ${currentHour})`);
      await deye.setDynamicControl({
        workMode: "SELLING_FIRST",
        solarSellAction: "on",
        gridChargeAction: "off",
        touAction: "on",
        maxSellPower: maxPower,
        maxSolarPower: 15000,
        timeUseSettingItems: slots,
      });
      await Promise.allSettled([
        deye.setEnergyPattern("BATTERY_FIRST"),
        deye.setZeroExportPower(maxPower),
      ]);
      break;
    }
    case "CHARGE": {
      // Manual override for negative-price windows: charge battery from grid.
      const slots = await buildTouSlots();
      console.log("[Apply] CHARGE: SELLING_FIRST + gridCharge=on");
      await deye.setDynamicControl({
        workMode: "SELLING_FIRST",
        solarSellAction: "on",
        gridChargeAction: "on",
        touAction: "on",
        maxSellPower: maxPower,
        maxSolarPower: 15000,
        timeUseSettingItems: slots.map((s) => ({
          ...s,
          enableGridCharge: true,
          enableGeneration: false,
          power: 0,
          soc: 100,
        })),
      });
      break;
    }
    case "NORMAL": {
      // Self-consumption: battery covers load, PV surplus exports, no grid buy.
      // Deye's TOU cannot be reliably turned off via API — both
      // /strategy/dynamicControl and /order/sys/tou/update silently keep
      // touAction:"on". Instead, emit 6 permissive slots across the day
      // (max discharge power, min SOC=Batt Low) so TOU stays enabled but
      // doesn't clamp the battery. workMode=ZERO_EXPORT_TO_LOAD still
      // prevents grid export.
      const permissiveSlots: TouTimeSlot[] = [0, 4, 8, 12, 16, 20].map((h) => ({
        time: `${String(h).padStart(2, "0")}:00`,
        power: maxPower,
        soc: 10,
        enableGeneration: true,
        enableGridCharge: false,
      }));
      console.log("[Apply] NORMAL: ZERO_EXPORT_TO_LOAD + permissive TOU slots");
      await deye.setDynamicControl({
        workMode: "ZERO_EXPORT_TO_LOAD",
        solarSellAction: "on",
        gridChargeAction: "off",
        touAction: "on",
        maxSellPower: maxPower,
        maxSolarPower: 15000,
        timeUseSettingItems: permissiveSlots,
      });
      await Promise.allSettled([
        // BATTERY_FIRST in Deye prioritizes battery discharge over grid
        // import for covering load — better for self-consumption than the
        // misleadingly-named LOAD_FIRST (which routes PV to load first).
        deye.setEnergyPattern("BATTERY_FIRST"),
        deye.setZeroExportPower(20),
      ]);
      break;
    }
  }
}
