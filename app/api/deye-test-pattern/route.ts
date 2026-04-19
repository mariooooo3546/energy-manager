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

    // Read BEFORE
    try {
      const res = await fetch(`${BASE_URL}/config/system`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `bearer ${token}`,
        },
        body: JSON.stringify({ deviceSn }),
      });
      results["BEFORE_config"] = await res.json();
    } catch (err) {
      results["BEFORE_config"] = { error: String(err) };
    }

    // 1. energyPattern via /order/sys/energyPattern/update — repeat
    await tryCall("set_energyPattern_BATTERY_FIRST", "/order/sys/energyPattern/update", {
      energyPattern: "BATTERY_FIRST",
    });

    // 2. Try with camelCase inside body but different param names
    await tryCall("set_sysEnergyPattern", "/order/sys/energyPattern/update", {
      sysEnergyPattern: "BATTERY_FIRST",
    });

    // 3. Try boolean batteryFirst flag
    await tryCall("set_batteryFirst_true", "/order/sys/energyPattern/update", {
      batteryFirst: true,
    });

    // 4. Try workMode endpoint with energyPattern
    await tryCall("workMode_with_ep", "/order/sys/workMode/update", {
      workMode: "SELLING_FIRST",
      energyPattern: "BATTERY_FIRST",
    });

    // 5. Try /order/config/system
    await tryCall("order_config_system", "/order/config/system/update", {
      energyPattern: "BATTERY_FIRST",
      zeroExportPower: 8000,
    });

    // 6. Try zeroExportPower via power endpoint
    await tryCall("power_zeroExport", "/order/sys/power/update", {
      zeroExportPower: 8000,
    });

    // 7. Try combining both in power endpoint
    await tryCall("power_both", "/order/sys/power/update", {
      maxSellPower: 8000,
      zeroExportPower: 8000,
    });

    // 8-14. GridSetpoint variants — GBBOptimizer uses this to FORCE export
    await tryCall("gridSetpoint_v1", "/order/sys/gridSetpoint/update", { gridSetpoint: -8000 });
    await tryCall("gridSetpoint_v2", "/order/sys/grid-setpoint/update", { gridSetpoint: -8000 });
    await tryCall("gridSetpoint_v3", "/order/sys/gridPower/update", { gridSetpoint: -8000 });
    await tryCall("gridSetpoint_v4", "/order/grid/setpoint/update", { gridSetpoint: -8000 });
    await tryCall("gridSetpoint_v5", "/order/sys/powerControl/update", { gridSetpoint: -8000 });
    await tryCall("gridSetpoint_v6", "/order/sys/exportPower/update", { exportPower: 8000 });
    await tryCall("gridSetpoint_v7", "/order/battery/dischargePower/update", { power: 8000 });

    // 15. Modbus-style register write
    await tryCall("modbus_register", "/order/modbus/write", { register: 104, value: -8000 });

    // Wait 5s for propagation
    await new Promise((r) => setTimeout(r, 5000));

    // Read AFTER
    try {
      const res = await fetch(`${BASE_URL}/config/system`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `bearer ${token}`,
        },
        body: JSON.stringify({ deviceSn }),
      });
      results["AFTER_config"] = await res.json();
    } catch (err) {
      results["AFTER_config"] = { error: String(err) };
    }

    return NextResponse.json(results, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
