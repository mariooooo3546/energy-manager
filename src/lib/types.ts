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

// --- EV (go-e Charger via OCPP) ---

export type EvMode = "AUTO" | "ECO" | "CHEAP" | "FAST" | "STOP";

export interface EvOverride {
  mode: EvMode;
  setAt: string;
}

export type EvActionType = "START" | "STOP" | "SET_CURRENT" | "HOLD";

export interface EvAction {
  action: EvActionType;
  amps: number;            // requested amperage (0–16)
  phases: 1 | 3;
  reason: string;
}

export interface EvDecisionInput {
  override: EvOverride;
  gridPower: number;           // W, +import, -export (from inverter status)
  soc: number;                 // battery SOC %
  buyPrice: number;            // current zł/kWh
  inSellSchedule: boolean;     // true = current hour has a sell-target
  isCharging: boolean;         // true = OCPP says Charging now
}

export interface EvConfig {
  maxAmps: number;             // hard limit (fuse / charger HW), default 16
  surplusThresholdW: number;   // how much export before we start charging (default 1400 ≈ 6A×230V)
  cheapPriceThreshold: number; // zł/kWh — below this, charge from grid in CHEAP/AUTO mode
  minBatterySoc: number;       // % — below this, don't drain battery into EV
  phaseSwitchThresholdW: number; // W — over this, switch to 3-phase (default 4200 = 3×6A×230V)
}
