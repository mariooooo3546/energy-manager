import { NextResponse } from "next/server";
import { setOverride, clearOverride, getOverride } from "@/src/lib/config";

const VALID_ACTIONS = ["CHARGE", "SELL", "NORMAL"] as const;

export async function GET() {
  return NextResponse.json(await getOverride());
}

export async function POST(req: Request) {
  const body = await req.json();

  if (body.action === "auto") {
    await clearOverride();
    return NextResponse.json({ status: "auto" });
  }

  if (!VALID_ACTIONS.includes(body.action)) {
    return NextResponse.json(
      { error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}, auto` },
      { status: 400 }
    );
  }

  const targetSoc = body.targetSoc != null
    ? Math.max(0, Math.min(100, Number(body.targetSoc)))
    : null;

  await setOverride({
    active: true,
    action: body.action,
    targetSoc,
    setAt: new Date().toISOString(),
  });

  return NextResponse.json(await getOverride());
}
