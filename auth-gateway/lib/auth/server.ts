import { createNeonAuth } from "@neon/auth/next/server";

const baseUrl = process.env.NEON_AUTH_BASE_URL;
const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET;

// These placeholders make `next build` possible without a local secrets file.
// Every real request is rejected by `assertAuthConfigured` until both values
// are supplied through the ignored `.env.local` file.
const placeholderBaseUrl = "https://auth-not-configured.invalid/neondb/auth";
const placeholderSecret = "development-only-placeholder-secret-not-for-use";

export const auth = createNeonAuth({
  baseUrl: baseUrl ?? placeholderBaseUrl,
  cookies: { secret: cookieSecret ?? placeholderSecret },
  // Provider details and credentials must never be printed by this service.
  logLevel: "silent",
});

export function assertAuthConfigured(): void {
  if (!baseUrl || !cookieSecret) {
    throw new Error("Authentication is not configured for this environment.");
  }
}
