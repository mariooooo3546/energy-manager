/**
 * go-e Charger bridge agent.
 *
 * Long-running Node process that polls the charger's LAN HTTP v2 API
 * every POLL_INTERVAL_MS and pushes the parsed status to Redis under the
 * key `goe_status`. Vercel serverless functions read from Redis since
 * they cannot reach devices on the user's LAN directly.
 *
 * Run locally: `npm run agent:goe`
 * On Mac mini: `pm2 start npm --name goe-agent -- run agent:goe`
 *
 * Env vars required:
 *   GOE_LOCAL_URL  — e.g. http://192.168.1.50  (LAN IP, no trailing /api)
 *   REDIS_URL      — same Redis as energy-manager
 * Optional:
 *   GOE_API_TOKEN  — only if charger has HTTP password set
 *   GOE_POLL_MS    — override polling interval (default 30000)
 */

import "dotenv/config";
import { GoeClient } from "@/src/clients/goe";
import { getStore } from "@/src/lib/storage";

const POLL_INTERVAL_MS = parseInt(process.env.GOE_POLL_MS ?? "30000", 10);
const REDIS_KEY = "goe_status";

function buildClient(): GoeClient {
  const localUrl = process.env.GOE_LOCAL_URL;
  if (!localUrl) {
    throw new Error("GOE_LOCAL_URL not set — e.g. http://192.168.1.50");
  }
  return new GoeClient({
    baseUrl: `${localUrl.replace(/\/$/, "")}/api`,
    token: process.env.GOE_API_TOKEN ?? "",
  });
}

async function tick(client: GoeClient): Promise<void> {
  const store = getStore();
  try {
    const status = await client.getStatus();
    const payload = {
      ...status,
      fetchedAt: new Date().toISOString(),
      source: "goe-agent",
    };
    await store.set(REDIS_KEY, payload);
    console.log(
      `[goe-agent] ${payload.fetchedAt} car=${status.carState} amp=${status.chargeCurrent}A power=${status.power}W soc_session_wh=${status.sessionWh}`
    );
  } catch (err) {
    await store.set(`${REDIS_KEY}_error`, {
      error: String(err),
      erroredAt: new Date().toISOString(),
    });
    console.error("[goe-agent] poll failed:", err);
  }
}

async function main(): Promise<void> {
  console.log(
    `[goe-agent] starting, polling ${process.env.GOE_LOCAL_URL} every ${POLL_INTERVAL_MS}ms`
  );
  const client = buildClient();

  await tick(client);
  setInterval(() => {
    tick(client).catch((e) => console.error("[goe-agent] tick error:", e));
  }, POLL_INTERVAL_MS);
}

main().catch((err) => {
  console.error("[goe-agent] fatal:", err);
  process.exit(1);
});
