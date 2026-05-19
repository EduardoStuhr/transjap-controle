import { AsyncLocalStorage } from "node:async_hooks";

const cfEnvStorage = new AsyncLocalStorage<Record<string, unknown>>();

export async function runWithCfEnv<T>(env: unknown, fn: () => Promise<T>): Promise<T> {
  return cfEnvStorage.run(env as Record<string, unknown>, fn);
}

export function getD1(): D1Database {
  const env = cfEnvStorage.getStore();
  const db = env?.DB as D1Database | undefined;
  if (!db) {
    throw new Error(
      "D1 binding 'DB' não disponível. " +
        "Em dev: use 'wrangler dev'; em prod: verifique wrangler.jsonc e o binding name.",
    );
  }
  return db;
}
