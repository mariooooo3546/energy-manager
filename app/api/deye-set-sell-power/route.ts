import { NextResponse } from "next/server";
import { DeyeCloudClient } from "@/src/clients/deye";

export async function POST() {
  try {
    const deye = new DeyeCloudClient({
      appId: process.env.DEYE_APP_ID!,
      appSecret: process.env.DEYE_APP_SECRET!,
      email: process.env.DEYE_EMAIL!,
      password: process.env.DEYE_PASSWORD!,
      deviceSn: process.env.DEYE_DEVICE_SN!,
    });

    await deye.setMaxSellPower(8000);
    return NextResponse.json({ ok: true, maxSellPower: 8000 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
