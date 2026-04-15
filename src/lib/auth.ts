import { NextRequest, NextResponse } from "next/server";

/**
 * Simple API key authentication middleware.
 * Set API_SECRET env var on Vercel to protect all API routes.
 *
 * Public routes (no auth needed): /api/status, /api/prices
 * Cron route uses CRON_SECRET (set by Vercel automatically)
 * Telegram webhook uses TELEGRAM_WEBHOOK_SECRET
 */

const PUBLIC_ROUTES = ["/api/status", "/api/prices", "/api/prices/history"];

export function isAuthorized(req: NextRequest, pathname: string): boolean {
  // Public routes - no auth needed (read-only, no sensitive data)
  if (PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) return true;

  // Cron route - Vercel sends its own auth
  if (pathname === "/api/cron") {
    const secret = process.env.CRON_SECRET;
    if (!secret) return true; // No secret = allow (dev mode)
    return req.headers.get("authorization") === `Bearer ${secret}`;
  }

  // Telegram webhook - validated separately in route handler
  if (pathname.startsWith("/api/telegram")) return true;

  // All other routes require API_SECRET
  const secret = process.env.API_SECRET;
  if (!secret) return true; // No secret configured = allow (dev mode)

  // Check header or query param
  const headerKey = req.headers.get("x-api-key");
  const queryKey = req.nextUrl.searchParams.get("key");

  return headerKey === secret || queryKey === secret;
}

export function unauthorizedResponse(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
