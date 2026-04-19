/**
 * Minimal OCPP 1.6J Central System (CSMS) for the go-e Charger.
 *
 * The charger connects to us (outbound WebSocket). We handle the core
 * inbound messages (BootNotification, Heartbeat, StatusNotification,
 * MeterValues, StartTransaction, StopTransaction) and persist state to
 * Redis. Outbound control commands can be sent via getActiveClient().call(...).
 *
 * Run locally: `npm run agent:ocpp`
 * On Mac mini: `pm2 start npm --name ocpp -- run agent:ocpp`
 *
 * Env vars:
 *   OCPP_PORT   — listen port (default 9220)
 *   REDIS_URL   — shared with energy-manager
 *
 * Charger config (in go-e app → Connection → OCPP):
 *   Server URL: ws://<LAN-IP-of-this-host>:9220/ocpp/EM-CHARGER
 *   Protocol:   OCPP 1.6 JSON
 *   Charge Point ID: EM-CHARGER (or anything; used as identity)
 */

import "dotenv/config";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { RPCServer, createRPCError } = require("ocpp-rpc");
import { getStore } from "@/src/lib/storage";

const PORT = parseInt(process.env.OCPP_PORT ?? "9220", 10);
const REDIS_KEY_STATUS = "ev_status";
const REDIS_KEY_TX = "ev_transaction";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let activeClient: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getActiveClient(): any {
  return activeClient;
}

async function updateStatus(patch: Record<string, unknown>): Promise<void> {
  const store = getStore();
  const current = (await store.get<Record<string, unknown>>(REDIS_KEY_STATUS)) ?? {};
  const merged = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await store.set(REDIS_KEY_STATUS, merged);
}

const server = new RPCServer({
  protocols: ["ocpp1.6"],
  strictMode: true,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
server.auth((accept: any, reject: any, handshake: any) => {
  const url: string = handshake.request.url ?? "";
  const parts = url.split("/").filter(Boolean);
  const identity = parts[parts.length - 1];
  if (!identity) return reject(401, "missing identity");
  console.log(`[ocpp] auth: identity=${identity} url=${url}`);
  accept({ sessionId: identity });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
server.on("client", async (client: any) => {
  console.log(`[ocpp] client connected: ${client.identity}`);
  activeClient = client;
  await updateStatus({ connected: true, identity: client.identity });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client.handle("BootNotification", async ({ params }: { params: any }) => {
    console.log("[ocpp] BootNotification", params);
    await updateStatus({ boot: params });
    return {
      status: "Accepted",
      currentTime: new Date().toISOString(),
      interval: 60,
    };
  });

  client.handle("Heartbeat", async () => {
    return { currentTime: new Date().toISOString() };
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client.handle("StatusNotification", async ({ params }: { params: any }) => {
    console.log("[ocpp] StatusNotification", params);
    await updateStatus({ lastStatus: params });
    return {};
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client.handle("MeterValues", async ({ params }: { params: any }) => {
    await updateStatus({ lastMeter: params, lastMeterAt: new Date().toISOString() });
    return {};
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client.handle("Authorize", async ({ params }: { params: any }) => {
    console.log("[ocpp] Authorize (auto-accepted)", params);
    return { idTagInfo: { status: "Accepted" } };
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client.handle("StartTransaction", async ({ params }: { params: any }) => {
    const store = getStore();
    const transactionId = Math.floor(Date.now() / 1000);
    await store.set(REDIS_KEY_TX, {
      ...params,
      transactionId,
      startedAt: new Date().toISOString(),
    });
    console.log("[ocpp] StartTransaction →", transactionId);
    return { transactionId, idTagInfo: { status: "Accepted" } };
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client.handle("StopTransaction", async ({ params }: { params: any }) => {
    const store = getStore();
    const current = (await store.get<Record<string, unknown>>(REDIS_KEY_TX)) ?? {};
    await store.set(REDIS_KEY_TX, {
      ...current,
      stop: params,
      stoppedAt: new Date().toISOString(),
    });
    console.log("[ocpp] StopTransaction", params);
    return { idTagInfo: { status: "Accepted" } };
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client.handle(({ method, params }: { method: string; params: any }) => {
    console.warn(`[ocpp] unhandled ${method}`, params);
    throw createRPCError("NotImplemented");
  });

  client.on("close", async () => {
    console.log(`[ocpp] client disconnected: ${client.identity}`);
    if (activeClient?.identity === client.identity) activeClient = null;
    await updateStatus({ connected: false });
  });
});

async function main(): Promise<void> {
  await server.listen(PORT);
  console.log(
    `[ocpp] CSMS listening on ws://0.0.0.0:${PORT}/ocpp/<id>  (configure this URL in go-e app)`
  );
}

main().catch((err) => {
  console.error("[ocpp] fatal:", err);
  process.exit(1);
});
