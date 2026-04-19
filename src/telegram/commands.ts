import { PstrykClient } from "@/src/clients/pstryk";
import { DeyeCloudClient } from "@/src/clients/deye";
import { DecisionLogger } from "@/src/lib/logger";
import { SolcastClient } from "@/src/clients/solcast";
import { setOverride, clearOverride, getSchedule } from "@/src/lib/config";
import { getLocalHour } from "@/src/lib/time";
import { runCycle } from "@/src/scheduler/cron";
import { sendTelegramMessage } from "./notify";

interface CommandDeps {
  pstryk: PstrykClient;
  deye: DeyeCloudClient;
  logger: DecisionLogger;
}

function createDeps(): CommandDeps {
  return {
    pstryk: new PstrykClient(process.env.PSTRYK_API_KEY!),
    deye: new DeyeCloudClient({
      appId: process.env.DEYE_APP_ID!,
      appSecret: process.env.DEYE_APP_SECRET!,
      email: process.env.DEYE_EMAIL!,
      password: process.env.DEYE_PASSWORD!,
      deviceSn: process.env.DEYE_DEVICE_SN!,
    }),
    logger: new DecisionLogger(),
  };
}

export async function handleCommand(text: string): Promise<void> {
  const cmd = text.trim().split(/\s+/);
  const command = cmd[0].toLowerCase();

  try {
    switch (command) {
      case "/status":
        return await handleStatus();
      case "/ceny":
        return await handlePrices();
      case "/laduj":
        return await handleCharge(cmd[1]);
      case "/sprzedaj":
        return await handleSell();
      case "/rozladuj":
        return await handleDischarge(cmd[1]);
      case "/auto":
        return await handleAuto();
      case "/zysk":
        return await handleProfit();
      case "/log":
        return await handleLog();
      case "/prognoza":
        return await handleForecast();
      case "/harmonogram":
        return await handleSchedule();
      case "/cykl":
        return await handleRunCycle();
      case "/reset":
        return await handleReset();
      case "/help":
      case "/pomoc":
      case "/start":
        return await handleHelp();
      default:
        return await handleHelp();
    }
  } catch (err) {
    await sendTelegramMessage(`❌ Błąd: ${err}`);
  }
}

async function handleHelp(): Promise<void> {
  await sendTelegramMessage(
    "🧅 *Cebula Energy Manager* — komendy:\n\n" +
    "📊 *Status i dane*\n" +
    "/status — SOC, moc, aktualne ceny\n" +
    "/ceny — ceny Pstryk na dziś (24h)\n" +
    "/prognoza — prognoza PV na dziś + jutro\n" +
    "/harmonogram — pokaż godziny sprzedaży\n" +
    "/zysk — dzienny bilans PLN\n" +
    "/log — ostatnie 5 decyzji\n\n" +
    "⚡ *Sterowanie*\n" +
    "/sprzedaj — SELLING_FIRST (sprzedaj wszystko powyżej min SOC)\n" +
    "/rozladuj [SOC] — sprzedaj do celu (domyślnie 40%)\n" +
    "/laduj [SOC] — ładuj z sieci do celu (domyślnie 90%)\n" +
    "/auto — wróć do harmonogramu\n" +
    "/cykl — wymuś natychmiastową decyzję schedulera\n" +
    "/reset — bezpieczny tryb (ZERO_EXPORT_TO_LOAD, TOU off)"
  );
}

async function handleStatus(): Promise<void> {
  const deps = createDeps();
  const [status, prices] = await Promise.all([
    deps.deye.getStatus(),
    deps.pstryk.getTodayPrices(),
  ]);
  const hour = getLocalHour();
  const frame = prices.frames[hour];

  await sendTelegramMessage(
    `🔋 SOC: ${status.soc}%\n` +
    `⚡ PV: ${status.pvPower}W | Load: ${status.loadPower}W\n` +
    `💰 Kupno: ${frame?.metrics.pricing.price_gross.toFixed(2)} zł/kWh\n` +
    `💰 Sprzedaż: ${frame?.metrics.pricing.price_prosumer_gross.toFixed(2)} zł/kWh`
  );
}

async function handlePrices(): Promise<void> {
  const deps = createDeps();
  const prices = await deps.pstryk.getTodayPrices();
  const lines = prices.frames.map((f) => {
    const h = new Date(f.start).getHours().toString().padStart(2, "0");
    const buy = f.metrics.pricing.price_gross.toFixed(2);
    const sell = f.metrics.pricing.price_prosumer_gross.toFixed(2);
    return `${h}:00  📥${buy}  📤${sell}`;
  });
  await sendTelegramMessage(`Ceny dziś (zł/kWh):\n${lines.join("\n")}`);
}

async function handleCharge(targetArg?: string): Promise<void> {
  const targetSoc = targetArg ? parseInt(targetArg) : 90;
  await setOverride({ active: true, action: "CHARGE", targetSoc, setAt: new Date().toISOString() });
  await sendTelegramMessage(`⚡ Override: ŁADUJ do ${targetSoc}%. /auto żeby wyłączyć.`);
}

async function handleSell(): Promise<void> {
  await setOverride({ active: true, action: "SELL", targetSoc: null, setAt: new Date().toISOString() });
  await sendTelegramMessage(`💰 Override: SPRZEDAŻ. /auto żeby wyłączyć.`);
}

async function handleDischarge(targetArg?: string): Promise<void> {
  const targetSoc = targetArg ? parseInt(targetArg) : 40;
  await setOverride({ active: true, action: "SELL", targetSoc, setAt: new Date().toISOString() });
  await sendTelegramMessage(`🔋 Override: ROZŁADUJ do ${targetSoc}%. /auto żeby wyłączyć.`);
}

async function handleAuto(): Promise<void> {
  await clearOverride();
  await sendTelegramMessage(`🤖 Tryb automatyczny przywrócony.`);
}

async function handleProfit(): Promise<void> {
  const deps = createDeps();
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

  await sendTelegramMessage(
    `🔋 SOC: ${status.soc}%\n` +
    `📊 Dzienny zysk: ${sign}${netProfit.toFixed(2)} zł\n\n` +
    `📤 Sprzedaż: ${stats.gridFeedIn.toFixed(1)} kWh = +${sellRevenue.toFixed(2)} zł\n` +
    `📥 Kupno: ${stats.purchased.toFixed(1)} kWh = -${buyCost.toFixed(2)} zł\n\n` +
    (lines.length > 0 ? `Godzinowo:\n${lines.join("\n")}\n\n` : "") +
    `☀️ PV: ${stats.production.toFixed(1)} kWh\n` +
    `🏠 Zużycie: ${stats.consumption.toFixed(1)} kWh`
  );
}

async function handleLog(): Promise<void> {
  const deps = createDeps();
  const history = await deps.logger.getHistory(5);
  if (history.length === 0) {
    await sendTelegramMessage("Brak historii.");
    return;
  }
  const lines = history.map((d) => {
    const time = new Date(d.timestamp).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
    return `${time} ${d.action} SOC:${d.soc}% ${d.buyPrice.toFixed(2)}zł`;
  });
  await sendTelegramMessage(lines.join("\n"));
}

async function handleForecast(): Promise<void> {
  if (!process.env.SOLCAST_API_KEY || !process.env.SOLCAST_SITE_ID) {
    await sendTelegramMessage("Prognoza niedostępna (brak SOLCAST_API_KEY).");
    return;
  }
  const client = new SolcastClient();
  const forecast = await client.getForecast();
  const fmt = (d: typeof forecast.today) => {
    if (!d) return "brak danych";
    return `${d.totalKwh} kWh (P10 ${d.totalKwhP10} / P90 ${d.totalKwhP90})`;
  };
  await sendTelegramMessage(
    `☀️ Prognoza PV (Solcast)\n` +
    `Dziś: ${fmt(forecast.today)}\n` +
    `Jutro: ${fmt(forecast.tomorrow)}`
  );
}

async function handleSchedule(): Promise<void> {
  const schedule = await getSchedule();
  const entries = Object.entries(schedule).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
  if (entries.length === 0) {
    await sendTelegramMessage("📅 Harmonogram pusty — wszędzie samokonsumpcja.");
    return;
  }
  const lines = entries.map(([h, soc]) => `${h.padStart(2, "0")}:00 → cel ${soc}%`);
  await sendTelegramMessage(`📅 Harmonogram sprzedaży:\n${lines.join("\n")}`);
}

async function handleRunCycle(): Promise<void> {
  const deps = createDeps();
  await sendTelegramMessage("🔄 Odpalam cykl schedulera...");
  await runCycle({
    pstryk: deps.pstryk,
    deye: deps.deye,
    logger: deps.logger,
  });
  await sendTelegramMessage("✅ Cykl wykonany. Sprawdź /status.");
}

async function handleReset(): Promise<void> {
  const deps = createDeps();
  await clearOverride();
  await deps.deye.setDynamicControl({
    workMode: "ZERO_EXPORT_TO_LOAD",
    solarSellAction: "off",
    gridChargeAction: "off",
    touAction: "off",
    maxSellPower: 0,
    maxSolarPower: 15000,
    timeUseSettingItems: [
      { time: "00:00", power: 0, soc: 100, enableGeneration: false, enableGridCharge: false },
    ],
  });
  await Promise.allSettled([
    deps.deye.setEnergyPattern("LOAD_FIRST"),
    deps.deye.setZeroExportPower(20),
  ]);
  await sendTelegramMessage("🛡️ Reset: ZERO_EXPORT_TO_LOAD, TOU off, override off.");
}
