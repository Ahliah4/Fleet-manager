import { assertAuthConfigured, auth } from "@/lib/auth/server";

const handlers = auth.handler();
type RouteContext = { params: Promise<{ path: string[] }> };

export const GET = (request: Request, context: RouteContext) => {
  assertAuthConfigured();
  return handlers.GET(request, context);
};
export const POST = (request: Request, context: RouteContext) => {
  assertAuthConfigured();
  return handlers.POST(request, context);
};
export const PUT = (request: Request, context: RouteContext) => {
  assertAuthConfigured();
  return handlers.PUT(request, context);
};
export const PATCH = (request: Request, context: RouteContext) => {
  assertAuthConfigured();
  return handlers.PATCH(request, context);
};
export const DELETE = (request: Request, context: RouteContext) => {
  assertAuthConfigured();
  return handlers.DELETE(request, context);
};
