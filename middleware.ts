import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Only protect /api routes
  if (!pathname.startsWith("/api")) return NextResponse.next();

  // Same-origin requests (from dashboard) - allow all
  const referer = req.headers.get("referer");
  const host = req.headers.get("host");
  if (referer && host && new URL(referer).host === host) {
    return NextResponse.next();
  }

  // Public read-only routes
  const publicRoutes = ["/api/status", "/api/prices", "/api/history", "/api/conditions", "/api/schedule", "/api/profit"];
  if (publicRoutes.some((r) => pathname.startsWith(r)) && req.method === "GET") {
    return NextResponse.next();
  }

  // Cron route - Vercel sends Authorization header
  if (pathname === "/api/cron") {
    const secret = process.env.CRON_SECRET;
    if (!secret) return NextResponse.next();
    if (req.headers.get("authorization") === `Bearer ${secret}`) return NextResponse.next();
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Telegram webhook - validated in route handler
  if (pathname.startsWith("/api/telegram")) return NextResponse.next();

  // External requests to protected routes require API_SECRET
  const secret = process.env.API_SECRET;
  if (!secret) return NextResponse.next();

  const headerKey = req.headers.get("x-api-key");
  const queryKey = req.nextUrl.searchParams.get("key");

  if (headerKey === secret || queryKey === secret) {
    return NextResponse.next();
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export const config = {
  matcher: "/api/:path*",
};
