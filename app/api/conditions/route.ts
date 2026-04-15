import { NextRequest, NextResponse } from "next/server";
import { getConditions, setConditions } from "@/src/lib/config";
import { TradeConditions } from "@/src/lib/types";

export async function GET() {
  return NextResponse.json(await getConditions());
}

export async function POST(req: NextRequest) {
  try {
    const body: TradeConditions = await req.json();

    const cleaned: TradeConditions = {
      sellMinPrice: Math.max(0, Number(body.sellMinPrice) || 0),
      sellMinSoc: Math.max(0, Math.min(100, Number(body.sellMinSoc) || 0)),
      buyMaxPrice: Math.max(0, Number(body.buyMaxPrice) || 0),
      buyMaxSoc: Math.max(0, Math.min(100, Number(body.buyMaxSoc) || 0)),
      minSocFloor: Math.max(0, Math.min(100, Number(body.minSocFloor) || 0)),
    };

    await setConditions(cleaned);
    return NextResponse.json({ ok: true, conditions: cleaned });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
