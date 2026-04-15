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

    const [status, prices, override] = await Promise.all([
      deye.getStatus(),
      pstryk.getTodayPrices(),
      getOverride(),
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
      override,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
