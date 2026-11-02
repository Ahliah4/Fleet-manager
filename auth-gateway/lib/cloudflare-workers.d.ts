declare module "cloudflare:workers" {
  export class DurableObject<Env = unknown> {
    constructor(ctx: unknown, env: Env);
  }

  export const env: Record<string, unknown>;
}
