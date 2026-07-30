export const config = {
  matcher: "/api/index",
};

export default function middleware(request: Request): Response | undefined {
  const method = request.method.toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    return new Response(
      JSON.stringify({
        error: "Legacy generic mutation endpoint is disabled. Use the authenticated canonical API route.",
      }),
      {
        status: 404,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }
  return undefined;
}
