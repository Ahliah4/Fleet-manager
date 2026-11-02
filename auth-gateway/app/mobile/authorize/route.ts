import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { assertAuthConfigured, auth } from "@/lib/auth/server";
import { issueCode, mobileFlowCookieName, readFlowCookie } from "@/lib/mobile-flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    assertAuthConfigured();
    const flow = await readFlowCookie((await cookies()).get(mobileFlowCookieName)?.value);
    const { data: session } = await auth.getSession();
    if (!session?.user) {
      const signIn = new URL("/auth/sign-in", request.url);
      signIn.pathname = flow.authPath;
      signIn.searchParams.set("returnTo", "/mobile/authorize");
      return NextResponse.redirect(signIn);
    }
    const code = await issueCode({
      challenge: flow.challenge,
      subject: session.user.id,
      email: session.user.email,
      name: session.user.name ?? "",
    });
    const callback = new URL(flow.redirectUri);
    callback.searchParams.set("code", code);
    callback.searchParams.set("state", flow.state);
    const response = NextResponse.redirect(callback);
    response.cookies.delete(mobileFlowCookieName);
    return response;
  } catch {
    return Response.json({ error: "mobile_authorization_failed" }, { status: 400 });
  }
}
