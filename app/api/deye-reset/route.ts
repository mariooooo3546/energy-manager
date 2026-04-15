import { NextResponse } from "next/server";
import { DeyeCloudClient } from "@/src/clients/deye";

/**
 * Reset inverter to safe default state:
 * - ZERO_EXPORT_TO_LOAD (not CT!)
 * - solarSell off
 * - gridCharge off
 * - TOU off
 */
export async function POST() {
  try {
    const deye = new DeyeCloudClient({
      appId: process.env.DEYE_APP_ID!,
      appSecret: process.env.DEYE_APP_SECRET!,
      email: process.env.DEYE_EMAIL!,
      password: process.env.DEYE_PASSWORD!,
      deviceSn: process.env.DEYE_DEVICE_SN!,
    });

    // Reset to safe defaults
    await deye.setDynamicControl({
      workMode: "ZERO_EXPORT_TO_LOAD",
      solarSellAction: "off",
      gridChargeAction: "off",
      touAction: "off",
      maxSellPower: 0,
      maxSolarPower: 15000,
      timeUseSettingItems: [
        { time: "00:00", power: 0, soc: 100, enableGeneration: false, enableGridCharge: false },
        { time: "04:00", power: 0, soc: 100, enableGeneration: false, enableGridCharge: false },
        { time: "08:00", power: 0, soc: 100, enableGeneration: false, enableGridCharge: false },
        { time: "12:00", power: 0, soc: 100, enableGeneration: false, enableGridCharge: false },
        { time: "16:00", power: 0, soc: 100, enableGeneration: false, enableGridCharge: false },
        { time: "20:00", power: 0, soc: 100, enableGeneration: false, enableGridCharge: false },
      ],
    });

    return NextResponse.json({
      ok: true,
      message: "Reset to ZERO_EXPORT_TO_LOAD, solarSell=off, gridCharge=off, TOU=off",
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
