export const FIELD_OPERATOR_NAME = "Operador de Campo";
export const OPERATOR_HOROMETRO_ENDPOINT = "/api/operador/horometros";

export type OperatorHorometroRequest = {
  fleet: string;
  horometroValue: number;
  photoUrl: string;
  ocrConfidence: number;
  rawOcrText: string;
  operatorName: typeof FIELD_OPERATOR_NAME;
};

export type OperatorHorometroSuccess = {
  ok: true;
  logId: string;
  createdAt: string;
};

type OperatorHorometroFailure = {
  ok: false;
  code?: string;
  message?: string;
};

export type OperatorHorometroErrorKind =
  | "network"
  | "validation"
  | "api"
  | "d1";

export class OperatorHorometroApiError extends Error {
  constructor(
    public readonly kind: OperatorHorometroErrorKind,
    public readonly code: string,
    public readonly status?: number,
    options?: ErrorOptions,
  ) {
    super("Nao foi possivel registrar o horometro.", options);
    this.name = "OperatorHorometroApiError";
  }
}

function classifyApiError(status: number, code: string): OperatorHorometroErrorKind {
  if (code === "D1_ERROR" || code === "D1_BINDING_UNAVAILABLE") return "d1";
  if (
    status === 400 ||
    status === 404 ||
    status === 413 ||
    status === 415 ||
    code === "VALIDATION_ERROR"
  ) {
    return "validation";
  }
  return "api";
}

function isOperatorHorometroPayload(
  value: unknown,
): value is OperatorHorometroSuccess | OperatorHorometroFailure {
  return Boolean(value && typeof value === "object" && "ok" in value);
}

export async function submitOperatorHorometro(
  input: OperatorHorometroRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<OperatorHorometroSuccess> {
  let response: Response;
  try {
    response = await fetchImpl(OPERATOR_HOROMETRO_ENDPOINT, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
    });
  } catch (cause) {
    throw new OperatorHorometroApiError("network", "NETWORK_ERROR", undefined, { cause });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (cause) {
    throw new OperatorHorometroApiError("api", "INVALID_API_RESPONSE", response.status, {
      cause,
    });
  }

  if (!isOperatorHorometroPayload(payload)) {
    throw new OperatorHorometroApiError("api", "INVALID_API_RESPONSE", response.status);
  }

  if (!response.ok || payload.ok !== true) {
    const code = payload.ok === false && payload.code ? payload.code : "API_ERROR";
    throw new OperatorHorometroApiError(
      classifyApiError(response.status, code),
      code,
      response.status,
    );
  }

  if (!payload.logId || !payload.createdAt) {
    throw new OperatorHorometroApiError("api", "INVALID_API_RESPONSE", response.status);
  }

  return payload;
}
