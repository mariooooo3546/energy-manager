import TelegramBot from "node-telegram-bot-api";
import { PstrykClient } from "@/src/clients/pstryk";
import { DeyeCloudClient } from "@/src/clients/deye";
import { DecisionLogger } from "@/src/lib/logger";
import { setOverride, clearOverride } from "@/src/lib/config";

interface BotDeps {
  pstryk: PstrykClient;
  deye: DeyeCloudClient;
  logger: DecisionLogger;
}

export function createBot(deps: BotDeps): TelegramBot {
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const chatId = process.env.TELEGRAM_CHAT_ID!;

  const bot = new TelegramBot(token, { polling: true });

  function guard(msg: TelegramBot.Message): boolean {
    return msg.chat.id.toString() === chatId;
  }

  bot.onText(/\/status/, async (msg) => {
    if (!guard(msg)) return;
    try {
      const status = await deps.deye.getStatus();
      const prices = await deps.pstryk.getTodayPrices();
      const hour = new Date().getHours();
      const frame = prices.frames[hour];

      await bot.sendMessage(
        msg.chat.id,
        `🔋 SOC: ${status.soc}%\n` +
          `⚡ PV: ${status.pvPower}W | Load: ${status.loadPower}W\n` +
          `💰 Kupno: ${frame?.metrics.pricing.price_gross.toFixed(2)} zł/kWh\n` +
          `💰 Sprzedaż: ${frame?.metrics.pricing.price_prosumer_gross.toFixed(2)} zł/kWh`
      );
    } catch (err) {
      await bot.sendMessage(msg.chat.id, `❌ Błąd: ${err}`);
    }
  });

  bot.onText(/\/ceny/, async (msg) => {
    if (!guard(msg)) return;
    try {
      const prices = await deps.pstryk.getTodayPrices();
      const lines = prices.frames.map((f) => {
        const h = new Date(f.start).getHours().toString().padStart(2, "0");
        const buy = f.metrics.pricing.price_gross.toFixed(2);
        const sell = f.metrics.pricing.price_prosumer_gross.toFixed(2);
        return `${h}:00  📥${buy}  📤${sell}`;
      });
      await bot.sendMessage(msg.chat.id, `Ceny dziś (zł/kWh):\n${lines.join("\n")}`);
    } catch (err) {
      await bot.sendMessage(msg.chat.id, `❌ Błąd: ${err}`);
    }
  });

  bot.onText(/\/laduj\s*(\d+)?/, async (msg, match) => {
    if (!guard(msg)) return;
    const targetSoc = match?.[1] ? parseInt(match[1]) : 90;
    setOverride({ active: true, action: "CHARGE", targetSoc, setAt: new Date().toISOString() });
    await bot.sendMessage(msg.chat.id, `⚡ Override: ŁADUJ do ${targetSoc}%. /auto żeby wyłączyć.`);
  });

  bot.onText(/\/sprzedaj/, async (msg) => {
    if (!guard(msg)) return;
    setOverride({ active: true, action: "SELL", targetSoc: null, setAt: new Date().toISOString() });
    await bot.sendMessage(msg.chat.id, `💰 Override: SPRZEDAŻ. /auto żeby wyłączyć.`);
  });

  bot.onText(/\/rozladuj\s*(\d+)?/, async (msg, match) => {
    if (!guard(msg)) return;
    const targetSoc = match?.[1] ? parseInt(match[1]) : 40;
    setOverride({ active: true, action: "SELL", targetSoc, setAt: new Date().toISOString() });
    await bot.sendMessage(msg.chat.id, `🔋 Override: ROZŁADUJ do ${targetSoc}%. /auto żeby wyłączyć.`);
  });

  bot.onText(/\/auto/, async (msg) => {
    if (!guard(msg)) return;
    clearOverride();
    await bot.sendMessage(msg.chat.id, `🤖 Tryb automatyczny przywrócony.`);
  });

  bot.onText(/\/log/, async (msg) => {
    if (!guard(msg)) return;
    const history = deps.logger.getHistory(5);
    if (history.length === 0) {
      await bot.sendMessage(msg.chat.id, "Brak historii.");
      return;
    }
    const lines = history.map((d) => {
      const time = new Date(d.timestamp).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
      return `${time} ${d.action} SOC:${d.soc}% ${d.buyPrice.toFixed(2)}zł`;
    });
    await bot.sendMessage(msg.chat.id, lines.join("\n"));
  });

  return bot;
}

export function sendNotification(bot: TelegramBot, message: string): void {
  const chatId = process.env.TELEGRAM_CHAT_ID!;
  bot.sendMessage(chatId, message).catch(console.error);
}
