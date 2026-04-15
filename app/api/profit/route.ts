import { NextResponse } from "next/server";
import { DeyeCloudClient } from "@/src/clients/deye";
import { PstrykClient } from "@/src/clients/pstryk";

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

    const [stats, hourly, prices] = await Promise.all([
      deye.getDailyStats(),
      deye.getHourlyStats(),
      pstryk.getTodayPrices(),
    ]);

    // Calculate revenue/cost per hour using actual hourly prices
    let sellRevenue = 0;
    let buyCost = 0;
    const hourlyBreakdown: {
      hour: number;
      sold: number;
      bought: number;
      sellPrice: number;
      buyPrice: number;
      revenue: number;
      cost: number;
    }[] = [];

    for (const h of hourly) {
      const frame = prices.frames[h.hour];
      if (!frame) continue;

      const sellPrice = frame.metrics.pricing.price_prosumer_gross;
      const buyPrice = frame.metrics.pricing.price_gross;
      const revenue = h.sold * sellPrice;
      const cost = h.bought * buyPrice;

      sellRevenue += revenue;
      buyCost += cost;

      hourlyBreakdown.push({
        hour: h.hour,
        sold: h.sold,
        bought: h.bought,
        sellPrice: Math.round(sellPrice * 100) / 100,
        buyPrice: Math.round(buyPrice * 100) / 100,
        revenue: Math.round(revenue * 100) / 100,
        cost: Math.round(cost * 100) / 100,
      });
    }

    const netProfit = sellRevenue - buyCost;

    return NextResponse.json({
      gridFeedIn: stats.gridFeedIn,
      purchased: stats.purchased,
      production: stats.production,
      consumption: stats.consumption,
      sellRevenue: Math.round(sellRevenue * 100) / 100,
      buyCost: Math.round(buyCost * 100) / 100,
      netProfit: Math.round(netProfit * 100) / 100,
      hourly: hourlyBreakdown,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
