import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: ["/api/index"],
};

export function middleware(request: NextRequest): NextResponse {
  const method = request.method.toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    return NextResponse.json(
      { error: "Legacy generic mutation endpoint is disabled. Use the authenticated canonical API route." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.next();
}
