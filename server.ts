import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { PstrykClient } from "@/src/clients/pstryk";
import { DeyeCloudClient } from "@/src/clients/deye";
import { DecisionLogger } from "@/src/lib/logger";
import { createBot, sendNotification } from "@/src/telegram/bot";
import { startScheduler } from "@/src/scheduler/cron";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();
const port = parseInt(process.env.PORT || "3000");

app.prepare().then(() => {
  const pstryk = new PstrykClient(process.env.PSTRYK_API_KEY!);
  const deye = new DeyeCloudClient({
    appId: process.env.DEYE_APP_ID!,
    appSecret: process.env.DEYE_APP_SECRET!,
    email: process.env.DEYE_EMAIL!,
    password: process.env.DEYE_PASSWORD!,
    deviceSn: process.env.DEYE_DEVICE_SN!,
  });
  const logger = new DecisionLogger();

  const bot = createBot({ pstryk, deye, logger });

  startScheduler({
    pstryk,
    deye,
    logger,
    onDecision: (action, reason, soc) => {
      const emoji = action === "CHARGE" ? "⚡" : action === "SELL" ? "💰" : "🔄";
      sendNotification(bot, `${emoji} ${action}: ${reason}`);
    },
  });

  createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  }).listen(port, () => {
    console.log(`Energy Manager running on http://localhost:${port}`);
    console.log("Telegram bot: polling");
    console.log(`Scheduler: ${process.env.CRON_SCHEDULE || "55 * * * *"}`);
  });
});
