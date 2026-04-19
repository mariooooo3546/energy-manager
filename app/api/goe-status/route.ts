import { NextResponse } from "next/server";
import { getStore } from "@/src/lib/storage";

// Status is populated by the goe-agent background process (scripts/goe-agent.ts)
// running on a LAN-connected machine. Vercel cannot reach the charger directly.
const REDIS_KEY = "goe_status";

export async function GET() {
  const store = getStore();
  const status = await store.get<Record<string, unknown>>(REDIS_KEY);
  const err = await store.get<{ error: string; erroredAt: string }>(
    `${REDIS_KEY}_error`
  );

  if (!status) {
    return NextResponse.json(
      {
        error: "No go-e status in Redis. Is goe-agent running on LAN?",
        lastAgentError: err,
      },
      { status: 503 }
    );
  }

  const fetchedAt = status.fetchedAt as string | undefined;
  const ageSec = fetchedAt
    ? Math.round((Date.now() - new Date(fetchedAt).getTime()) / 1000)
    : null;

  return NextResponse.json({
    ...status,
    ageSec,
    stale: ageSec !== null && ageSec > 120,
    lastAgentError: err,
  });
}
