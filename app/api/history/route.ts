import { NextResponse } from "next/server";
import { DecisionLogger } from "@/src/lib/logger";

export async function GET() {
  const logger = new DecisionLogger();
  return NextResponse.json(logger.getHistory(50));
}
