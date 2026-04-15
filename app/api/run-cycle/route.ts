import { NextResponse } from "next/server";
import { PstrykClient } from "@/src/clients/pstryk";
import { DeyeCloudClient } from "@/src/clients/deye";
import { DecisionLogger } from "@/src/lib/logger";
import { runCycle } from "@/src/scheduler/cron";
import { sendTelegramMessage } from "@/src/telegram/notify";

export async function POST() {
  try {
    const deye = new DeyeCloudClient({
      appId: process.env.DEYE_APP_ID!,
      appSecret: process.env.DEYE_APP_SECRET!,
      email: process.env.DEYE_EMAIL!,
      password: process.env.DEYE_PASSWORD!,
      deviceSn: process.env.DEYE_DEVICE_SN!,
    });
    const pstryk = new PstrykClient(process.env.PSTRYK_API_KEY!);
    const logger = new DecisionLogger();

    await runCycle({
      pstryk,
      deye,
      logger,
      onDecision: (action, reason, soc) => {
        const emoji = action === "CHARGE" ? "⚡" : action === "SELL" ? "💰" : "🔄";
        sendTelegramMessage(`${emoji} ${action}: ${reason} (SOC: ${soc}%)`).catch(console.error);
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
