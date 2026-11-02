import { exchangeCode } from "@/lib/mobile-flow";
import { mobileCorsHeaders, mobilePreflight } from "@/lib/mobile-cors";

export const runtime = "nodejs";

export async function OPTIONS(request: Request): Promise<Response> {
  return mobilePreflight(request);
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { code?: unknown; code_verifier?: unknown };
    if (typeof body.code !== "string" || typeof body.code_verifier !== "string") {
      return Response.json(
        { error: "invalid_request" },
        { status: 400, headers: mobileCorsHeaders(request) },
      );
    }
    return Response.json(
      await exchangeCode({ code: body.code, verifier: body.code_verifier }),
      { headers: mobileCorsHeaders(request) },
    );
  } catch {
    return Response.json(
      { error: "invalid_grant" },
      { status: 400, headers: mobileCorsHeaders(request) },
    );
  }
}
