import { NextRequest, NextResponse } from "next/server";
import { getSchedule, setSchedule, HourlySchedule } from "@/src/lib/config";

export async function GET() {
  return NextResponse.json(await getSchedule());
}

export async function POST(req: NextRequest) {
  try {
    const body: HourlySchedule = await req.json();

    const cleaned: HourlySchedule = {};
    for (const [key, value] of Object.entries(body)) {
      const hour = parseInt(key);
      if (isNaN(hour) || hour < 0 || hour > 23) continue;
      if (typeof value !== "number" || value < 0 || value > 100) continue;
      cleaned[String(hour)] = value;
    }

    await setSchedule(cleaned);
    return NextResponse.json({ ok: true, schedule: cleaned });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
