import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { getOptionalD1, runWithCfEnv } from "./lib/cf-env";
import { saveFleetLocation } from "./lib/api/equipment";
import { normalizeFleetId } from "./lib/operational-options";
import {
  OperatorEquipmentNotFoundError,
  persistOperatorHorometro,
  type ValidatedOperatorHorometroInput,
} from "./lib/api/operator-horometro.server";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

const OPERATOR_HOROMETRO_PATH = "/api/operador/horometros";
const MAX_OPERATOR_REQUEST_BYTES = 1_900_000;
const MAX_OPERATOR_PHOTO_LENGTH = 1_750_000;
const MAX_RAW_OCR_LENGTH = 10_000;

class OperatorHorometroValidationError extends Error {
  constructor(
    public readonly field: string,
    public readonly status = 400,
    public readonly code = "VALIDATION_ERROR",
  ) {
    super(`Invalid operator horometro field: ${field}`);
    this.name = "OperatorHorometroValidationError";
  }
}

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function jsonResponse(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers ?? {}),
    },
  });
}

function safeTechnicalMessage(value: unknown): string {
  return String(value ?? "")
    .replace(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\r\n]+/gi, "[imagem removida]")
    .replace(/[a-z0-9+/]{128,}={0,2}/gi, "[conteudo longo removido]")
    .slice(0, 1_200);
}

function safeErrorSummary(error: unknown): { name: string; messages: string[] } {
  const messages: string[] = [];
  let current: unknown = error;
  let name = "Error";

  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (current instanceof Error) {
      if (depth === 0) name = current.name || name;
      const message = safeTechnicalMessage(current.message);
      if (message && !messages.includes(message)) messages.push(message);
      current = current.cause;
      continue;
    }

    if (typeof current === "object" && "message" in current) {
      const record = current as { message?: unknown; cause?: unknown };
      const message = safeTechnicalMessage(record.message);
      if (message && !messages.includes(message)) messages.push(message);
      current = record.cause;
      continue;
    }

    const message = safeTechnicalMessage(current);
    if (message && !messages.includes(message)) messages.push(message);
    break;
  }

  return { name, messages };
}

function operatorRequestId(request: Request): string {
  return request.headers.get("cf-ray") || crypto.randomUUID();
}

function isSupportedPhotoUrl(value: string): boolean {
  if (/^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(value)) {
    return value.indexOf(",") < value.length - 1;
  }

  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function validateOperatorHorometroBody(body: unknown): ValidatedOperatorHorometroInput {
  if (!body || Array.isArray(body) || typeof body !== "object") {
    throw new OperatorHorometroValidationError("body");
  }

  const input = body as Record<string, unknown>;
  if (typeof input.fleet !== "string" || input.fleet.length > 32) {
    throw new OperatorHorometroValidationError("fleet");
  }
  const fleet = normalizeFleetId(input.fleet);
  if (!/^FR-[A-Z0-9]{1,16}$/.test(fleet)) {
    throw new OperatorHorometroValidationError("fleet");
  }

  if (
    typeof input.horometroValue !== "number" ||
    !Number.isFinite(input.horometroValue) ||
    input.horometroValue <= 0 ||
    input.horometroValue > 10_000_000
  ) {
    throw new OperatorHorometroValidationError("horometroValue");
  }

  const photoCandidate =
    typeof input.photoUrl === "string"
      ? input.photoUrl
      : typeof input.image === "string"
        ? input.image
        : "";
  if (!photoCandidate || photoCandidate.length > MAX_OPERATOR_PHOTO_LENGTH) {
    throw new OperatorHorometroValidationError(
      "photoUrl",
      photoCandidate.length > MAX_OPERATOR_PHOTO_LENGTH ? 413 : 400,
      photoCandidate.length > MAX_OPERATOR_PHOTO_LENGTH
        ? "PHOTO_TOO_LARGE"
        : "VALIDATION_ERROR",
    );
  }
  if (!isSupportedPhotoUrl(photoCandidate)) {
    throw new OperatorHorometroValidationError("photoUrl");
  }

  if (
    typeof input.ocrConfidence !== "number" ||
    !Number.isFinite(input.ocrConfidence) ||
    input.ocrConfidence < 0 ||
    input.ocrConfidence > 1
  ) {
    throw new OperatorHorometroValidationError("ocrConfidence");
  }

  if (input.rawOcrText !== undefined && typeof input.rawOcrText !== "string") {
    throw new OperatorHorometroValidationError("rawOcrText");
  }
  const rawOcrText = (input.rawOcrText as string | undefined)?.trim() || "";
  if (rawOcrText.length > MAX_RAW_OCR_LENGTH) {
    throw new OperatorHorometroValidationError("rawOcrText");
  }

  return {
    fleet,
    horometroValue: input.horometroValue,
    photoUrl: photoCandidate,
    ocrConfidence: input.ocrConfidence,
    rawOcrText,
  };
}

async function handleOperatorHorometro(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== OPERATOR_HOROMETRO_PATH) return null;

  if (request.method !== "POST") {
    return jsonResponse(
      { ok: false, code: "METHOD_NOT_ALLOWED", message: "Metodo nao permitido." },
      { status: 405, headers: { allow: "POST" } },
    );
  }

  const requestId = operatorRequestId(request);
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_OPERATOR_REQUEST_BYTES) {
    console.warn("[operador.horometro] validation_error", {
      requestId,
      field: "body",
      code: "PAYLOAD_TOO_LARGE",
      contentLength,
    });
    return jsonResponse(
      { ok: false, code: "PAYLOAD_TOO_LARGE", message: "Foto muito grande para envio." },
      { status: 413 },
    );
  }

  if (!request.headers.get("content-type")?.includes("application/json")) {
    return jsonResponse(
      { ok: false, code: "VALIDATION_ERROR", message: "Dados de envio invalidos." },
      { status: 415 },
    );
  }

  let input: ValidatedOperatorHorometroInput;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_OPERATOR_REQUEST_BYTES) {
      throw new OperatorHorometroValidationError("body", 413, "PAYLOAD_TOO_LARGE");
    }
    input = validateOperatorHorometroBody(JSON.parse(rawBody) as unknown);
  } catch (error) {
    const validationError =
      error instanceof OperatorHorometroValidationError
        ? error
        : new OperatorHorometroValidationError("body");
    console.warn("[operador.horometro] validation_error", {
      requestId,
      field: validationError.field,
      code: validationError.code,
    });
    return jsonResponse(
      {
        ok: false,
        code: validationError.code,
        message:
          validationError.status === 413
            ? "Foto muito grande para envio."
            : "Confira os dados e tente novamente.",
      },
      { status: validationError.status },
    );
  }

  const d1 = getOptionalD1();
  if (!d1) {
    console.error("[operador.horometro] d1_binding_error", {
      requestId,
      fleet: input.fleet,
      cause: "Binding DB ausente no ambiente do Worker.",
    });
    return jsonResponse(
      {
        ok: false,
        code: "D1_BINDING_UNAVAILABLE",
        message: "Servico temporariamente indisponivel. Tente novamente.",
      },
      { status: 503 },
    );
  }

  try {
    const result = await persistOperatorHorometro(d1, input);
    console.info("[operador.horometro] persisted", {
      requestId,
      logId: result.logId,
      fleet: input.fleet,
      horometroValue: input.horometroValue,
      photoLength: input.photoUrl.length,
      rawOcrLength: input.rawOcrText.length,
    });
    return jsonResponse({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    if (error instanceof OperatorEquipmentNotFoundError) {
      console.warn("[operador.horometro] validation_error", {
        requestId,
        field: "fleet",
        code: "EQUIPMENT_NOT_FOUND",
        fleet: error.fleet,
      });
      return jsonResponse(
        {
          ok: false,
          code: "EQUIPMENT_NOT_FOUND",
          message: "Frota nao encontrada. Confira e tente novamente.",
        },
        { status: 404 },
      );
    }

    console.error("[operador.horometro] d1_error", {
      requestId,
      fleet: input.fleet,
      error: safeErrorSummary(error),
    });
    return jsonResponse(
      {
        ok: false,
        code: "D1_ERROR",
        message: "Nao foi possivel registrar agora. Tente novamente.",
      },
      { status: 503 },
    );
  }
}

async function handleFleetLocationPatch(request: Request): Promise<Response | null> {
  if (request.method !== "PATCH") return null;

  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/frotas\/([^/]+)\/localizacao$/);
  if (!match) return null;

  let body: { obraAtual?: string; status?: "Operação" | "Manutenção" | "Parado" };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonResponse({ error: "Body JSON invalido." }, { status: 400 });
  }

  try {
    const equipment = await saveFleetLocation({
      id: decodeURIComponent(match[1]),
      obraAtual: body.obraAtual ?? "",
      status: body.status ?? "Operação",
    });
    return jsonResponse(equipment);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Nao foi possivel atualizar." },
      { status: 400 },
    );
  }
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    return runWithCfEnv(env, async () => {
      try {
        const operatorHorometroResponse = await handleOperatorHorometro(request);
        if (operatorHorometroResponse) return operatorHorometroResponse;

        const apiResponse = await handleFleetLocationPatch(request);
        if (apiResponse) return apiResponse;

        const handler = await getServerEntry();
        const response = await handler.fetch(request, env, ctx);
        return await normalizeCatastrophicSsrResponse(response);
      } catch (error) {
        console.error(error);
        return brandedErrorResponse();
      }
    });
  },
};
