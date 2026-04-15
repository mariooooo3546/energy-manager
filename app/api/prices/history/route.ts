import { NextRequest, NextResponse } from "next/server";
import { PstrykClient } from "@/src/clients/pstryk";

const DAY_NAMES = [
  "Niedziela",
  "Poniedzialek",
  "Wtorek",
  "Sroda",
  "Czwartek",
  "Piatek",
  "Sobota",
];

export async function GET(req: NextRequest) {
  try {
    const days = parseInt(req.nextUrl.searchParams.get("days") || "21");
    const pstryk = new PstrykClient(process.env.PSTRYK_API_KEY!);

    const data = await pstryk.getHistoricalPrices(days);

    // Group by day of week (0=Sun..6=Sat) and hour (0-23)
    // Structure: byDay[dayOfWeek][hour] = { buySum, sellSum, count }
    const byDay: Record<
      number,
      Record<number, { buySum: number; sellSum: number; count: number }>
    > = {};

    for (let d = 0; d < 7; d++) {
      byDay[d] = {};
      for (let h = 0; h < 24; h++) {
        byDay[d][h] = { buySum: 0, sellSum: 0, count: 0 };
      }
    }

    for (const frame of data.frames) {
      const date = new Date(frame.start);
      const dayOfWeek = date.getDay(); // 0=Sun
      const hour = date.getHours();
      const bucket = byDay[dayOfWeek][hour];
      bucket.buySum += frame.metrics.pricing.price_gross;
      bucket.sellSum += frame.metrics.pricing.price_prosumer_gross;
      bucket.count += 1;
    }

    // Build response: per day of week, 24 hourly averages
    const result: {
      day: string;
      dayIndex: number;
      isWeekend: boolean;
      hours: {
        hour: number;
        avgBuy: number;
        avgSell: number;
      }[];
    }[] = [];

    // Order: Mon(1), Tue(2), Wed(3), Thu(4), Fri(5), Sat(6), Sun(0)
    const dayOrder = [1, 2, 3, 4, 5, 6, 0];
    for (const d of dayOrder) {
      const hours = [];
      for (let h = 0; h < 24; h++) {
        const b = byDay[d][h];
        hours.push({
          hour: h,
          avgBuy: b.count > 0 ? Math.round((b.buySum / b.count) * 100) / 100 : 0,
          avgSell: b.count > 0 ? Math.round((b.sellSum / b.count) * 100) / 100 : 0,
        });
      }
      result.push({
        day: DAY_NAMES[d],
        dayIndex: d,
        isWeekend: d === 0 || d === 6,
        hours,
      });
    }

    // Also compute weekday vs weekend averages
    const weekdayAvg: { hour: number; avgBuy: number; avgSell: number }[] = [];
    const weekendAvg: { hour: number; avgBuy: number; avgSell: number }[] = [];

    for (let h = 0; h < 24; h++) {
      let wdBuy = 0, wdSell = 0, wdCount = 0;
      let weBuy = 0, weSell = 0, weCount = 0;

      for (let d = 0; d < 7; d++) {
        const b = byDay[d][h];
        if (d === 0 || d === 6) {
          weBuy += b.buySum;
          weSell += b.sellSum;
          weCount += b.count;
        } else {
          wdBuy += b.buySum;
          wdSell += b.sellSum;
          wdCount += b.count;
        }
      }

      weekdayAvg.push({
        hour: h,
        avgBuy: wdCount > 0 ? Math.round((wdBuy / wdCount) * 100) / 100 : 0,
        avgSell: wdCount > 0 ? Math.round((wdSell / wdCount) * 100) / 100 : 0,
      });
      weekendAvg.push({
        hour: h,
        avgBuy: weCount > 0 ? Math.round((weBuy / weCount) * 100) / 100 : 0,
        avgSell: weCount > 0 ? Math.round((weSell / weCount) * 100) / 100 : 0,
      });
    }

    return NextResponse.json({
      days: days,
      totalFrames: data.frames.length,
      perDay: result,
      weekdayAvg,
      weekendAvg,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
