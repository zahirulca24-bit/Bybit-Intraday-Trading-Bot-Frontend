export const config = {
  matcher: "/api/:path*",
};

const ALLOWED_MUTATION_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/logout",
  "/api/bot/toggle",
]);

export default function middleware(request: Request): Response | undefined {
  const method = request.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return undefined;

  const pathname = new URL(request.url).pathname;
  if (ALLOWED_MUTATION_PATHS.has(pathname)) return undefined;

  return new Response(
    JSON.stringify({
      error: "Legacy generic mutation endpoint is disabled. Use an authenticated canonical API route.",
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
