"use client";

import { createAuthClient } from "@neon/auth/next";

// Construct the browser SDK only in response to a browser action. Cloudflare
// Workers reject SDK initialization at module-global scope when it performs
// asynchronous I/O, schedules timers, or generates random values during SSR.
export function getAuthClient() {
  if (typeof window === "undefined") {
    throw new Error("The authentication client is only available in the browser.");
  }
  return createAuthClient();
}
