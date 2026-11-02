const AUTH_GATEWAY_URL = "https://auth-gateway.ip-motors-fleet.workers.dev";
const REDIRECT_URI = "https://fleet-manager-indol.vercel.app/";
const VERIFIER_KEY = "fleet_web_pkce_verifier";
const STATE_KEY = "fleet_web_oauth_state";
let completionPromise;

function base64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomValue(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function challengeFor(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export async function startGatewaySignIn(authPath = "/auth/sign-in") {
  const verifier = randomValue();
  const state = randomValue();
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  const url = new URL("/mobile/start", AUTH_GATEWAY_URL);
  url.searchParams.set("code_challenge", await challengeFor(verifier));
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("auth_path", authPath);
  window.location.assign(url);
}

async function completeGatewaySignInOnce() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  if (!code && !returnedState) return null;

  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  const expectedState = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  history.replaceState({}, document.title, `${url.pathname}${url.hash}`);
  if (!code || !verifier || !returnedState || returnedState !== expectedState) {
    throw new Error("The sign-in response could not be verified. Please try again.");
  }

  const response = await fetch(`${AUTH_GATEWAY_URL}/mobile/exchange`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, code_verifier: verifier }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.accessToken) {
    throw new Error("Sign-in expired before it could finish. Please try again.");
  }

  // The web build keeps only the ten-minute access token in memory. It does not
  // persist a refresh token in browser storage.
  if (payload.refreshToken) {
    void fetch(`${AUTH_GATEWAY_URL}/mobile/revoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refresh_token: payload.refreshToken }),
    }).catch(() => undefined);
  }
  return payload.accessToken;
}

export function completeGatewaySignIn() {
  completionPromise ??= completeGatewaySignInOnce();
  return completionPromise;
}

