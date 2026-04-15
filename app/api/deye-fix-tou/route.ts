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

    // Update TOU with enableGeneration: true on selling slots
    await deye.updateTou("on", [
      { time: "00:00", power: 0, soc: 100, enableGeneration: true, enableGridCharge: false },
      { time: "04:00", power: 0, soc: 100, enableGeneration: true, enableGridCharge: false },
      { time: "08:00", power: 0, soc: 100, enableGeneration: true, enableGridCharge: false },
      { time: "19:00", power: 8000, soc: 30, enableGeneration: true, enableGridCharge: false },
      { time: "20:00", power: 8000, soc: 30, enableGeneration: true, enableGridCharge: false },
      { time: "21:00", power: 8000, soc: 30, enableGeneration: true, enableGridCharge: false },
    ]);

    // Read back config after a moment
    const tou = await deye.getTouConfig();

    return NextResponse.json({ ok: true, tou });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
