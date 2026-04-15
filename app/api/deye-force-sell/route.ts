import { NextResponse } from "next/server";
import { createHash } from "crypto";

const BASE_URL = "https://eu1-developer.deyecloud.com/v1.0";

export async function POST() {
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
    if (!authJson.success) {
      return NextResponse.json({ error: "Auth failed", details: authJson }, { status: 500 });
    }
    const token = authJson.accessToken;

    // Full dynamicControl matching official sample format
    const body = {
      deviceSn,
      workMode: "SELLING_FIRST",
      solarSellAction: "on",
      gridChargeAction: "off",
      touAction: "on",
      touDays: ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"],
      maxSellPower: 8000,
      maxSolarPower: 15000,
      timeUseSettingItems: [
        { time: "00:00", power: 0, soc: 100, enableGeneration: true, enableGridCharge: false },
        { time: "04:00", power: 0, soc: 100, enableGeneration: true, enableGridCharge: false },
        { time: "08:00", power: 0, soc: 100, enableGeneration: true, enableGridCharge: false },
        { time: "19:00", power: 8000, soc: 30, enableGeneration: true, enableGridCharge: false },
        { time: "20:00", power: 8000, soc: 30, enableGeneration: true, enableGridCharge: false },
        { time: "21:00", power: 8000, soc: 30, enableGeneration: true, enableGridCharge: false },
      ],
    };

    console.log("[deye-force-sell] Request:", JSON.stringify(body, null, 2));

    const res = await fetch(`${BASE_URL}/strategy/dynamicControl`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const json = await res.json();
    console.log("[deye-force-sell] Response:", JSON.stringify(json));

    // Also read back TOU config
    const touRes = await fetch(`${BASE_URL}/config/tou`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `bearer ${token}`,
      },
      body: JSON.stringify({ deviceSn }),
    });
    const touJson = await touRes.json();

    return NextResponse.json({
      dynamicControlResponse: json,
      currentTouConfig: touJson,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
