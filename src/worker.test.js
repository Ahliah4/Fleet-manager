import { describe, expect, it } from "vitest";
import { handleRequest, parseCookies } from "./worker";

const env = {
  ASSETS: {
    fetch: async () => new Response("asset", { status: 200 }),
  },
};

describe("Fleet PWA worker", () => {
  it("parses cookies without exposing them to the app", () => {
    expect(parseCookies("one=first; two=second.value")).toEqual({ one: "first", two: "second.value" });
  });

  it("starts a PKCE sign-in with the exact PWA callback", async () => {
    const response = await handleRequest(new Request("https://fleet-manager.ip-motors-fleet.workers.dev/auth/start"), env);
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location"));
    expect(location.origin).toBe("https://auth-gateway.ip-motors-fleet.workers.dev");
    expect(location.pathname).toBe("/mobile/start");
    expect(location.searchParams.get("redirect_uri")).toBe("https://fleet-manager.ip-motors-fleet.workers.dev/auth/callback");
    expect(location.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("blocks cross-site writes before proxying", async () => {
    const response = await handleRequest(new Request("https://fleet-manager.ip-motors-fleet.workers.dev/api/v1/vehicles", {
      method: "POST",
      headers: { origin: "https://attacker.example", "sec-fetch-site": "cross-site" },
      body: "{}",
    }), env);
    expect(response.status).toBe(403);
  });

  it("proxies API calls through the FLEET_API service binding", async () => {
    let seen;
    const boundEnv = {
      ...env,
      FLEET_API: {
        fetch: async (request) => {
          seen = new URL(request.url);
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        },
      },
    };
    const response = await handleRequest(new Request("https://fleet-manager.ip-motors-fleet.workers.dev/api/v1/vehicles?limit=5", {
      headers: { cookie: "__Host-fleet_access=test-token" },
    }), boundEnv);
    expect(response.status).toBe(200);
    expect(seen.origin).toBe("https://ip-motors-fleet-api-development.ip-motors-fleet.workers.dev");
    expect(seen.pathname).toBe("/v1/vehicles");
    expect(seen.search).toBe("?limit=5");
  });

  it("returns a signed-out response without a session", async () => {
    const response = await handleRequest(new Request("https://fleet-manager.ip-motors-fleet.workers.dev/api/v1/me"), env);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  });

  it("serves non-API requests from static assets", async () => {
    const response = await handleRequest(new Request("https://fleet-manager.ip-motors-fleet.workers.dev/vehicles"), env);
    expect(await response.text()).toBe("asset");
  });
});
