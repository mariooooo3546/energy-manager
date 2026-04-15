import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Only protect /api routes
  if (!pathname.startsWith("/api")) return NextResponse.next();

  // Public routes (read-only, non-sensitive)
  const publicRoutes = ["/api/status", "/api/prices", "/api/history"];
  if (publicRoutes.some((r) => pathname.startsWith(r))) return NextResponse.next();

  // Cron route - Vercel sends Authorization header
  if (pathname === "/api/cron") {
    const secret = process.env.CRON_SECRET;
    if (!secret) return NextResponse.next();
    if (req.headers.get("authorization") === `Bearer ${secret}`) return NextResponse.next();
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Telegram webhook - has its own validation in route handler
  if (pathname.startsWith("/api/telegram")) return NextResponse.next();

  // All other API routes require API_SECRET
  const secret = process.env.API_SECRET;
  if (!secret) return NextResponse.next(); // Dev mode - no auth

  const headerKey = req.headers.get("x-api-key");
  const queryKey = req.nextUrl.searchParams.get("key");
  const cookieKey = req.cookies.get("api_key")?.value;

  if (headerKey === secret || queryKey === secret || cookieKey === secret) {
    return NextResponse.next();
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export const config = {
  matcher: "/api/:path*",
};
