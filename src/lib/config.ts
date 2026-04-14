import { EngineConfig, Override } from "./types";

let currentOverride: Override = {
  active: false,
  action: null,
  targetSoc: null,
  setAt: null,
};

export function getEngineConfig(): EngineConfig {
  return {
    priceLowPercentile: parseInt(process.env.PRICE_LOW_PERCENTILE || "25"),
    priceHighPercentile: parseInt(process.env.PRICE_HIGH_PERCENTILE || "75"),
    minSocSell: parseInt(process.env.MIN_SOC_SELL || "20"),
    maxSocCharge: parseInt(process.env.MAX_SOC_CHARGE || "90"),
  };
}

export function getOverride(): Override {
  return currentOverride;
}

export function setOverride(override: Override): void {
  currentOverride = override;
}

export function clearOverride(): void {
  currentOverride = { active: false, action: null, targetSoc: null, setAt: null };
}
