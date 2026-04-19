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

    async function tryCall(name: string, path: string, opts: {
      method?: string;
      body?: object;
      query?: Record<string, string>;
    }) {
      try {
        const q = opts.query ? "?" + new URLSearchParams(opts.query).toString() : "";
        const init: RequestInit = {
          method: opts.method ?? "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `bearer ${token}`,
          },
        };
        if (opts.body) init.body = JSON.stringify(opts.body);
        const res = await fetch(`${BASE_URL}${path}${q}`, init);
        const text = await res.text();
        let json: unknown;
        try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
        results[name] = { status: res.status, ...(json as object) };
      } catch (err) {
        results[name] = { error: String(err) };
      }
    }

    const KNOWN_CMD = "011000B20001022AAA229D";

    // /order/customCmd exists but POST not supported. Try other methods + body keys + path variants.
    const path = "/order/customCmd";

    await tryCall(`${path}__GET_query`, path, {
      method: "GET",
      query: { deviceSn, content: KNOWN_CMD },
    });
    await tryCall(`${path}__PUT_content`, path, {
      method: "PUT",
      body: { deviceSn, content: KNOWN_CMD },
    });
    await tryCall(`${path}__PATCH_content`, path, {
      method: "PATCH",
      body: { deviceSn, content: KNOWN_CMD },
    });
    await tryCall(`${path}__POST_body_wrap`, path, {
      method: "POST",
      body: { deviceSn, body: { content: KNOWN_CMD } },
    });

    // /order/customCmd/send or /submit
    for (const suffix of ["/send", "/submit", "/issue", "/execute"]) {
      await tryCall(`${path}${suffix}__content`, `${path}${suffix}`, {
        body: { deviceSn, content: KNOWN_CMD },
      });
    }

    // Maybe it's /order/ORDER_TYPE/customCmd
    for (const typ of ["sys", "device", "inverter"]) {
      await tryCall(`/order/${typ}/customCmd__POST`, `/order/${typ}/customCmd`, {
        body: { deviceSn, content: KNOWN_CMD },
      });
    }

    // Completely different root
    for (const root of ["/device", "/strategy", "/control", "/cmd"]) {
      await tryCall(`${root}/customCmd__POST`, `${root}/customCmd`, {
        body: { deviceSn, content: KNOWN_CMD },
      });
    }

    return NextResponse.json(results, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
