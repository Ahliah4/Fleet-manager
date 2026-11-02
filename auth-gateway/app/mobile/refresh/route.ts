import { rotateRefreshToken } from "@/lib/mobile-flow";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { refresh_token?: unknown };
    if (typeof body.refresh_token !== "string") {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }
    return Response.json(await rotateRefreshToken(body.refresh_token));
  } catch {
    return Response.json({ error: "invalid_grant" }, { status: 401 });
  }
}
