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
    if (json.code !== 0) throw new Error(`Deye auth failed: ${json.msg}`);

    this.token = json.data.accessToken;
    this.tokenExpiresAt = Date.now() + (json.data.expiresIn - 86400) * 1000;
  }

  async getStatus(): Promise<DeyeDeviceStatus> {
    await this.authenticate();
    const res = await this.request("/device/latest", {
      deviceSns: [this.config.deviceSn],
    });

    const device = res.data[0];
    const get = (key: string) => {
      const item = device.dataList.find((d: { key: string }) => d.key === key);
      return item ? parseFloat(item.value) : 0;
    };

    return {
      soc: get("SOC"),
      batteryPower: get("BatteryPower"),
      gridPower: get("GridPower"),
      pvPower: get("PVPower"),
      loadPower: get("LoadPower"),
    };
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

  private async request(path: string, body: Record<string, unknown>) {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Deye API error: ${res.status}`);

    const json = await res.json();
    if (json.code !== 0) throw new Error(`Deye API failed: ${json.msg}`);
    return json;
  }
}
