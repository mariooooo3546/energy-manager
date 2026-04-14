import { NextResponse } from "next/server";
import { PstrykClient } from "@/src/clients/pstryk";

export async function GET() {
  try {
    const pstryk = new PstrykClient(process.env.PSTRYK_API_KEY!);
    const [today, tomorrow] = await Promise.all([
      pstryk.getTodayPrices(),
      pstryk.getTomorrowPrices().catch(() => null),
    ]);

    return NextResponse.json({ today: today.frames, tomorrow: tomorrow?.frames ?? [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
