# Energy Manager — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an automated energy management app that buys cheap grid energy and sells expensive energy using Pstryk prices and Deye Cloud inverter control.

**Architecture:** Node.js/TypeScript Next.js app with three core modules (Pstryk client, Deye Cloud client, Decision Engine), a cron scheduler, Telegram bot, and web dashboard. All communication over HTTPS — no local Modbus needed.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, Recharts, node-telegram-bot-api, node-cron, Vitest

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `tailwind.config.ts`
- Create: `app/layout.tsx`
- Create: `app/page.tsx`
- Create: `.env.example`
- Create: `.env.local`
- Create: `.gitignore`
- Create: `vitest.config.ts`

**Step 1: Initialize Next.js project**

Run:
```bash
npx create-next-app@latest energy-manager --typescript --tailwind --app --src-dir=false --eslint --import-alias="@/*" --use-npm
cd energy-manager
```

**Step 2: Install dependencies**

Run:
```bash
npm install node-cron node-telegram-bot-api recharts
npm install -D vitest @types/node-cron @types/node-telegram-bot-api
```

**Step 3: Create .env.example**

Create `.env.example`:
```env
# Pstryk
PSTRYK_API_KEY=

# Deye Cloud
DEYE_APP_ID=
DEYE_APP_SECRET=
DEYE_EMAIL=
DEYE_PASSWORD=
DEYE_DEVICE_SN=

# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# Decision Engine
PRICE_LOW_PERCENTILE=25
PRICE_HIGH_PERCENTILE=75
MIN_SOC_SELL=20
MAX_SOC_CHARGE=90
CRON_SCHEDULE=55 * * * *
```

**Step 4: Create .gitignore additions**

Append to `.gitignore`:
```
.env.local
data/
```

**Step 5: Create vitest.config.ts**

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

**Step 6: Add test script to package.json**

Add to `scripts` in `package.json`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 7: Verify setup**

Run: `npm run build`
Expected: Build succeeds

**Step 8: Commit**

```bash
git init
git add -A
git commit -m "feat: scaffold Next.js project with dependencies"
```

---

### Task 2: Shared Types

**Files:**
- Create: `src/lib/types.ts`

**Step 1: Write types**

Create `src/lib/types.ts`:
```ts
// --- Pstryk ---

export interface PstrykPriceFrame {
  start: string; // ISO 8601
  end: string;
  metrics: {
    pricing: {
      price_gross: number;       // zł/kWh buy price
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
  soc: number;           // battery SOC %
  batteryPower: number;  // W, positive = charging
  gridPower: number;     // W, positive = importing
  pvPower: number;       // W
  loadPower: number;     // W
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

// --- Override (Telegram / Dashboard) ---

export interface Override {
  active: boolean;
  action: DecisionAction | null;
  targetSoc: number | null;
  setAt: string | null;
}
```

**Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add shared TypeScript types"
```

---

### Task 3: Pstryk Client

**Files:**
- Create: `src/clients/pstryk.ts`
- Create: `src/clients/__tests__/pstryk.test.ts`

**Step 1: Write the failing test**

Create `src/clients/__tests__/pstryk.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PstrykClient } from "../pstryk";

const mockPriceResponse = {
  frames: [
    {
      start: "2026-04-14T00:00:00Z",
      end: "2026-04-14T01:00:00Z",
      metrics: {
        pricing: {
          price_gross: 0.35,
          price_prosumer_gross: 0.2,
          is_cheap: true,
          is_expensive: false,
        },
      },
    },
    {
      start: "2026-04-14T01:00:00Z",
      end: "2026-04-14T02:00:00Z",
      metrics: {
        pricing: {
          price_gross: 0.85,
          price_prosumer_gross: 0.55,
          is_cheap: false,
          is_expensive: true,
        },
      },
    },
  ],
};

describe("PstrykClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches today prices with correct URL and auth header", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(mockPriceResponse), { status: 200 })
    );

    const client = new PstrykClient("test-api-key");
    const result = await client.getTodayPrices();

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toContain("api.pstryk.pl/integrations/meter-data/unified-metrics");
    expect(url).toContain("metrics=pricing");
    expect(url).toContain("resolution=hour");
    expect((options as RequestInit).headers).toHaveProperty("Authorization", "test-api-key");
    expect(result.frames).toHaveLength(2);
    expect(result.frames[0].metrics.pricing.price_gross).toBe(0.35);
  });

  it("throws on non-200 response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Unauthorized", { status: 401 })
    );

    const client = new PstrykClient("bad-key");
    await expect(client.getTodayPrices()).rejects.toThrow("Pstryk API error: 401");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/clients/__tests__/pstryk.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `src/clients/pstryk.ts`:
```ts
import { PstrykResponse } from "@/src/lib/types";

const BASE_URL = "https://api.pstryk.pl/integrations";

export class PstrykClient {
  constructor(private apiKey: string) {}

  async getTodayPrices(): Promise<PstrykResponse> {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    return this.fetchPrices(startOfDay, endOfDay);
  }

  async getTomorrowPrices(): Promise<PstrykResponse> {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const start = new Date(tomorrow);
    start.setHours(0, 0, 0, 0);

    const end = new Date(tomorrow);
    end.setHours(23, 59, 59, 999);

    return this.fetchPrices(start, end);
  }

  private async fetchPrices(start: Date, end: Date): Promise<PstrykResponse> {
    const params = new URLSearchParams({
      metrics: "pricing",
      resolution: "hour",
      window_start: start.toISOString(),
      window_end: end.toISOString(),
    });

    const res = await fetch(`${BASE_URL}/meter-data/unified-metrics/?${params}`, {
      headers: {
        Authorization: this.apiKey,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`Pstryk API error: ${res.status}`);
    }

    return res.json();
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/clients/__tests__/pstryk.test.ts`
Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add src/clients/pstryk.ts src/clients/__tests__/pstryk.test.ts
git commit -m "feat: add Pstryk API client with tests"
```

---

### Task 4: Deye Cloud Client

**Files:**
- Create: `src/clients/deye.ts`
- Create: `src/clients/__tests__/deye.test.ts`

**Step 1: Write the failing test**

Create `src/clients/__tests__/deye.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DeyeCloudClient } from "../deye";

const mockTokenResponse = {
  code: 0,
  data: { accessToken: "test-token", expiresIn: 5184000 },
};

const mockDeviceLatest = {
  code: 0,
  data: [
    {
      deviceSn: "SN123",
      dataList: [
        { key: "SOC", value: "78" },
        { key: "BatteryPower", value: "500" },
        { key: "GridPower", value: "-200" },
        { key: "PVPower", value: "3200" },
        { key: "LoadPower", value: "1100" },
      ],
    },
  ],
};

describe("DeyeCloudClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("authenticates and caches token", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(mockTokenResponse), { status: 200 })
    );

    const client = new DeyeCloudClient({
      appId: "app1",
      appSecret: "secret",
      email: "test@test.com",
      password: "pass",
      deviceSn: "SN123",
    });

    await client.authenticate();
    await client.authenticate(); // second call should use cache

    expect(fetchSpy).toHaveBeenCalledOnce(); // only one fetch
  });

  it("reads device status and parses SOC", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockTokenResponse), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockDeviceLatest), { status: 200 })
      );

    const client = new DeyeCloudClient({
      appId: "app1",
      appSecret: "secret",
      email: "test@test.com",
      password: "pass",
      deviceSn: "SN123",
    });

    const status = await client.getStatus();
    expect(status.soc).toBe(78);
    expect(status.pvPower).toBe(3200);
  });

  it("sends grid charge command", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockTokenResponse), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 0 }), { status: 200 })
      );

    const client = new DeyeCloudClient({
      appId: "app1",
      appSecret: "secret",
      email: "test@test.com",
      password: "pass",
      deviceSn: "SN123",
    });

    await client.setGridCharge(true);

    const [url, options] = fetchSpy.mock.calls[1];
    expect(url).toContain("/order/battery/modeControl");
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.action).toBe("on");
    expect(body.batteryModeType).toBe("GRID_CHARGE");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/clients/__tests__/deye.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `src/clients/deye.ts`:
```ts
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
    // Refresh 1 day before expiry
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
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/clients/__tests__/deye.test.ts`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add src/clients/deye.ts src/clients/__tests__/deye.test.ts
git commit -m "feat: add Deye Cloud API client with tests"
```

---

### Task 5: Decision Engine

**Files:**
- Create: `src/engine/decision.ts`
- Create: `src/engine/__tests__/decision.test.ts`

**Step 1: Write the failing test**

Create `src/engine/__tests__/decision.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { DecisionEngine } from "../decision";
import { PstrykPriceFrame, EngineConfig } from "@/src/lib/types";

const config: EngineConfig = {
  priceLowPercentile: 25,
  priceHighPercentile: 75,
  minSocSell: 20,
  maxSocCharge: 90,
};

function makeFrames(prices: number[]): PstrykPriceFrame[] {
  return prices.map((p, i) => ({
    start: `2026-04-14T${String(i).padStart(2, "0")}:00:00Z`,
    end: `2026-04-14T${String(i + 1).padStart(2, "0")}:00:00Z`,
    metrics: {
      pricing: {
        price_gross: p,
        price_prosumer_gross: p * 0.6,
        is_cheap: false,
        is_expensive: false,
      },
    },
  }));
}

// Prices: 0.10, 0.20, 0.30, ..., 1.00 (10 hours)
const frames = makeFrames([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]);

describe("DecisionEngine", () => {
  const engine = new DecisionEngine(config);

  it("decides CHARGE when price is low and SOC is low", () => {
    // hour 0, price 0.10 — well below 25th percentile (0.325)
    const decision = engine.decide(frames, 0, 50);
    expect(decision.action).toBe("CHARGE");
  });

  it("decides SELL when price is high and SOC is sufficient", () => {
    // hour 9, price 1.00 — well above 75th percentile (0.775)
    const decision = engine.decide(frames, 9, 80);
    expect(decision.action).toBe("SELL");
  });

  it("decides NORMAL when price is mid-range", () => {
    // hour 5, price 0.60 — between percentiles
    const decision = engine.decide(frames, 5, 50);
    expect(decision.action).toBe("NORMAL");
  });

  it("does not charge when SOC is already high", () => {
    // hour 0, price 0.10 but SOC is 95%
    const decision = engine.decide(frames, 0, 95);
    expect(decision.action).toBe("NORMAL");
  });

  it("does not sell when SOC is too low", () => {
    // hour 9, price 1.00 but SOC is 10%
    const decision = engine.decide(frames, 9, 10);
    expect(decision.action).toBe("NORMAL");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/__tests__/decision.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `src/engine/decision.ts`:
```ts
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
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/__tests__/decision.test.ts`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add src/engine/decision.ts src/engine/__tests__/decision.test.ts
git commit -m "feat: add decision engine with percentile-based logic"
```

---

### Task 6: Decision Logger

**Files:**
- Create: `src/lib/logger.ts`
- Create: `src/lib/__tests__/logger.test.ts`

**Step 1: Write the failing test**

Create `src/lib/__tests__/logger.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DecisionLogger } from "../logger";
import fs from "fs";
import path from "path";

const TEST_LOG_PATH = path.join(process.cwd(), "data", "test-decisions.json");

describe("DecisionLogger", () => {
  let logger: DecisionLogger;

  beforeEach(() => {
    logger = new DecisionLogger(TEST_LOG_PATH);
  });

  afterEach(() => {
    if (fs.existsSync(TEST_LOG_PATH)) fs.unlinkSync(TEST_LOG_PATH);
  });

  it("logs a decision and reads it back", () => {
    const decision = {
      timestamp: "2026-04-14T12:00:00Z",
      action: "CHARGE" as const,
      reason: "Tania energia",
      soc: 45,
      buyPrice: 0.15,
      sellPrice: 0.09,
      thresholds: { lowPrice: 0.2, highPrice: 0.7 },
    };

    logger.log(decision);
    const history = logger.getHistory(10);
    expect(history).toHaveLength(1);
    expect(history[0].action).toBe("CHARGE");
  });

  it("returns most recent entries first", () => {
    for (let i = 0; i < 5; i++) {
      logger.log({
        timestamp: `2026-04-14T${10 + i}:00:00Z`,
        action: "NORMAL",
        reason: `entry ${i}`,
        soc: 50,
        buyPrice: 0.5,
        sellPrice: 0.3,
        thresholds: { lowPrice: 0.2, highPrice: 0.7 },
      });
    }

    const history = logger.getHistory(3);
    expect(history).toHaveLength(3);
    expect(history[0].reason).toBe("entry 4");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/logger.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `src/lib/logger.ts`:
```ts
import fs from "fs";
import path from "path";
import { Decision } from "./types";

export class DecisionLogger {
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? path.join(process.cwd(), "data", "decisions.json");
  }

  log(decision: Decision): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const history = this.readAll();
    history.push(decision);
    fs.writeFileSync(this.filePath, JSON.stringify(history, null, 2));
  }

  getHistory(limit: number): Decision[] {
    return this.readAll().reverse().slice(0, limit);
  }

  private readAll(): Decision[] {
    if (!fs.existsSync(this.filePath)) return [];
    const raw = fs.readFileSync(this.filePath, "utf-8");
    return JSON.parse(raw);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/logger.test.ts`
Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add src/lib/logger.ts src/lib/__tests__/logger.test.ts
git commit -m "feat: add JSON-file decision logger"
```

---

### Task 7: Scheduler (Cron Orchestrator)

**Files:**
- Create: `src/scheduler/cron.ts`
- Create: `src/lib/config.ts`

**Step 1: Write config loader**

Create `src/lib/config.ts`:
```ts
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
```

**Step 2: Write scheduler**

Create `src/scheduler/cron.ts`:
```ts
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
```

**Step 3: Commit**

```bash
git add src/scheduler/cron.ts src/lib/config.ts
git commit -m "feat: add cron scheduler with decision cycle"
```

---

### Task 8: Telegram Bot

**Files:**
- Create: `src/telegram/bot.ts`

**Step 1: Write bot**

Create `src/telegram/bot.ts`:
```ts
import TelegramBot from "node-telegram-bot-api";
import { PstrykClient } from "@/src/clients/pstryk";
import { DeyeCloudClient } from "@/src/clients/deye";
import { DecisionLogger } from "@/src/lib/logger";
import { setOverride, clearOverride } from "@/src/lib/config";

interface BotDeps {
  pstryk: PstrykClient;
  deye: DeyeCloudClient;
  logger: DecisionLogger;
}

export function createBot(deps: BotDeps): TelegramBot {
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const chatId = process.env.TELEGRAM_CHAT_ID!;

  const bot = new TelegramBot(token, { polling: true });

  function guard(msg: TelegramBot.Message): boolean {
    return msg.chat.id.toString() === chatId;
  }

  bot.onText(/\/status/, async (msg) => {
    if (!guard(msg)) return;
    try {
      const status = await deps.deye.getStatus();
      const prices = await deps.pstryk.getTodayPrices();
      const hour = new Date().getHours();
      const frame = prices.frames[hour];

      await bot.sendMessage(
        msg.chat.id,
        `🔋 SOC: ${status.soc}%\n` +
          `⚡ PV: ${status.pvPower}W | Load: ${status.loadPower}W\n` +
          `💰 Kupno: ${frame?.metrics.pricing.price_gross.toFixed(2)} zł/kWh\n` +
          `💰 Sprzedaż: ${frame?.metrics.pricing.price_prosumer_gross.toFixed(2)} zł/kWh`
      );
    } catch (err) {
      await bot.sendMessage(msg.chat.id, `❌ Błąd: ${err}`);
    }
  });

  bot.onText(/\/ceny/, async (msg) => {
    if (!guard(msg)) return;
    try {
      const prices = await deps.pstryk.getTodayPrices();
      const lines = prices.frames.map((f) => {
        const h = new Date(f.start).getHours().toString().padStart(2, "0");
        const buy = f.metrics.pricing.price_gross.toFixed(2);
        const sell = f.metrics.pricing.price_prosumer_gross.toFixed(2);
        return `${h}:00  📥${buy}  📤${sell}`;
      });
      await bot.sendMessage(msg.chat.id, `Ceny dziś (zł/kWh):\n${lines.join("\n")}`);
    } catch (err) {
      await bot.sendMessage(msg.chat.id, `❌ Błąd: ${err}`);
    }
  });

  bot.onText(/\/laduj\s*(\d+)?/, async (msg, match) => {
    if (!guard(msg)) return;
    const targetSoc = match?.[1] ? parseInt(match[1]) : 90;
    setOverride({ active: true, action: "CHARGE", targetSoc, setAt: new Date().toISOString() });
    await bot.sendMessage(msg.chat.id, `⚡ Override: ŁADUJ do ${targetSoc}%. /auto żeby wyłączyć.`);
  });

  bot.onText(/\/sprzedaj/, async (msg) => {
    if (!guard(msg)) return;
    setOverride({ active: true, action: "SELL", targetSoc: null, setAt: new Date().toISOString() });
    await bot.sendMessage(msg.chat.id, `💰 Override: SPRZEDAŻ. /auto żeby wyłączyć.`);
  });

  bot.onText(/\/rozladuj\s*(\d+)?/, async (msg, match) => {
    if (!guard(msg)) return;
    const targetSoc = match?.[1] ? parseInt(match[1]) : 40;
    setOverride({ active: true, action: "SELL", targetSoc, setAt: new Date().toISOString() });
    await bot.sendMessage(msg.chat.id, `🔋 Override: ROZŁADUJ do ${targetSoc}%. /auto żeby wyłączyć.`);
  });

  bot.onText(/\/auto/, async (msg) => {
    if (!guard(msg)) return;
    clearOverride();
    await bot.sendMessage(msg.chat.id, `🤖 Tryb automatyczny przywrócony.`);
  });

  bot.onText(/\/log/, async (msg) => {
    if (!guard(msg)) return;
    const history = deps.logger.getHistory(5);
    if (history.length === 0) {
      await bot.sendMessage(msg.chat.id, "Brak historii.");
      return;
    }
    const lines = history.map((d) => {
      const time = new Date(d.timestamp).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
      return `${time} ${d.action} SOC:${d.soc}% ${d.buyPrice.toFixed(2)}zł`;
    });
    await bot.sendMessage(msg.chat.id, lines.join("\n"));
  });

  return bot;
}

export function sendNotification(bot: TelegramBot, message: string): void {
  const chatId = process.env.TELEGRAM_CHAT_ID!;
  bot.sendMessage(chatId, message).catch(console.error);
}
```

**Step 2: Commit**

```bash
git add src/telegram/bot.ts
git commit -m "feat: add Telegram bot with commands and override"
```

---

### Task 9: App Entry Point (Custom Server)

**Files:**
- Create: `server.ts`

**Step 1: Write custom server entry**

Since we need node-cron and Telegram polling running alongside Next.js, we use a custom server.

Create `server.ts`:
```ts
import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { PstrykClient } from "@/src/clients/pstryk";
import { DeyeCloudClient } from "@/src/clients/deye";
import { DecisionLogger } from "@/src/lib/logger";
import { createBot, sendNotification } from "@/src/telegram/bot";
import { startScheduler } from "@/src/scheduler/cron";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();
const port = parseInt(process.env.PORT || "3000");

app.prepare().then(() => {
  // Init clients
  const pstryk = new PstrykClient(process.env.PSTRYK_API_KEY!);
  const deye = new DeyeCloudClient({
    appId: process.env.DEYE_APP_ID!,
    appSecret: process.env.DEYE_APP_SECRET!,
    email: process.env.DEYE_EMAIL!,
    password: process.env.DEYE_PASSWORD!,
    deviceSn: process.env.DEYE_DEVICE_SN!,
  });
  const logger = new DecisionLogger();

  // Start Telegram bot
  const bot = createBot({ pstryk, deye, logger });

  // Start scheduler
  startScheduler({
    pstryk,
    deye,
    logger,
    onDecision: (action, reason, soc) => {
      const emoji = action === "CHARGE" ? "⚡" : action === "SELL" ? "💰" : "🔄";
      sendNotification(bot, `${emoji} ${action}: ${reason}`);
    },
  });

  // Start HTTP server
  createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  }).listen(port, () => {
    console.log(`Energy Manager running on http://localhost:${port}`);
    console.log("Telegram bot: polling");
    console.log(`Scheduler: ${process.env.CRON_SCHEDULE || "55 * * * *"}`);
  });
});
```

**Step 2: Add start script to package.json**

Add to `scripts`:
```json
"server": "tsx server.ts"
```

**Step 3: Install tsx**

Run: `npm install -D tsx`

**Step 4: Commit**

```bash
git add server.ts
git commit -m "feat: add custom server entry with cron + telegram + next.js"
```

---

### Task 10: API Routes

**Files:**
- Create: `app/api/status/route.ts`
- Create: `app/api/prices/route.ts`
- Create: `app/api/history/route.ts`
- Create: `app/api/override/route.ts`

**Step 1: Status route**

Create `app/api/status/route.ts`:
```ts
import { NextResponse } from "next/server";
import { DeyeCloudClient } from "@/src/clients/deye";
import { PstrykClient } from "@/src/clients/pstryk";
import { getOverride } from "@/src/lib/config";

export async function GET() {
  try {
    const deye = new DeyeCloudClient({
      appId: process.env.DEYE_APP_ID!,
      appSecret: process.env.DEYE_APP_SECRET!,
      email: process.env.DEYE_EMAIL!,
      password: process.env.DEYE_PASSWORD!,
      deviceSn: process.env.DEYE_DEVICE_SN!,
    });
    const pstryk = new PstrykClient(process.env.PSTRYK_API_KEY!);

    const [status, prices] = await Promise.all([
      deye.getStatus(),
      pstryk.getTodayPrices(),
    ]);

    const hour = new Date().getHours();
    const currentFrame = prices.frames[hour];

    return NextResponse.json({
      soc: status.soc,
      batteryPower: status.batteryPower,
      pvPower: status.pvPower,
      loadPower: status.loadPower,
      gridPower: status.gridPower,
      buyPrice: currentFrame?.metrics.pricing.price_gross,
      sellPrice: currentFrame?.metrics.pricing.price_prosumer_gross,
      override: getOverride(),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
```

**Step 2: Prices route**

Create `app/api/prices/route.ts`:
```ts
import { NextResponse } from "next/server";
import { PstrykClient } from "@/src/clients/pstryk";

export async function GET() {
  try {
    const pstryk = new PstrykClient(process.env.PSTRYK_API_KEY!);
    const [today, tomorrow] = await Promise.all([
      pstryk.getTodayPrices(),
      pstryk.getTomorrowPrices().catch(() => null),
    ]);

    return NextResponse.json({ today: today.frames, tomorrow: tomorrow?.frames ?? [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
```

**Step 3: History route**

Create `app/api/history/route.ts`:
```ts
import { NextResponse } from "next/server";
import { DecisionLogger } from "@/src/lib/logger";

export async function GET() {
  const logger = new DecisionLogger();
  return NextResponse.json(logger.getHistory(50));
}
```

**Step 4: Override route**

Create `app/api/override/route.ts`:
```ts
import { NextResponse } from "next/server";
import { setOverride, clearOverride, getOverride } from "@/src/lib/config";
import { DecisionAction } from "@/src/lib/types";

export async function GET() {
  return NextResponse.json(getOverride());
}

export async function POST(req: Request) {
  const body = await req.json();

  if (body.action === "auto") {
    clearOverride();
    return NextResponse.json({ status: "auto" });
  }

  setOverride({
    active: true,
    action: body.action as DecisionAction,
    targetSoc: body.targetSoc ?? null,
    setAt: new Date().toISOString(),
  });

  return NextResponse.json(getOverride());
}
```

**Step 5: Commit**

```bash
git add app/api/
git commit -m "feat: add API routes for status, prices, history, override"
```

---

### Task 11: Dashboard UI

**Files:**
- Modify: `app/page.tsx`
- Create: `app/components/StatusCard.tsx`
- Create: `app/components/PriceChart.tsx`
- Create: `app/components/DecisionLog.tsx`

**Step 1: Create StatusCard**

Create `app/components/StatusCard.tsx`:
```tsx
"use client";

interface Props {
  soc: number;
  pvPower: number;
  loadPower: number;
  gridPower: number;
  buyPrice: number;
  sellPrice: number;
  override: { active: boolean; action: string | null };
}

export function StatusCard(props: Props) {
  const modeLabel = props.override.active
    ? `OVERRIDE: ${props.override.action}`
    : "AUTO";

  const socColor =
    props.soc > 60 ? "bg-green-500" : props.soc > 30 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="rounded-lg border p-6 bg-white shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Status</h2>
        <span
          className={`px-3 py-1 rounded-full text-sm font-medium ${
            props.override.active
              ? "bg-orange-100 text-orange-800"
              : "bg-green-100 text-green-800"
          }`}
        >
          {modeLabel}
        </span>
      </div>

      <div className="mb-4">
        <div className="flex justify-between text-sm mb-1">
          <span>Bateria</span>
          <span className="font-mono">{props.soc}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-4">
          <div
            className={`${socColor} h-4 rounded-full transition-all`}
            style={{ width: `${props.soc}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-gray-500">PV</span>
          <p className="font-mono text-lg">{props.pvPower}W</p>
        </div>
        <div>
          <span className="text-gray-500">Zużycie</span>
          <p className="font-mono text-lg">{props.loadPower}W</p>
        </div>
        <div>
          <span className="text-gray-500">Cena kupna</span>
          <p className="font-mono text-lg">{props.buyPrice?.toFixed(2)} zł</p>
        </div>
        <div>
          <span className="text-gray-500">Cena sprzedaży</span>
          <p className="font-mono text-lg">{props.sellPrice?.toFixed(2)} zł</p>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Create PriceChart**

Create `app/components/PriceChart.tsx`:
```tsx
"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface PriceFrame {
  start: string;
  metrics: {
    pricing: {
      price_gross: number;
      price_prosumer_gross: number;
    };
  };
}

interface Props {
  frames: PriceFrame[];
}

export function PriceChart({ frames }: Props) {
  const currentHour = new Date().getHours();

  const data = frames.map((f) => {
    const hour = new Date(f.start).getHours();
    return {
      hour: `${hour.toString().padStart(2, "0")}:00`,
      kupno: f.metrics.pricing.price_gross,
      sprzedaz: f.metrics.pricing.price_prosumer_gross,
      isCurrent: hour === currentHour,
    };
  });

  return (
    <div className="rounded-lg border p-6 bg-white shadow-sm">
      <h2 className="text-lg font-semibold mb-4">Ceny energii dziś</h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <XAxis dataKey="hour" fontSize={12} />
          <YAxis fontSize={12} tickFormatter={(v) => `${v} zł`} />
          <Tooltip formatter={(v: number) => `${v.toFixed(2)} zł/kWh`} />
          <Legend />
          <Bar dataKey="kupno" fill="#3b82f6" name="Kupno" />
          <Bar dataKey="sprzedaz" fill="#22c55e" name="Sprzedaż" />
          <ReferenceLine x={`${currentHour.toString().padStart(2, "0")}:00`} stroke="#f59e0b" strokeWidth={2} label="Teraz" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

**Step 3: Create DecisionLog**

Create `app/components/DecisionLog.tsx`:
```tsx
"use client";

import { Decision } from "@/src/lib/types";

interface Props {
  decisions: Decision[];
}

const actionStyles: Record<string, string> = {
  CHARGE: "bg-blue-100 text-blue-800",
  SELL: "bg-green-100 text-green-800",
  NORMAL: "bg-gray-100 text-gray-800",
};

export function DecisionLog({ decisions }: Props) {
  return (
    <div className="rounded-lg border p-6 bg-white shadow-sm">
      <h2 className="text-lg font-semibold mb-4">Historia decyzji</h2>
      {decisions.length === 0 ? (
        <p className="text-gray-500 text-sm">Brak danych</p>
      ) : (
        <div className="space-y-2">
          {decisions.map((d, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <span className="font-mono text-gray-500 w-12">
                {new Date(d.timestamp).toLocaleTimeString("pl-PL", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${actionStyles[d.action]}`}>
                {d.action}
              </span>
              <span className="font-mono">SOC:{d.soc}%</span>
              <span className="text-gray-500 truncate">{d.reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 4: Write dashboard page**

Replace `app/page.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { StatusCard } from "./components/StatusCard";
import { PriceChart } from "./components/PriceChart";
import { DecisionLog } from "./components/DecisionLog";

export default function Dashboard() {
  const [status, setStatus] = useState<any>(null);
  const [prices, setPrices] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function fetchAll() {
    try {
      const [s, p, h] = await Promise.all([
        fetch("/api/status").then((r) => r.json()),
        fetch("/api/prices").then((r) => r.json()),
        fetch("/api/history").then((r) => r.json()),
      ]);
      setStatus(s);
      setPrices(p);
      setHistory(h);
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 60_000); // refresh every minute
    return () => clearInterval(interval);
  }, []);

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <h1 className="text-2xl font-bold mb-6">Energy Manager</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-800 rounded">{error}</div>
      )}

      <div className="grid gap-6 max-w-5xl">
        {status && <StatusCard {...status} />}
        {prices?.today && <PriceChart frames={prices.today} />}
        <DecisionLog decisions={history} />
      </div>
    </main>
  );
}
```

**Step 5: Commit**

```bash
git add app/page.tsx app/components/
git commit -m "feat: add dashboard with status, price chart, and decision log"
```

---

### Task 12: Integration Test & Final Verification

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 2: Build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Manual verification**

Run: `npm run server`
- Open http://localhost:3000 — dashboard should load (API calls will fail without real credentials, but page renders)
- Verify Telegram bot starts polling (check console output)
- Verify scheduler starts (check console output)

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: energy manager MVP complete"
```
