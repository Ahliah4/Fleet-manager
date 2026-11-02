import { env } from "cloudflare:workers";

import type {
  ConsumedCode,
  IssuedCode,
  MobileFlowStore,
  RefreshToken,
  RotateResult,
} from "./mobile-store";

type DurableObjectStub = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

type DurableObjectNamespace = {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStub;
};

function namespace(): DurableObjectNamespace {
  const binding = env.MOBILE_AUTH_FLOW as DurableObjectNamespace | undefined;
  if (!binding) throw new Error("Mobile authentication storage is not configured.");
  return binding;
}

async function call<T>(
  shard: string,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const binding = namespace();
  const stub = binding.get(binding.idFromName(shard));
  const response = await stub.fetch(`https://mobile-auth.internal${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error("Mobile authentication storage is unavailable.");
  }
  return (await response.json()) as T;
}

export function createCloudflareMobileFlowStore(): MobileFlowStore {
  return {
    async insertCode(record: IssuedCode) {
      await call(`code:${record.codeHash}`, "/code/insert", record);
    },
    consumeCode(codeHash, challenge, now) {
      return call<ConsumedCode | null>(`code:${codeHash}`, "/code/consume", {
        codeHash,
        challenge,
        now,
      });
    },
    async insertRefreshToken(record: RefreshToken) {
      await call(`refresh:${record.familyId}`, "/refresh/insert", record);
    },
    rotateRefreshToken(currentHash, familyId, next, now) {
      return call<RotateResult>(`refresh:${familyId}`, "/refresh/rotate", {
        currentHash,
        familyId,
        nextHash: next.tokenHash,
        nextExpiresAt: next.expiresAt,
        now,
      });
    },
    async revokeRefreshToken(tokenHash, familyId, now) {
      await call(`refresh:${familyId}`, "/refresh/revoke", {
        tokenHash,
        familyId,
        now,
      });
    },
    async cleanup() {
      // Each object owns an expiry alarm. There is no global scan or shared
      // object, which keeps the Durable Object design horizontally scalable.
    },
  };
}
