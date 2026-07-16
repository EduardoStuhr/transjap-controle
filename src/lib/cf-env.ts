type EnvStore = {
  run<T>(store: Record<string, unknown>, fn: () => Promise<T>): Promise<T>;
  getStore(): Record<string, unknown> | undefined;
};

let cfEnvStorage: EnvStore | undefined;
let fallbackEnv: Record<string, unknown> | undefined;

async function getCfEnvStorage() {
  if (cfEnvStorage || typeof window !== "undefined") return cfEnvStorage;

  const { AsyncLocalStorage } = await import("node:async_hooks");
  cfEnvStorage = new AsyncLocalStorage<Record<string, unknown>>();
  return cfEnvStorage;
}

export async function runWithCfEnv<T>(env: unknown, fn: () => Promise<T>): Promise<T> {
  const storage = await getCfEnvStorage();
  const nextEnv = env as Record<string, unknown>;
  if (storage) return storage.run(nextEnv, fn);

  const previous = fallbackEnv;
  fallbackEnv = nextEnv;
  try {
    return await fn();
  } finally {
    fallbackEnv = previous;
  }
}

export function getD1(): D1Database {
  const db = getOptionalD1();
  if (db) return db;

  throw new Error(
    "D1 binding 'DB' não disponível. " +
      "Em dev: use 'wrangler dev'; em prod: verifique wrangler.jsonc e o binding name.",
  );
}

export function getOptionalD1(): D1Database | undefined {
  const env = cfEnvStorage?.getStore() ?? fallbackEnv;
  return env?.DB as D1Database | undefined;
}

export function getOptionalEnvString(name: string): string | undefined {
  const envValue = (cfEnvStorage?.getStore() ?? fallbackEnv)?.[name];
  if (typeof envValue === "string" && envValue.trim()) return envValue.trim();

  const processValue = typeof process !== "undefined" ? process.env[name] : undefined;
  return processValue && processValue.trim() ? processValue.trim() : undefined;
}
