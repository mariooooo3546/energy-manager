import { NextResponse } from "next/server";
import { GoeClient } from "@/src/clients/goe";

export async function GET() {
  const token = process.env.GOE_API_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "GOE_API_TOKEN not set. Enable Cloud API in go-e app and add env var." },
      { status: 503 }
    );
  }

  try {
    const client = new GoeClient({
      baseUrl: process.env.GOE_API_BASE,
      token,
      deviceId: process.env.GOE_DEVICE_ID,
    });
    const status = await client.getStatus();
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
