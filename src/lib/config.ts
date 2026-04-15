import { getStore } from "./storage";
import { EngineConfig, Override, TradeConditions } from "./types";

// --- Schedule ---
export type HourlySchedule = Record<string, number>;

export async function getSchedule(): Promise<HourlySchedule> {
  return (await getStore().get<HourlySchedule>("schedule")) ?? {};
}

export async function setSchedule(schedule: HourlySchedule): Promise<void> {
  await getStore().set("schedule", schedule);
}

export async function getScheduleForHour(hour: number): Promise<number | null> {
  const schedule = await getSchedule();
  const target = schedule[String(hour)];
  return target !== undefined ? target : null;
}

// --- Trade Conditions ---
const DEFAULT_CONDITIONS: TradeConditions = {
  sellMinPrice: 0.80,
  sellMinSoc: 40,
  buyMaxPrice: 0.50,
  buyMaxSoc: 80,
  minSocFloor: 20,
};

export async function getConditions(): Promise<TradeConditions> {
  const stored = await getStore().get<TradeConditions>("conditions");
  return stored ? { ...DEFAULT_CONDITIONS, ...stored } : DEFAULT_CONDITIONS;
}

export async function setConditions(conditions: TradeConditions): Promise<void> {
  await getStore().set("conditions", conditions);
}

// --- Override ---
const DEFAULT_OVERRIDE: Override = {
  active: false,
  action: null,
  targetSoc: null,
  setAt: null,
};

export async function getOverride(): Promise<Override> {
  return (await getStore().get<Override>("override")) ?? DEFAULT_OVERRIDE;
}

export async function setOverride(override: Override): Promise<void> {
  await getStore().set("override", override);
}

export async function clearOverride(): Promise<void> {
  await getStore().set("override", DEFAULT_OVERRIDE);
}

// --- Engine Config (env-only, no storage needed) ---
export function getEngineConfig(): EngineConfig {
  return {
    priceLowPercentile: parseInt(process.env.PRICE_LOW_PERCENTILE || "25"),
    priceHighPercentile: parseInt(process.env.PRICE_HIGH_PERCENTILE || "75"),
    minSocSell: parseInt(process.env.MIN_SOC_SELL || "20"),
    maxSocCharge: parseInt(process.env.MAX_SOC_CHARGE || "90"),
  };
}

// --- Max Sell Power ---
export function getMaxSellPower(): number {
  return parseInt(process.env.MAX_SELL_POWER || "8000");
}
