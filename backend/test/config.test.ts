import { describe, expect, it } from "vitest";
import {
  ConfigurationError,
  describeDatabaseTarget,
  loadConfig,
} from "../src/config.js";

const databaseUrl = "postgresql://app_rw:placeholder@db.example.test:5432/fleet";

describe("loadConfig", () => {
  it("fails closed with no auth configuration", () => {
    const config = loadConfig({ DATABASE_URL: databaseUrl });
    expect(config.auth).toBeNull();
    expect(config.database.expectedRole).toBe("app_rw");
    expect(config.database.ssl).toBe(true);
  });

  it("rejects a partially configured identity provider", () => {
    expect(() =>
      loadConfig({
        DATABASE_URL: databaseUrl,
        AUTH_ISSUER: "https://id.example.test",
        AUTH_AUDIENCE: "fleet-api",
      }),
    ).toThrow(ConfigurationError);
    expect(() =>
      loadConfig({
        DATABASE_URL: databaseUrl,
        AUTH_ISSUER: "https://id.example.test",
        AUTH_AUDIENCE: "fleet-api",
      }),
    ).toThrow(/must be set together/i);
  });

  it("accepts a complete auth configuration", () => {
    const config = loadConfig({
      DATABASE_URL: databaseUrl,
      NODE_ENV: "test",
      AUTH_ISSUER: "https://id.example.test/",
      AUTH_AUDIENCE: "fleet-api",
      AUTH_JWKS_URL: "https://id.example.test/.well-known/jwks.json",
    });
    expect(config.auth).toEqual({
      issuer: "https://id.example.test/",
      audience: "fleet-api",
      jwksUrl: "https://id.example.test/.well-known/jwks.json",
      clockToleranceSeconds: 30,
    });
  });

  it("allows local http only outside production", () => {
    expect(() =>
      loadConfig({
        DATABASE_URL: databaseUrl,
        NODE_ENV: "development",
        AUTH_ISSUER: "http://localhost:8080",
        AUTH_AUDIENCE: "fleet-api",
        AUTH_JWKS_URL: "http://localhost:8080/jwks",
      }),
    ).not.toThrow();

    expect(() =>
      loadConfig({
        DATABASE_URL: databaseUrl,
        NODE_ENV: "production",
        AUTH_ISSUER: "http://localhost:8080",
        AUTH_AUDIENCE: "fleet-api",
        AUTH_JWKS_URL: "http://localhost:8080/jwks",
      }),
    ).toThrow(/must use https/i);
  });

  it("requires a PostgreSQL URL", () => {
    expect(() => loadConfig({ DATABASE_URL: "not-a-url" })).toThrow(
      /valid PostgreSQL URL/i,
    );
    expect(() =>
      loadConfig({ DATABASE_URL: "https://db.example.test/fleet" }),
    ).toThrow(/postgres/i);
  });
});

describe("describeDatabaseTarget", () => {
  it("does not expose credentials", () => {
    const target = describeDatabaseTarget(databaseUrl);
    expect(target).toBe("db.example.test:5432/fleet");
    expect(target).not.toContain("placeholder");
    expect(target).not.toContain("app_rw");
  });
});
