import { NextResponse } from "next/server";
import { getStore } from "@/src/lib/storage";

export async function GET() {
  const store = getStore();
  const status = await store.get<Record<string, unknown>>("ev_status");
  const tx = await store.get<Record<string, unknown>>("ev_transaction");

  if (!status) {
    return NextResponse.json(
      { error: "No EV status — is ocpp-server running and charger connected?" },
      { status: 503 }
    );
  }

  const updatedAt = status.updatedAt as string | undefined;
  const ageSec = updatedAt
    ? Math.round((Date.now() - new Date(updatedAt).getTime()) / 1000)
    : null;

  return NextResponse.json({
    ...status,
    transaction: tx,
    ageSec,
    stale: ageSec !== null && ageSec > 120,
  });
}
