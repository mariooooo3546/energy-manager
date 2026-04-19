import { NextRequest, NextResponse } from "next/server";
import { SolcastClient } from "@/src/clients/solcast";
import { ForecastSolarClient } from "@/src/clients/forecast-solar";

export async function GET(req: NextRequest) {
  const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1";
  try {
    if (process.env.SOLCAST_API_KEY && process.env.SOLCAST_SITE_ID) {
      const client = new SolcastClient();
      const forecast = await client.getForecast({ forceRefresh });
      return NextResponse.json(forecast);
    }
    // Fallback: legacy forecast.solar if Solcast not configured
    const fallback = await new ForecastSolarClient().getForecast();
    return NextResponse.json({ ...fallback, source: "forecast.solar" });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
