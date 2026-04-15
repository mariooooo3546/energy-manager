// --- Pstryk ---

export interface PstrykPriceFrame {
  start: string; // ISO 8601
  end: string;
  metrics: {
    pricing: {
      price_gross: number; // zł/kWh buy price
      price_prosumer_gross: number; // zł/kWh sell price
      is_cheap: boolean;
      is_expensive: boolean;
    };
  };
}

export interface PstrykResponse {
  frames: PstrykPriceFrame[];
}

// --- Deye Cloud ---

export interface DeyeTokenResponse {
  accessToken: string;
  expiresIn: number;
}

export interface DeyeDeviceStatus {
  soc: number; // battery SOC %
  batteryPower: number; // W, positive = charging
  gridPower: number; // W, positive = importing
  pvPower: number; // W
  loadPower: number; // W
}

// --- Decision Engine ---

export type DecisionAction = "CHARGE" | "SELL" | "NORMAL";

export interface Decision {
  timestamp: string;
  action: DecisionAction;
  reason: string;
  soc: number;
  buyPrice: number;
  sellPrice: number;
  thresholds: {
    lowPrice: number;
    highPrice: number;
  };
}

export interface EngineConfig {
  priceLowPercentile: number;
  priceHighPercentile: number;
  minSocSell: number;
  maxSocCharge: number;
}

export interface TradeConditions {
  sellMinPrice: number;    // sprzedaj gdy cena >= X zl/kWh
  sellMinSoc: number;      // sprzedaj gdy SOC >= X%
  buyMaxPrice: number;     // kupuj gdy cena <= X zl/kWh
  buyMaxSoc: number;       // kupuj gdy SOC <= X%
  minSocFloor: number;     // nigdy nie schodz ponizej X%
}

// --- Override (Telegram / Dashboard) ---

export interface Override {
  active: boolean;
  action: DecisionAction | null;
  targetSoc: number | null;
  setAt: string | null;
}
