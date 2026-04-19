import { NextResponse } from "next/server";
import { createHash } from "crypto";

const BASE_URL = "https://eu1-developer.deyecloud.com/v1.0";

export async function GET() {
  try {
    const appId = process.env.DEYE_APP_ID!;
    const appSecret = process.env.DEYE_APP_SECRET!;
    const email = process.env.DEYE_EMAIL!;
    const password = process.env.DEYE_PASSWORD!;
    const deviceSn = process.env.DEYE_DEVICE_SN!;

    const hashedPassword = createHash("sha256").update(password).digest("hex");
    const authRes = await fetch(`${BASE_URL}/account/token?appId=${appId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appSecret, email, password: hashedPassword }),
    });
    const authJson = await authRes.json();
    const token = authJson.accessToken;

    const results: Record<string, unknown> = {};

    async function tryCall(name: string, path: string, body: object) {
      try {
        const res = await fetch(`${BASE_URL}${path}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `bearer ${token}`,
          },
          body: JSON.stringify({ deviceSn, ...body }),
        });
        const json = await res.json();
        results[name] = { status: res.status, ...json };
      } catch (err) {
        results[name] = { error: String(err) };
      }
    }

    // Energy pattern variants
    await tryCall("energyPattern_v1", "/order/sys/energyPattern/update", { energyPattern: "BATTERY_FIRST" });
    await tryCall("energyPattern_v2", "/order/sys/energy-pattern/update", { energyPattern: "BATTERY_FIRST" });
    await tryCall("energyPattern_v3", "/order/sys/mode/update", { energyPattern: "BATTERY_FIRST" });

    // Zero export power variants
    await tryCall("zeroExport_v1", "/order/sys/zeroExportPower/update", { zeroExportPower: 8000 });
    await tryCall("zeroExport_v2", "/order/sys/zero-export-power/update", { zeroExportPower: 8000 });
    await tryCall("zeroExport_v3", "/order/sys/zeroExport/update", { zeroExportPower: 8000 });

    // System config set (catch-all)
    await tryCall("system_config", "/order/sys/system/update", {
      energyPattern: "BATTERY_FIRST",
      zeroExportPower: 8000,
    });

    // Workmode update with extra params
    await tryCall("workMode_extended", "/order/sys/workMode/update", {
      workMode: "SELLING_FIRST",
      energyPattern: "BATTERY_FIRST",
      zeroExportPower: 8000,
    });

    // Read current state
    try {
      const res = await fetch(`${BASE_URL}/config/system`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `bearer ${token}`,
        },
        body: JSON.stringify({ deviceSn }),
      });
      results["currentSystemConfig"] = await res.json();
    } catch (err) {
      results["currentSystemConfig"] = { error: String(err) };
    }

    return NextResponse.json(results, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
