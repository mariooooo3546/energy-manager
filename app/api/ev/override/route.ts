import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/src/lib/storage";

const KEY = "ev_override";
const VALID_MODES = ["AUTO", "ECO", "CHEAP", "FAST", "STOP"] as const;
type Mode = (typeof VALID_MODES)[number];

type OverrideBody = {
  mode: Mode;
  setAt: string;
};

const DEFAULT: OverrideBody = { mode: "AUTO", setAt: new Date(0).toISOString() };

export async function GET() {
  const v = (await getStore().get<OverrideBody>(KEY)) ?? DEFAULT;
  return NextResponse.json(v);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const mode = body?.mode;
  if (!VALID_MODES.includes(mode)) {
    return NextResponse.json(
      { error: `Invalid mode. Allowed: ${VALID_MODES.join(", ")}` },
      { status: 400 }
    );
  }
  const next: OverrideBody = { mode, setAt: new Date().toISOString() };
  await getStore().set(KEY, next);
  return NextResponse.json(next);
}
