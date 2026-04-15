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

    // Auth
    const hashedPassword = createHash("sha256").update(password).digest("hex");
    const authRes = await fetch(`${BASE_URL}/account/token?appId=${appId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appSecret, email, password: hashedPassword }),
    });
    const authJson = await authRes.json();
    const token = authJson.accessToken;

    const results: Record<string, unknown> = {};

    // Test various battery mode types
    const modeTypes = [
      "GEN_TO_GRID",
      "BATTERY_TO_GRID",
      "DISCHARGE_TO_GRID",
      "BATTERY_DISCHARGE",
      "EXPORT",
    ];

    for (const modeType of modeTypes) {
      try {
        const res = await fetch(`${BASE_URL}/order/battery/modeControl`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `bearer ${token}`,
          },
          body: JSON.stringify({
            deviceSn,
            batteryModeType: modeType,
            action: "on",
          }),
        });
        const json = await res.json();
        results[modeType] = { status: res.status, ...json };
      } catch (err) {
        results[modeType] = { error: String(err) };
      }
    }

    // Also try dynamicControl with SELLING_FIRST + all params
    try {
      const dcBody = {
        deviceSn,
        workMode: "SELLING_FIRST",
        solarSellAction: "on",
        gridChargeAction: "off",
        touAction: "on",
        touDays: ["SUNDAY","MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY"],
        maxSellPower: 8000,
        maxSolarPower: 15000,
        timeUseSettingItems: [
          { time: "00:00", power: 8000, soc: 10, enableGeneration: true, enableGridCharge: false },
          { time: "04:00", power: 8000, soc: 10, enableGeneration: true, enableGridCharge: false },
          { time: "08:00", power: 8000, soc: 10, enableGeneration: true, enableGridCharge: false },
          { time: "12:00", power: 8000, soc: 10, enableGeneration: true, enableGridCharge: false },
          { time: "16:00", power: 8000, soc: 10, enableGeneration: true, enableGridCharge: false },
          { time: "20:00", power: 8000, soc: 10, enableGeneration: true, enableGridCharge: false },
        ],
      };
      const res = await fetch(`${BASE_URL}/strategy/dynamicControl`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `bearer ${token}`,
        },
        body: JSON.stringify(dcBody),
      });
      const json = await res.json();
      results["dynamicControl_FULL_SELL"] = { status: res.status, ...json };
    } catch (err) {
      results["dynamicControl_FULL_SELL"] = { error: String(err) };
    }

    // Read current TOU config
    try {
      const res = await fetch(`${BASE_URL}/config/tou`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `bearer ${token}`,
        },
        body: JSON.stringify({ deviceSn }),
      });
      results["currentTouConfig"] = await res.json();
    } catch (err) {
      results["currentTouConfig"] = { error: String(err) };
    }

    return NextResponse.json(results, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
