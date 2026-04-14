import {
  PstrykPriceFrame,
  Decision,
  DecisionAction,
  EngineConfig,
} from "@/src/lib/types";

export class DecisionEngine {
  constructor(private config: EngineConfig) {}

  decide(
    frames: PstrykPriceFrame[],
    currentHourIndex: number,
    soc: number
  ): Decision {
    const buyPrices = frames.map((f) => f.metrics.pricing.price_gross);
    const sellPrices = frames.map((f) => f.metrics.pricing.price_prosumer_gross);

    const lowThreshold = this.percentile(buyPrices, this.config.priceLowPercentile);
    const highThreshold = this.percentile(sellPrices, this.config.priceHighPercentile);

    const currentBuy = frames[currentHourIndex].metrics.pricing.price_gross;
    const currentSell = frames[currentHourIndex].metrics.pricing.price_prosumer_gross;

    let action: DecisionAction = "NORMAL";
    let reason = "Cena w normie — self-consumption";

    if (currentBuy <= lowThreshold && soc < this.config.maxSocCharge) {
      action = "CHARGE";
      reason = `Tania energia (${currentBuy.toFixed(2)} zł <= ${lowThreshold.toFixed(2)} zł), SOC ${soc}%`;
    } else if (currentSell >= highThreshold && soc > this.config.minSocSell) {
      action = "SELL";
      reason = `Droga energia (${currentSell.toFixed(2)} zł >= ${highThreshold.toFixed(2)} zł), SOC ${soc}%`;
    }

    return {
      timestamp: new Date().toISOString(),
      action,
      reason,
      soc,
      buyPrice: currentBuy,
      sellPrice: currentSell,
      thresholds: { lowPrice: lowThreshold, highPrice: highThreshold },
    };
  }

  private percentile(values: number[], p: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
  }
}
