import { NextResponse } from "next/server";
import { assertMobileFlowStorageConfigured, assertRedirectUriAllowed, createFlowCookie, mobileFlowCookieName } from "@/lib/mobile-flow";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    assertMobileFlowStorageConfigured();
    const challenge = url.searchParams.get("code_challenge") ?? "";
    const state = url.searchParams.get("state") ?? "";
    const redirectUri = url.searchParams.get("redirect_uri") ?? "";
    const authPath = url.searchParams.get("auth_path") ?? "/auth/sign-in";
    if (!/^[A-Za-z0-9_-]{43}$/.test(challenge) || state.length < 16 || state.length > 256) {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }
    if (authPath !== "/auth/sign-in" && authPath !== "/auth/sign-up") {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }
    assertRedirectUriAllowed(redirectUri);
    const cookie = await createFlowCookie({ challenge, state, redirectUri, authPath });
    const signIn = new URL(authPath, url.origin);
    signIn.searchParams.set("returnTo", "/mobile/authorize");
    const response = NextResponse.redirect(signIn);
    response.cookies.set(mobileFlowCookieName, cookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });
    return response;
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
}
