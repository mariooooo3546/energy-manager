import { NextResponse } from "next/server";
import { ForecastSolarClient } from "@/src/clients/forecast-solar";

export async function GET() {
  try {
    const client = new ForecastSolarClient();
    const forecast = await client.getForecast();
    return NextResponse.json(forecast);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
