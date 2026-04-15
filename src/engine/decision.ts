import {
  PstrykPriceFrame,
  Decision,
  DecisionAction,
  TradeConditions,
} from "@/src/lib/types";

export class DecisionEngine {
  constructor(private conditions: TradeConditions) {}

  decide(
    frames: PstrykPriceFrame[],
    currentHourIndex: number,
    soc: number
  ): Decision {
    const currentBuy = frames[currentHourIndex].metrics.pricing.price_gross;
    const currentSell = frames[currentHourIndex].metrics.pricing.price_prosumer_gross;
    const c = this.conditions;

    let action: DecisionAction = "NORMAL";
    let reason = "Warunki niespelnione — self-consumption";

    // Never sell below floor
    if (
      currentSell >= c.sellMinPrice &&
      soc >= c.sellMinSoc &&
      soc > c.minSocFloor
    ) {
      action = "SELL";
      reason = `Sprzedaz: cena ${currentSell.toFixed(2)} zl >= ${c.sellMinPrice.toFixed(2)} zl, SOC ${soc}% >= ${c.sellMinSoc}%`;
    } else if (currentBuy <= c.buyMaxPrice && soc <= c.buyMaxSoc) {
      action = "CHARGE";
      reason = `Ladowanie: cena ${currentBuy.toFixed(2)} zl <= ${c.buyMaxPrice.toFixed(2)} zl, SOC ${soc}% <= ${c.buyMaxSoc}%`;
    }

    return {
      timestamp: new Date().toISOString(),
      action,
      reason,
      soc,
      buyPrice: currentBuy,
      sellPrice: currentSell,
      thresholds: { lowPrice: c.buyMaxPrice, highPrice: c.sellMinPrice },
    };
  }
}
