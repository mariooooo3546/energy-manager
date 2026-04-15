import { NextResponse } from "next/server";
import { setOverride, clearOverride, getOverride } from "@/src/lib/config";
import { DecisionAction } from "@/src/lib/types";

export async function GET() {
  return NextResponse.json(await getOverride());
}

export async function POST(req: Request) {
  const body = await req.json();

  if (body.action === "auto") {
    await clearOverride();
    return NextResponse.json({ status: "auto" });
  }

  await setOverride({
    active: true,
    action: body.action as DecisionAction,
    targetSoc: body.targetSoc ?? null,
    setAt: new Date().toISOString(),
  });

  return NextResponse.json(await getOverride());
}
