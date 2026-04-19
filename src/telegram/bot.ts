import TelegramBot from "node-telegram-bot-api";
import { PstrykClient } from "@/src/clients/pstryk";
import { DeyeCloudClient } from "@/src/clients/deye";
import { DecisionLogger } from "@/src/lib/logger";
import { setOverride, clearOverride } from "@/src/lib/config";
import { getLocalHour } from "@/src/lib/time";

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
      const hour = getLocalHour();
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
    await setOverride({ active: true, action: "CHARGE", targetSoc, setAt: new Date().toISOString() });
    await bot.sendMessage(msg.chat.id, `⚡ Override: ŁADUJ do ${targetSoc}%. /auto żeby wyłączyć.`);
  });

  bot.onText(/\/sprzedaj/, async (msg) => {
    if (!guard(msg)) return;
    await setOverride({ active: true, action: "SELL", targetSoc: null, setAt: new Date().toISOString() });
    await bot.sendMessage(msg.chat.id, `💰 Override: SPRZEDAŻ. /auto żeby wyłączyć.`);
  });

  bot.onText(/\/rozladuj\s*(\d+)?/, async (msg, match) => {
    if (!guard(msg)) return;
    const targetSoc = match?.[1] ? parseInt(match[1]) : 40;
    await setOverride({ active: true, action: "SELL", targetSoc, setAt: new Date().toISOString() });
    await bot.sendMessage(msg.chat.id, `🔋 Override: ROZŁADUJ do ${targetSoc}%. /auto żeby wyłączyć.`);
  });

  bot.onText(/\/auto/, async (msg) => {
    if (!guard(msg)) return;
    await clearOverride();
    await bot.sendMessage(msg.chat.id, `🤖 Tryb automatyczny przywrócony.`);
  });

  bot.onText(/\/zysk/, async (msg) => {
    if (!guard(msg)) return;
    try {
      const [status, stats, hourly, prices] = await Promise.all([
        deps.deye.getStatus(),
        deps.deye.getDailyStats(),
        deps.deye.getHourlyStats(),
        deps.pstryk.getTodayPrices(),
      ]);

      let sellRevenue = 0;
      let buyCost = 0;
      const lines: string[] = [];

      for (const h of hourly) {
        const frame = prices.frames[h.hour];
        if (!frame) continue;
        const sellPrice = frame.metrics.pricing.price_prosumer_gross;
        const buyPrice = frame.metrics.pricing.price_gross;
        const revenue = h.sold * sellPrice;
        const cost = h.bought * buyPrice;
        sellRevenue += revenue;
        buyCost += cost;

        if (h.sold > 0 || h.bought > 0) {
          const hh = h.hour.toString().padStart(2, "0");
          const parts: string[] = [];
          if (h.sold > 0) parts.push(`📤${h.sold}kWh×${sellPrice.toFixed(2)}=+${revenue.toFixed(2)}`);
          if (h.bought > 0) parts.push(`📥${h.bought}kWh×${buyPrice.toFixed(2)}=-${cost.toFixed(2)}`);
          lines.push(`${hh}:00 ${parts.join(" ")}`);
        }
      }

      const netProfit = sellRevenue - buyCost;
      const sign = netProfit >= 0 ? "+" : "";

      await bot.sendMessage(
        msg.chat.id,
        `🔋 SOC: ${status.soc}%\n` +
          `📊 Dzienny zysk: ${sign}${netProfit.toFixed(2)} zł\n\n` +
          `📤 Sprzedaż: ${stats.gridFeedIn.toFixed(1)} kWh = +${sellRevenue.toFixed(2)} zł\n` +
          `📥 Kupno: ${stats.purchased.toFixed(1)} kWh = -${buyCost.toFixed(2)} zł\n\n` +
          (lines.length > 0 ? `Godzinowo:\n${lines.join("\n")}\n\n` : "") +
          `☀️ PV: ${stats.production.toFixed(1)} kWh\n` +
          `🏠 Zużycie: ${stats.consumption.toFixed(1)} kWh`
      );
    } catch (err) {
      await bot.sendMessage(msg.chat.id, `❌ Błąd: ${err}`);
    }
  });

  bot.onText(/\/log/, async (msg) => {
    if (!guard(msg)) return;
    const history = await deps.logger.getHistory(5);
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
