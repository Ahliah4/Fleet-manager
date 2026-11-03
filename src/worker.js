const AUTH_GATEWAY_URL = "https://auth-gateway.ip-motors-fleet.workers.dev";
const FLEET_API_URL = "https://ip-motors-fleet-api-development.ip-motors-fleet.workers.dev";

const FLOW_COOKIE = "fleet_web_flow";
const ACCESS_COOKIE = "__Host-fleet_access";
const REFRESH_COOKIE = "__Host-fleet_refresh";
const FLOW_MAX_AGE = 10 * 60;
const REFRESH_MAX_AGE = 30 * 24 * 60 * 60;

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomValue() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function pkceChallenge(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

// Workers on the same workers.dev zone cannot fetch each other's public URLs
// (Cloudflare error 1042). Route upstream calls through service bindings when
// they are available, falling back to fetch for local tooling and tests.
function upstreamFetch(env, binding, url, init) {
  return binding ? binding.fetch(new Request(url, init)) : fetch(url, init);
}

export function parseCookies(header = "") {
  const values = {};
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    values[part.slice(0, separator).trim()] = part.slice(separator + 1).trim();
  }
  return values;
}

function cookie(name, value, options = {}) {
  const parts = [`${name}=${value}`, `Path=${options.path ?? "/"}`, "Secure", "HttpOnly", `SameSite=${options.sameSite ?? "Strict"}`];
  if (typeof options.maxAge === "number") parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  return parts.join("; ");
}

function clearSessionCookies(headers) {
  headers.append("set-cookie", cookie(ACCESS_COOKIE, "", { maxAge: 0 }));
  headers.append("set-cookie", cookie(REFRESH_COOKIE, "", { maxAge: 0 }));
}

function setSessionCookies(headers, session) {
  headers.append("set-cookie", cookie(ACCESS_COOKIE, session.accessToken, { maxAge: Math.max(60, Number(session.expiresIn) - 30) }));
  headers.append("set-cookie", cookie(REFRESH_COOKIE, session.refreshToken, { maxAge: REFRESH_MAX_AGE }));
}

function redirect(location, cookies = []) {
  const headers = new Headers({ location, "cache-control": "no-store" });
  for (const value of cookies) headers.append("set-cookie", value);
  return new Response(null, { status: 302, headers });
}

async function startAuthentication(request) {
  const url = new URL(request.url);
  const verifier = randomValue();
  const state = randomValue();
  const callback = `${url.origin}/auth/callback`;
  const gateway = new URL("/mobile/start", AUTH_GATEWAY_URL);
  gateway.searchParams.set("code_challenge", await pkceChallenge(verifier));
  gateway.searchParams.set("state", state);
  gateway.searchParams.set("redirect_uri", callback);
  gateway.searchParams.set("auth_path", url.searchParams.get("mode") === "signup" ? "/auth/sign-up" : "/auth/sign-in");
  return redirect(gateway.toString(), [
    cookie(FLOW_COOKIE, `${verifier}.${state}`, { maxAge: FLOW_MAX_AGE, sameSite: "Lax" }),
  ]);
}

async function finishAuthentication(request, env) {
  const url = new URL(request.url);
  const [verifier, expectedState] = (parseCookies(request.headers.get("cookie") ?? "")[FLOW_COOKIE] ?? "").split(".");
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const clearFlow = cookie(FLOW_COOKIE, "", { maxAge: 0, sameSite: "Lax" });
  if (!verifier || !expectedState || !code || state !== expectedState) {
    return redirect("/?auth_error=invalid_response", [clearFlow]);
  }

  try {
    const response = await upstreamFetch(env, env.AUTH_GATEWAY, `${AUTH_GATEWAY_URL}/mobile/exchange`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, code_verifier: verifier }),
    });
    const session = await response.json();
    if (!response.ok || !session?.accessToken || !session?.refreshToken) {
      return redirect("/?auth_error=expired", [clearFlow]);
    }
    const headers = new Headers({ location: "/", "cache-control": "no-store" });
    headers.append("set-cookie", clearFlow);
    setSessionCookies(headers, session);
    return new Response(null, { status: 302, headers });
  } catch (error) {
    console.error(JSON.stringify({ message: "web auth exchange failed", error: error instanceof Error ? error.message : "UnknownError" }));
    return redirect("/?auth_error=unavailable", [clearFlow]);
  }
}

async function rotateSession(refreshToken, env) {
  if (!refreshToken) return null;
  const response = await upstreamFetch(env, env.AUTH_GATEWAY, `${AUTH_GATEWAY_URL}/mobile/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const session = await response.json().catch(() => null);
  return response.ok && session?.accessToken && session?.refreshToken ? session : null;
}

function sameOriginMutation(request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  return (!origin || origin === url.origin) && fetchSite !== "cross-site";
}

async function upstreamRequest(request, accessToken, env) {
  const incoming = new URL(request.url);
  const upstream = new URL(`${incoming.pathname.slice(4)}${incoming.search}`, FLEET_API_URL);
  const headers = new Headers(request.headers);
  for (const name of ["cookie", "host", "origin", "referer", "content-length"]) headers.delete(name);
  headers.set("authorization", `Bearer ${accessToken}`);
  headers.set("x-request-id", request.headers.get("x-request-id") ?? crypto.randomUUID());
  const init = { method: request.method, headers, redirect: "manual" };
  if (!(["GET", "HEAD"].includes(request.method))) init.body = request.body;
  return upstreamFetch(env, env.FLEET_API, upstream.toString(), init);
}

function copyUpstream(response, session, clearSession = false) {
  const headers = new Headers(response.headers);
  for (const name of ["access-control-allow-origin", "access-control-allow-credentials", "set-cookie"]) headers.delete(name);
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  if (clearSession) clearSessionCookies(headers);
  else if (session) setSessionCookies(headers, session);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function proxyApi(request, env) {
  if (!sameOriginMutation(request)) return Response.json({ error: { message: "Cross-site request blocked." } }, { status: 403 });
  const cookies = parseCookies(request.headers.get("cookie") ?? "");
  let accessToken = cookies[ACCESS_COOKIE];
  let refreshed = null;

  if (!accessToken) {
    refreshed = await rotateSession(cookies[REFRESH_COOKIE], env).catch(() => null);
    accessToken = refreshed?.accessToken;
  }
  if (!accessToken) {
    const headers = new Headers({ "cache-control": "no-store" });
    clearSessionCookies(headers);
    return Response.json({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } }, { status: 401, headers });
  }

  let response = await upstreamRequest(request, accessToken, env);
  if (response.status === 401 && !refreshed) {
    refreshed = await rotateSession(cookies[REFRESH_COOKIE], env).catch(() => null);
    if (refreshed) response = await upstreamRequest(request, refreshed.accessToken, env);
  }
  return copyUpstream(response, refreshed, response.status === 401);
}

async function signOut(request, env) {
  if (!sameOriginMutation(request)) return new Response(null, { status: 403 });
  const refreshToken = parseCookies(request.headers.get("cookie") ?? "")[REFRESH_COOKIE];
  if (refreshToken) {
    await upstreamFetch(env, env.AUTH_GATEWAY, `${AUTH_GATEWAY_URL}/mobile/revoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    }).catch(() => undefined);
  }
  const headers = new Headers({ "cache-control": "no-store" });
  clearSessionCookies(headers);
  return new Response(null, { status: 204, headers });
}

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/auth/start" && request.method === "GET") return startAuthentication(request);
  if (url.pathname === "/auth/callback" && request.method === "GET") return finishAuthentication(request, env);
  if (url.pathname === "/auth/logout" && request.method === "POST") return signOut(request, env);
  if (url.pathname.startsWith("/api/v1/")) return proxyApi(request, env);
  if (url.pathname.startsWith("/auth/") || url.pathname.startsWith("/api/")) return new Response("Not found", { status: 404 });
  return env.ASSETS.fetch(request);
}

export default { fetch: handleRequest };
