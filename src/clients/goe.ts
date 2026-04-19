/**
 * go-e Charger Cloud API v2 client.
 *
 * Docs: https://github.com/goecharger/go-eCharger-API-v2
 * Cloud endpoint base: https://api.go-e.com/api
 *
 * Key response fields (subset used here):
 * - car: car connected state (1=idle, 2=charging, 3=waiting, 4=done)
 * - amp: requested charge current (A)
 * - ama: max allowed amperage (hw/fuse limit)
 * - alw: allow charging (bool)
 * - psm: phase switch mode (1=single, 2=three)
 * - nrg: array [V1,V2,V3,Vn, A1,A2,A3, P1,P2,P3,Ptot, PF1..PFn] (W for P)
 * - wh: energy delivered this session (Wh)
 * - eto: lifetime energy (Wh)
 * - frc: force-state (0=neutral, 1=off, 2=on)
 */

export type CarState = "idle" | "charging" | "waiting" | "done" | "unknown";

export interface GoeStatus {
  carState: CarState;
  allowCharging: boolean;
  chargeCurrent: number;       // A currently requested
  maxAmperage: number;         // A hw limit
  phases: 1 | 3;
  power: number;               // W total (P1+P2+P3)
  sessionWh: number;
  lifetimeWh: number;
  forceState: "neutral" | "off" | "on";
  voltages: [number, number, number];
  currents: [number, number, number];
  raw: Record<string, unknown>;
}

export interface GoeConfig {
  baseUrl?: string;            // default https://api.go-e.com/api
  token: string;               // cloud API token
  deviceId?: string;           // required for cloud endpoints that take a device id
}

const DEFAULT_BASE = "https://api.go-e.com/api";

function parseCarState(car: unknown): CarState {
  switch (car) {
    case 1: return "idle";
    case 2: return "charging";
    case 3: return "waiting";
    case 4: return "done";
    default: return "unknown";
  }
}

function parseForceState(frc: unknown): GoeStatus["forceState"] {
  switch (frc) {
    case 1: return "off";
    case 2: return "on";
    default: return "neutral";
  }
}

export class GoeClient {
  private baseUrl: string;
  private token: string;
  private deviceId?: string;

  constructor(cfg: GoeConfig) {
    this.baseUrl = (cfg.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
    this.token = cfg.token;
    this.deviceId = cfg.deviceId;
  }

  private buildUrl(path: string, query: Record<string, string | number | boolean> = {}): string {
    const params = new URLSearchParams();
    params.set("token", this.token);
    if (this.deviceId) params.set("id", this.deviceId);
    for (const [k, v] of Object.entries(query)) {
      params.set(k, String(v));
    }
    return `${this.baseUrl}${path}?${params.toString()}`;
  }

  private async request<T>(path: string, query: Record<string, string | number | boolean> = {}): Promise<T> {
    const url = this.buildUrl(path, query);
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`go-e API ${res.status}: ${await res.text().catch(() => "")}`);
    }
    return res.json() as Promise<T>;
  }

  async getStatus(): Promise<GoeStatus> {
    // V2 status returns all keys; use filter=car,alw,amp,ama,psm,nrg,wh,eto,frc
    // for smaller payload.
    const filter = "car,alw,amp,ama,psm,nrg,wh,eto,frc";
    const raw = await this.request<Record<string, unknown>>("/status", { filter });

    const nrg = Array.isArray(raw.nrg) ? (raw.nrg as number[]) : [];
    const voltages: [number, number, number] = [nrg[0] ?? 0, nrg[1] ?? 0, nrg[2] ?? 0];
    const currents: [number, number, number] = [nrg[4] ?? 0, nrg[5] ?? 0, nrg[6] ?? 0];
    const power = (nrg[7] ?? 0) + (nrg[8] ?? 0) + (nrg[9] ?? 0);

    return {
      carState: parseCarState(raw.car),
      allowCharging: raw.alw === true || raw.alw === 1,
      chargeCurrent: Number(raw.amp ?? 0),
      maxAmperage: Number(raw.ama ?? 16),
      phases: raw.psm === 2 ? 3 : 1,
      power,
      sessionWh: Number(raw.wh ?? 0),
      lifetimeWh: Number(raw.eto ?? 0),
      forceState: parseForceState(raw.frc),
      voltages,
      currents,
      raw,
    };
  }

  /**
   * Set the requested charging current (amperes).
   * Will be clamped to max allowed amperage by the charger.
   */
  async setCurrent(amps: number): Promise<void> {
    await this.request("/set", { amp: Math.max(0, Math.floor(amps)) });
  }

  /**
   * Allow or block charging entirely (independent of amp setting).
   * frc: 0 = neutral (follow alw), 1 = force off, 2 = force on
   */
  async setForceState(state: "neutral" | "off" | "on"): Promise<void> {
    const frc = state === "off" ? 1 : state === "on" ? 2 : 0;
    await this.request("/set", { frc });
  }

  /**
   * Switch between 1-phase and 3-phase charging.
   * psm: 1 = single-phase, 2 = three-phase.
   */
  async setPhases(phases: 1 | 3): Promise<void> {
    await this.request("/set", { psm: phases === 3 ? 2 : 1 });
  }
}
