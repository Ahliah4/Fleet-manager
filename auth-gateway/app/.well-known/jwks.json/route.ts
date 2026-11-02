import { publicJwks } from "@/lib/mobile-flow";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    return Response.json(await publicJwks(), {
      headers: { "cache-control": "public, max-age=300" },
    });
  } catch {
    return Response.json({ error: "not_configured" }, { status: 503 });
  }
}
