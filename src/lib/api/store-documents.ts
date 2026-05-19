import { getOptionalD1 } from "@/lib/cf-env";

type StoreDocumentRow = {
  id: string;
  payload: string;
  created_at: string;
  updated_at: string;
};

type LocalDocument = {
  id: string;
  payload: unknown;
  createdAt: string;
  updatedAt: string;
};

const localDocuments = new Map<string, Map<string, LocalDocument>>();

function nowIso() {
  return new Date().toISOString();
}

function getModuleDocuments(module: string) {
  let documents = localDocuments.get(module);
  if (!documents) {
    documents = new Map();
    localDocuments.set(module, documents);
  }
  return documents;
}

function getStoreD1() {
  const d1 = getOptionalD1();
  if (d1 || import.meta.env.DEV) return d1;

  throw new Error(
    "D1 binding 'DB' não disponível. Verifique wrangler.jsonc e o binding name em produção.",
  );
}

async function ensureStoreDocumentsTable(d1: D1Database) {
  await d1
    .prepare(
      `CREATE TABLE IF NOT EXISTS store_documents (
        module TEXT NOT NULL,
        id TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (module, id)
      )`,
    )
    .run();
}

function parsePayload<T>(row: StoreDocumentRow): T | null {
  try {
    return JSON.parse(row.payload) as T;
  } catch {
    return null;
  }
}

export async function listStoreDocuments<T>(module: string): Promise<T[]> {
  const d1 = getStoreD1();
  if (!d1) {
    return Array.from(getModuleDocuments(module).values())
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((document) => document.payload as T);
  }

  await ensureStoreDocumentsTable(d1);
  const result = await d1
    .prepare(
      `SELECT id, payload, created_at, updated_at
       FROM store_documents
       WHERE module = ?
       ORDER BY updated_at DESC`,
    )
    .bind(module)
    .all<StoreDocumentRow>();

  return (result.results ?? [])
    .map((row) => parsePayload<T>(row))
    .filter((payload): payload is T => payload !== null);
}

export async function upsertStoreDocument<T>(module: string, id: string, payload: T): Promise<T> {
  const d1 = getStoreD1();
  const timestamp = nowIso();

  if (!d1) {
    const documents = getModuleDocuments(module);
    documents.set(id, {
      id,
      payload,
      createdAt: documents.get(id)?.createdAt ?? timestamp,
      updatedAt: timestamp,
    });
    return payload;
  }

  await ensureStoreDocumentsTable(d1);
  await d1
    .prepare(
      `INSERT INTO store_documents (module, id, payload, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(module, id) DO UPDATE SET
         payload = excluded.payload,
         updated_at = excluded.updated_at`,
    )
    .bind(module, id, JSON.stringify(payload), timestamp, timestamp)
    .run();

  return payload;
}

export async function deleteStoreDocument(module: string, id: string): Promise<{ ok: true }> {
  const d1 = getStoreD1();
  if (!d1) {
    getModuleDocuments(module).delete(id);
    return { ok: true };
  }

  await ensureStoreDocumentsTable(d1);
  await d1
    .prepare("DELETE FROM store_documents WHERE module = ? AND id = ?")
    .bind(module, id)
    .run();

  return { ok: true };
}
