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

    // Get ALL device data points
    const dataRes = await fetch(`${BASE_URL}/device/latest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `bearer ${token}`,
      },
      body: JSON.stringify({ deviceList: [deviceSn] }),
    });
    const dataJson = await dataRes.json();
    const device = dataJson.deviceDataList?.[0];
    const allPoints: Record<string, string> = {};
    if (device?.dataList) {
      for (const item of device.dataList) {
        allPoints[item.key] = item.value;
      }
    }

    // Sort keys for readability
    const sorted = Object.fromEntries(
      Object.entries(allPoints).sort(([a], [b]) => a.localeCompare(b))
    );

    return NextResponse.json({
      deviceSn,
      dataPointCount: Object.keys(sorted).length,
      data: sorted,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
