import { NextRequest, NextResponse } from "next/server";
import { handleCommand } from "@/src/telegram/commands";

export async function POST(req: NextRequest) {
  // Validate webhook secret
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (process.env.TELEGRAM_WEBHOOK_SECRET && secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const update = await req.json();
    const message = update.message;

    if (!message?.text) {
      return NextResponse.json({ ok: true });
    }

    // Validate chat ID
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (chatId && message.chat.id.toString() !== chatId) {
      return NextResponse.json({ ok: true });
    }

    // Process command
    if (message.text.startsWith("/")) {
      await handleCommand(message.text);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Telegram Webhook] Error:", err);
    return NextResponse.json({ ok: true }); // Always 200 to Telegram
  }
}
