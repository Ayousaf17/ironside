import rateLimit from "next-rate-limit";
import { NextRequest, NextResponse } from "next/server";

const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute window
  uniqueTokenPerInterval: 500, // max unique tokens (IPs) per window
});

const MAX_REQUESTS_PER_MINUTE = 20;

export function middleware(request: NextRequest) {
  try {
    const headers = limiter.checkNext(request, MAX_REQUESTS_PER_MINUTE);
    const response = NextResponse.next();
    headers.forEach((value, key) => response.headers.set(key, value));
    return response;
  } catch {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many requests" },
      { status: 429 }
    );
  }
}

export const config = {
  matcher: "/api/:path*",
};
