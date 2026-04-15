import { NextResponse } from "next/server";
import { createHash } from "crypto";

const SOLARMAN_API = "https://globalapi.solarmanpv.com";

export async function GET() {
  try {
    const email = process.env.DEYE_EMAIL!;
    const password = process.env.DEYE_PASSWORD!;
    const loggerSn = process.env.LOGGER_SN || "3180594480";

    // Try multiple known appId/appSecret combinations
    // Solarman and Deye share some credentials
    const credentials = [
      // Deye developer credentials
      { appId: process.env.DEYE_APP_ID!, appSecret: process.env.DEYE_APP_SECRET! },
      // Known Solarman community appIds
      { appId: "202104714340164", appSecret: "6e2a3b7fc14e4b52be4367e44a7c3a67" },
    ];

    const results: Record<string, unknown> = {};
    let token: string | null = null;
    let workingAppId: string | null = null;

    const hashedPassword = createHash("sha256").update(password).digest("hex");

    // Try each credential set
    for (const cred of credentials) {
      try {
        const authRes = await fetch(
          `${SOLARMAN_API}/account/v1.0/token?appId=${cred.appId}&language=en`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              appSecret: cred.appSecret,
              email,
              password: hashedPassword,
            }),
          }
        );
        const authJson = await authRes.json();
        results[`auth_${cred.appId.slice(0, 6)}`] = {
          status: authRes.status,
          success: authJson.success,
          msg: authJson.msg,
          hasToken: !!authJson.access_token,
        };

        if (authJson.success && authJson.access_token) {
          token = authJson.access_token;
          workingAppId = cred.appId;
        }
      } catch (err) {
        results[`auth_${cred.appId.slice(0, 6)}`] = { error: String(err) };
      }
    }

    if (!token) {
      return NextResponse.json({
        error: "No Solarman auth worked",
        results,
        hint: "Need Solarman-specific appId/appSecret. Register at open.solarmanpv.com",
      });
    }

    // Try to get device info
    try {
      const deviceRes = await fetch(
        `${SOLARMAN_API}/device/v1.0/currentData?appId=${workingAppId}&language=en`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `bearer ${token}`,
          },
          body: JSON.stringify({ deviceSn: loggerSn }),
        }
      );
      const deviceJson = await deviceRes.json();
      results["deviceCurrentData"] = {
        status: deviceRes.status,
        success: deviceJson.success,
        msg: deviceJson.msg,
        dataCount: deviceJson.dataList?.length ?? 0,
      };
    } catch (err) {
      results["deviceCurrentData"] = { error: String(err) };
    }

    // Try control endpoint (write register) - register 340 = work mode
    try {
      const controlRes = await fetch(
        `${SOLARMAN_API}/device/v1.0/control?appId=${workingAppId}&language=en`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `bearer ${token}`,
          },
          body: JSON.stringify({
            deviceSn: loggerSn,
            commandType: "write",
            command: {
              registerAddress: 340,
              registerValue: 2, // SELLING_FIRST = 2 on some Deye models
            },
          }),
        }
      );
      const controlJson = await controlRes.json();
      results["control_register340"] = { status: controlRes.status, ...controlJson };
    } catch (err) {
      results["control_register340"] = { error: String(err) };
    }

    // Try alternate control formats
    try {
      const controlRes2 = await fetch(
        `${SOLARMAN_API}/device/v1.0/controlV2?appId=${workingAppId}&language=en`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `bearer ${token}`,
          },
          body: JSON.stringify({
            deviceSn: loggerSn,
            operatingType: 1,
            params: JSON.stringify({ modbus: { register: 340, value: 2, fc: 6 } }),
          }),
        }
      );
      const controlJson2 = await controlRes2.json();
      results["controlV2"] = { status: controlRes2.status, ...controlJson2 };
    } catch (err) {
      results["controlV2"] = { error: String(err) };
    }

    return NextResponse.json({
      workingAppId: workingAppId?.slice(0, 6) + "...",
      loggerSn,
      results,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
