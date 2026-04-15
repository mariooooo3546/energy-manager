import { NextResponse } from "next/server";
import { DeyeCloudClient } from "@/src/clients/deye";

export async function GET() {
  try {
    const deye = new DeyeCloudClient({
      appId: process.env.DEYE_APP_ID!,
      appSecret: process.env.DEYE_APP_SECRET!,
      email: process.env.DEYE_EMAIL!,
      password: process.env.DEYE_PASSWORD!,
      deviceSn: process.env.DEYE_DEVICE_SN!,
    });

    const [tou, status, battery, deviceInfo] = await Promise.all([
      deye.getTouConfig().catch((e) => ({ error: String(e) })),
      deye.getStatus().catch((e) => ({ error: String(e) })),
      deye.readConfig("battery").catch((e) => ({ error: String(e) })),
      deye.getDeviceInfo().catch((e) => ({ error: String(e) })),
    ]);

    return NextResponse.json({ status, tou, battery, deviceInfo }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
