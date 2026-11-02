import { revokeRefreshToken } from "@/lib/mobile-flow";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { refresh_token?: unknown };
    if (typeof body.refresh_token === "string") revokeRefreshToken(body.refresh_token);
  } catch {
    // Logout is idempotent and must not expose provider details.
  }
  return new Response(null, { status: 204 });
}
