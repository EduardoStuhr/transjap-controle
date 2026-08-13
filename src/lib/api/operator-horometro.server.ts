import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { equipment, horometroLogs } from "@/db/schema";
import type { DbHorometroLogInsert } from "@/db/schema";
import { FIELD_OPERATOR_NAME } from "@/lib/api/operator-horometro";

export type ValidatedOperatorHorometroInput = {
  fleet: string;
  horometroValue: number;
  photoUrl: string;
  ocrConfidence: number;
  rawOcrText: string;
};

export type PersistedOperatorHorometro = {
  logId: string;
  createdAt: string;
};

export class OperatorEquipmentNotFoundError extends Error {
  constructor(public readonly fleet: string) {
    super("Equipment not found");
    this.name = "OperatorEquipmentNotFoundError";
  }
}

function saoPauloDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export async function persistOperatorHorometro(
  d1: D1Database,
  input: ValidatedOperatorHorometroInput,
): Promise<PersistedOperatorHorometro> {
  const db = getDb(d1);
  const linkedEquipment = await db
    .select()
    .from(equipment)
    .where(eq(equipment.id, input.fleet))
    .get();

  if (!linkedEquipment) {
    throw new OperatorEquipmentNotFoundError(input.fleet);
  }

  const lastApprovedLog = await db
    .select({ horometroValue: horometroLogs.horometroValue })
    .from(horometroLogs)
    .where(and(eq(horometroLogs.fleet, input.fleet), eq(horometroLogs.status, "aprovado")))
    .orderBy(desc(horometroLogs.createdAt))
    .limit(1)
    .get();

  const previousAcceptedHours = Math.max(
    Number(linkedEquipment.hours) || 0,
    Number(lastApprovedLog?.horometroValue) || 0,
  );
  const historyIsValid = input.horometroValue >= previousAcceptedHours;
  const confidenceIsValid = input.ocrConfidence >= 0.75;
  const jumpNeedsReview =
    previousAcceptedHours > 0 && input.horometroValue > previousAcceptedHours + 200;
  const status: DbHorometroLogInsert["status"] =
    historyIsValid && confidenceIsValid && !jumpNeedsReview ? "aprovado" : "pendente_revisao";

  const notes: string[] = [];
  if (!historyIsValid) {
    notes.push(
      `ALERTA HISTORICO: valor confirmado (${input.horometroValue}h) abaixo do ultimo aceito (${previousAcceptedHours}h).`,
    );
  }
  if (jumpNeedsReview) {
    notes.push(
      `ALERTA HISTORICO: salto de ${(input.horometroValue - previousAcceptedHours).toFixed(1)}h.`,
    );
  }
  if (!confidenceIsValid) {
    notes.push("OCR com baixa confianca; valor confirmado manualmente pelo operador.");
  }

  const now = new Date();
  const createdAt = now.toISOString();
  const logId = `hl-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const fleetNumber = input.fleet.replace(/\D/g, "") || input.fleet;
  const log: DbHorometroLogInsert = {
    id: logId,
    fleet: input.fleet,
    fleetLabel: `Frota ${fleetNumber}`,
    obra: linkedEquipment.location.trim(),
    horometroValue: input.horometroValue,
    type: "leitura",
    photoUrl: input.photoUrl,
    ocrConfidence: input.ocrConfidence,
    operatorName: FIELD_OPERATOR_NAME,
    operatorId: null,
    status,
    rawOcrText: input.rawOcrText || null,
    notes: notes.length > 0 ? notes.join(" ") : null,
    date: saoPauloDate(now),
    createdAt,
    updatedAt: createdAt,
  };

  const statements: D1PreparedStatement[] = [
    d1
      .prepare(
        `INSERT INTO horometro_logs (
          id, fleet, fleet_label, obra, horometro_value, type, photo_url,
          ocr_confidence, operator_name, operator_id, status, raw_ocr_text,
          notes, date, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        log.id,
        log.fleet,
        log.fleetLabel,
        log.obra,
        log.horometroValue,
        log.type,
        log.photoUrl,
        log.ocrConfidence,
        log.operatorName,
        log.operatorId,
        log.status,
        log.rawOcrText,
        log.notes,
        log.date,
        log.createdAt,
        log.updatedAt,
      ),
  ];

  if (status === "aprovado" && input.horometroValue >= previousAcceptedHours) {
    statements.push(
      d1
        .prepare("UPDATE equipment SET hours = ?, updated_at = ? WHERE id = ?")
        .bind(Math.round(input.horometroValue), createdAt, input.fleet),
    );
  }

  await d1.batch(statements);
  return { logId, createdAt };
}
