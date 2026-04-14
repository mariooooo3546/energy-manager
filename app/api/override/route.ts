import { NextResponse } from "next/server";
import { setOverride, clearOverride, getOverride } from "@/src/lib/config";
import { DecisionAction } from "@/src/lib/types";

export async function GET() {
  return NextResponse.json(getOverride());
}

export async function POST(req: Request) {
  const body = await req.json();

  if (body.action === "auto") {
    clearOverride();
    return NextResponse.json({ status: "auto" });
  }

  setOverride({
    active: true,
    action: body.action as DecisionAction,
    targetSoc: body.targetSoc ?? null,
    setAt: new Date().toISOString(),
  });

  return NextResponse.json(getOverride());
}
