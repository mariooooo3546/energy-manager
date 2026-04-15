import { createHash } from "crypto";
import { DeyeDeviceStatus } from "@/src/lib/types";

const BASE_URL = "https://eu1-developer.deyecloud.com/v1.0";

interface DeyeConfig {
  appId: string;
  appSecret: string;
  email: string;
  password: string;
  deviceSn: string;
}

export interface TouTimeSlot {
  time: string; // HH:MM
  power: number; // discharge power in watts
  soc: number; // min SOC %
  enableGeneration: boolean;
  enableGridCharge: boolean;
}

export interface DynamicControlParams {
  workMode: "SELLING_FIRST" | "ZERO_EXPORT_TO_LOAD" | "ZERO_EXPORT_TO_CT";
  solarSellAction: "on" | "off";
  gridChargeAction: "on" | "off";
  touAction: "on" | "off";
  touDays?: string[];
  maxSellPower: number;
  maxSolarPower?: number;
  timeUseSettingItems: TouTimeSlot[];
}

const ALL_DAYS = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

export class DeyeCloudClient {
  private config: DeyeConfig;
  private token: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(config: DeyeConfig) {
    this.config = config;
  }

  async authenticate(): Promise<void> {
    if (this.token && Date.now() < this.tokenExpiresAt) return;

    const hashedPassword = createHash("sha256")
      .update(this.config.password)
      .digest("hex");

    const res = await fetch(
      `${BASE_URL}/account/token?appId=${this.config.appId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appSecret: this.config.appSecret,
          email: this.config.email,
          password: hashedPassword,
        }),
      }
    );

    if (!res.ok) throw new Error(`Deye auth error: ${res.status}`);

    const json = await res.json();
    if (!json.success) throw new Error(`Deye auth failed: ${json.msg}`);

    this.token = json.accessToken;
    this.tokenExpiresAt = Date.now() + (parseInt(json.expiresIn) - 86400) * 1000;
  }

  async getStatus(): Promise<DeyeDeviceStatus> {
    await this.authenticate();
    const res = await this.request("/device/latest", {
      deviceList: [this.config.deviceSn],
    });

    const device = res.deviceDataList[0];
    const get = (key: string) => {
      const item = device.dataList.find((d: { key: string }) => d.key === key);
      return item ? parseFloat(item.value) : 0;
    };

    return {
      soc: get("SOC"),
      batteryPower: get("BatteryPower"),
      gridPower: get("TotalGridPower"),
      pvPower: get("TotalSolarPower"),
      loadPower: get("TotalConsumptionPower"),
    };
  }

  async getDailyStats(): Promise<{
    production: number;
    gridFeedIn: number;
    consumption: number;
    purchased: number;
    charged: number;
    discharged: number;
  }> {
    await this.authenticate();
    const today = new Date().toISOString().split("T")[0];
    const res = await this.request("/device/history", {
      deviceSn: this.config.deviceSn,
      granularity: 2,
      startAt: today,
      endAt: today,
    });

    const items = res.dataList?.[0]?.itemList ?? [];
    const get = (key: string) => {
      const item = items.find((d: { key: string }) => d.key === key);
      return item ? parseFloat(item.value) : 0;
    };

    return {
      production: get("Production"),
      gridFeedIn: get("GridFeed-in"),
      consumption: get("Consumption"),
      purchased: get("ElectricityPurchasing"),
      charged: get("ChargingCapacity"),
      discharged: get("DischargingCapacity"),
    };
  }

  async getHourlyStats(): Promise<
    { hour: number; sold: number; bought: number }[]
  > {
    await this.authenticate();
    const today = new Date().toISOString().split("T")[0];
    const res = await this.request("/device/history", {
      deviceSn: this.config.deviceSn,
      granularity: 1,
      startAt: today,
      endAt: today,
      measurePoints: ["TotalEnergySell", "TotalEnergyBuy"],
    });

    const dataList: { time: string; itemList: { key: string; value: string }[] }[] =
      res.dataList ?? [];

    // Group data points by hour
    const byHour = new Map<number, { sells: number[]; buys: number[] }>();
    for (const point of dataList) {
      const ts = new Date(parseInt(point.time) * 1000);
      const hour = ts.getHours();
      if (!byHour.has(hour)) byHour.set(hour, { sells: [], buys: [] });
      const bucket = byHour.get(hour)!;
      for (const item of point.itemList) {
        if (item.key === "TotalEnergySell") bucket.sells.push(parseFloat(item.value));
        if (item.key === "TotalEnergyBuy") bucket.buys.push(parseFloat(item.value));
      }
    }

    // Calculate delta per hour (last - first reading in each hour)
    const hours: { hour: number; sold: number; bought: number }[] = [];
    const sortedHours = [...byHour.keys()].sort((a, b) => a - b);
    for (const hour of sortedHours) {
      const bucket = byHour.get(hour)!;
      const sold =
        bucket.sells.length >= 2
          ? bucket.sells[bucket.sells.length - 1] - bucket.sells[0]
          : 0;
      const bought =
        bucket.buys.length >= 2
          ? bucket.buys[bucket.buys.length - 1] - bucket.buys[0]
          : 0;
      hours.push({ hour, sold: Math.max(0, Math.round(sold * 100) / 100), bought: Math.max(0, Math.round(bought * 100) / 100) });
    }

    return hours;
  }

  async setGridCharge(on: boolean): Promise<void> {
    await this.authenticate();
    await this.request("/order/battery/modeControl", {
      deviceSn: this.config.deviceSn,
      batteryModeType: "GRID_CHARGE",
      action: on ? "on" : "off",
    });
  }

  async setSolarSell(on: boolean): Promise<void> {
    await this.authenticate();
    await this.request("/order/sys/solarSell/control", {
      deviceSn: this.config.deviceSn,
      action: on ? "on" : "off",
    });
  }

  async setWorkMode(
    mode: "SELLING_FIRST" | "ZERO_EXPORT_TO_LOAD" | "ZERO_EXPORT_TO_CT"
  ): Promise<void> {
    await this.authenticate();
    await this.request("/order/sys/workMode/update", {
      deviceSn: this.config.deviceSn,
      workMode: mode,
    });
  }

  async setDynamicControl(params: DynamicControlParams): Promise<void> {
    await this.authenticate();
    const body: Record<string, unknown> = {
      deviceSn: this.config.deviceSn,
      workMode: params.workMode,
      solarSellAction: params.solarSellAction,
      gridChargeAction: params.gridChargeAction,
      touAction: params.touAction,
      touDays: params.touDays ?? ALL_DAYS,
      maxSellPower: params.maxSellPower,
      timeUseSettingItems: params.timeUseSettingItems,
    };
    if (params.maxSolarPower !== undefined) {
      body.maxSolarPower = params.maxSolarPower;
    }
    console.log("[Deye] dynamicControl request:", JSON.stringify(body, null, 2));
    await this.request("/strategy/dynamicControl", body);
  }

  async updateTou(
    touAction: "on" | "off",
    items: TouTimeSlot[]
  ): Promise<void> {
    await this.authenticate();
    // Keep HH:MM format as required by API, include voltage field
    const formatted = items.map((s) => ({
      time: s.time,
      power: s.power,
      voltage: 0,
      soc: s.soc,
      enableGeneration: s.enableGeneration,
      enableGridCharge: s.enableGridCharge,
    }));
    const body = {
      deviceSn: this.config.deviceSn,
      timeUseSettingItems: formatted,
      timeoutSeconds: 30,
    };
    console.log("[Deye] updateTou request:", JSON.stringify(body, null, 2));
    await this.request("/order/sys/tou/update", body);
  }

  async setMaxSellPower(watts: number): Promise<void> {
    await this.authenticate();
    await this.request("/order/sys/power/update", {
      deviceSn: this.config.deviceSn,
      maxSellPower: watts,
    });
  }

  async getTouConfig(): Promise<unknown> {
    await this.authenticate();
    return this.request("/config/tou", {
      deviceSn: this.config.deviceSn,
    });
  }

  async readConfig(type: string): Promise<unknown> {
    await this.authenticate();
    return this.request(`/config/${type}`, {
      deviceSn: this.config.deviceSn,
    });
  }

  async getDeviceInfo(): Promise<unknown> {
    await this.authenticate();
    return this.request("/device/info", {
      deviceSn: this.config.deviceSn,
    });
  }

  private async request(path: string, body: Record<string, unknown>) {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `bearer ${this.token}`,
      },
      body: JSON.stringify(body),
    });

    const json = await res.json();
    if (!res.ok) {
      console.error(`[Deye] ${path} HTTP ${res.status}:`, JSON.stringify(json));
      throw new Error(`Deye API error: ${res.status} - ${JSON.stringify(json)}`);
    }
    if (!json.success) {
      console.error(`[Deye] ${path} failed:`, JSON.stringify(json));
      throw new Error(`Deye API failed: ${json.msg}`);
    }
    return json;
  }
}
