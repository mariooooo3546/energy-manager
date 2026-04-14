import cron from "node-cron";
import { PstrykClient } from "@/src/clients/pstryk";
import { DeyeCloudClient } from "@/src/clients/deye";
import { DecisionEngine } from "@/src/engine/decision";
import { DecisionLogger } from "@/src/lib/logger";
import { getEngineConfig, getOverride } from "@/src/lib/config";
import { DecisionAction } from "@/src/lib/types";

interface SchedulerDeps {
  pstryk: PstrykClient;
  deye: DeyeCloudClient;
  logger: DecisionLogger;
  onDecision?: (action: DecisionAction, reason: string, soc: number) => void;
}

export function startScheduler(deps: SchedulerDeps): cron.ScheduledTask {
  const schedule = process.env.CRON_SCHEDULE || "55 * * * *";

  return cron.schedule(schedule, async () => {
    try {
      await runCycle(deps);
    } catch (err) {
      console.error("[Scheduler] Error:", err);
    }
  });
}

export async function runCycle(deps: SchedulerDeps): Promise<void> {
  const { pstryk, deye, logger, onDecision } = deps;

  // Check for manual override
  const override = getOverride();
  if (override.active && override.action) {
    console.log(`[Scheduler] Override active: ${override.action}`);
    await applyAction(deye, override.action);
    return;
  }

  // 1. Fetch prices
  const prices = await pstryk.getTodayPrices();

  // 2. Fetch inverter status
  const status = await deye.getStatus();

  // 3. Decide
  const currentHour = new Date().getHours();
  const engine = new DecisionEngine(getEngineConfig());
  const decision = engine.decide(prices.frames, currentHour, status.soc);

  // 4. Apply
  await applyAction(deye, decision.action);

  // 5. Log
  logger.log(decision);
  console.log(`[Scheduler] ${decision.action}: ${decision.reason}`);

  // 6. Notify
  onDecision?.(decision.action, decision.reason, status.soc);
}

async function applyAction(
  deye: DeyeCloudClient,
  action: DecisionAction
): Promise<void> {
  switch (action) {
    case "CHARGE":
      await deye.setGridCharge(true);
      await deye.setSolarSell(false);
      break;
    case "SELL":
      await deye.setGridCharge(false);
      await deye.setSolarSell(true);
      await deye.setWorkMode("SELLING_FIRST");
      break;
    case "NORMAL":
      await deye.setGridCharge(false);
      await deye.setSolarSell(false);
      await deye.setWorkMode("ZERO_EXPORT_TO_LOAD");
      break;
  }
}
