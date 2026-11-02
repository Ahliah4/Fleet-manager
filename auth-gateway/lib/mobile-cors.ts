const WEB_APP_ORIGIN = "https://fleet-manager-indol.vercel.app";

export function mobileCorsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  return {
    ...(origin === WEB_APP_ORIGIN
      ? { "Access-Control-Allow-Origin": WEB_APP_ORIGIN }
      : {}),
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function mobilePreflight(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: mobileCorsHeaders(request),
  });
}
