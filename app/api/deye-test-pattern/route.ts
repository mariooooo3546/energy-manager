import { NextResponse } from "next/server";
import { createHash } from "crypto";

const BASE_URL = "https://eu1-developer.deyecloud.com/v1.0";

export async function GET() {
  try {
    const appId = process.env.DEYE_APP_ID!;
    const appSecret = process.env.DEYE_APP_SECRET!;
    const email = process.env.DEYE_EMAIL!;
    const password = process.env.DEYE_PASSWORD!;
    const deviceSn = process.env.DEYE_DEVICE_SN!;

    const hashedPassword = createHash("sha256").update(password).digest("hex");
    const authRes = await fetch(`${BASE_URL}/account/token?appId=${appId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appSecret, email, password: hashedPassword }),
    });
    const authJson = await authRes.json();
    const token = authJson.accessToken;

    const results: Record<string, unknown> = {};

    async function tryCall(name: string, path: string, body: object) {
      try {
        const res = await fetch(`${BASE_URL}${path}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `bearer ${token}`,
          },
          body: JSON.stringify({ deviceSn, ...body }),
        });
        const json = await res.json();
        results[name] = { status: res.status, ...json };
      } catch (err) {
        results[name] = { error: String(err) };
      }
    }

    // Known working Modbus RTU frame: write register 178 (EnergyManagementMode) = 0x2AAA
    // Format: slave(01) func(10) reg(00B2) qty(0001) bytes(02) value(2AAA) crc(229D)
    const KNOWN_CMD = "011000B20001022AAA229D";

    // Try every plausible endpoint for "customized command" in Deye Cloud API
    const endpoints = [
      "/order/customized/command",
      "/order/customized/cmd",
      "/order/custom/command",
      "/order/customCmd",
      "/order/customCommand",
      "/order/modbus/write",
      "/order/modbus/custom",
      "/order/sys/customized",
      "/order/sys/customCmd",
      "/device/control/customCmd",
      "/device/customCmd",
      "/command/custom",
      "/order/command",
      "/order/raw/modbus",
      "/order/inverter/customCmd",
    ];

    const bodyVariants = [
      { key: "content", val: { content: KNOWN_CMD } },
      { key: "command", val: { command: KNOWN_CMD } },
      { key: "modbusCmd", val: { modbusCmd: KNOWN_CMD } },
      { key: "cmd", val: { cmd: KNOWN_CMD } },
      { key: "rawCmd", val: { rawCmd: KNOWN_CMD } },
      { key: "data", val: { data: KNOWN_CMD } },
    ];

    for (const ep of endpoints) {
      for (const bv of bodyVariants) {
        const name = `${ep}__${bv.key}`;
        await tryCall(name, ep, bv.val);
        const r = results[name] as { status?: number };
        // If any endpoint returns non-404, keep testing but log interesting
        if (r?.status && r.status !== 404) {
          results[`__HIT_${ep}_${bv.key}`] = r;
        }
      }
    }

    return NextResponse.json(results, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
