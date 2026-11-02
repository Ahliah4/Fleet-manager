import { exchangeCode } from "@/lib/mobile-flow";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { code?: unknown; code_verifier?: unknown };
    if (typeof body.code !== "string" || typeof body.code_verifier !== "string") {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }
    return Response.json(await exchangeCode({ code: body.code, verifier: body.code_verifier }));
  } catch {
    return Response.json({ error: "invalid_grant" }, { status: 400 });
  }
}
