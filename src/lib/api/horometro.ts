import { createServerFn } from "@tanstack/react-start";
import { eq, desc, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import { horometroLogs, equipment as equipmentTable } from "@/db/schema";
import { getOptionalD1 } from "@/lib/cf-env";
import { normalizeFleetId } from "@/lib/operational-options";
import type { DbHorometroLog, DbHorometroLogInsert } from "@/db/schema";

export type HorometroLogCreate = {
  fleet: string;
  obra?: string;
  horometroValue: number;
  type?: "inicial" | "final" | "leitura";
  photoUrl?: string;
  ocrConfidence?: number;
  operatorName?: string;
  operatorId?: string;
  notes?: string;
  date?: string;
};

export type OCRProcessResult = {
  success: boolean;
  horometroValue?: number;
  confidence: number;
  rawText?: string;
  legivel?: boolean;
  tipo_leitura?: string;
  texto_visivel?: string;
  motivo_duvida?: string;
  error?: string;
};

let localHorometroLogs: DbHorometroLog[] = [
  {
    id: "hl-seed-01",
    fleet: "FR-016",
    fleetLabel: "Frota 16",
    obra: "CAMPO_LCO_05",
    horometroValue: 4258.5,
    type: "leitura",
    photoUrl: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=800&auto=format&fit=crop",
    ocrConfidence: 0.98,
    operatorName: "João Silva",
    operatorId: "op-01",
    status: "aprovado",
    rawOcrText: "HOURS 04258.5",
    notes: "Leitura matutina ok",
    date: new Date().toISOString().split("T")[0],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "hl-seed-02",
    fleet: "FR-018",
    fleetLabel: "Frota 18",
    obra: "FLECHA",
    horometroValue: 1890.0,
    type: "leitura",
    photoUrl: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&auto=format&fit=crop",
    ocrConfidence: 0.95,
    operatorName: "Carlos Eduardo",
    operatorId: "op-02",
    status: "aprovado",
    rawOcrText: "HOROMETRO 1890.0",
    notes: "Início de turno",
    date: new Date().toISOString().split("T")[0],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

function getHorometroD1() {
  return getOptionalD1();
}

export const listHorometroLogs = createServerFn({ method: "GET" })
  .inputValidator((filters?: { fleet?: string; obra?: string; date?: string }) => filters)
  .handler(async ({ data: filters }) => {
    const d1 = getHorometroD1();

    if (!d1) {
      let filtered = [...localHorometroLogs];
      if (filters?.fleet) {
        const normFleet = normalizeFleetId(filters.fleet);
        filtered = filtered.filter(
          (item) => item.fleet === normFleet || item.fleet.includes(filters.fleet!),
        );
      }
      if (filters?.obra) {
        filtered = filtered.filter((item) => item.obra === filters.obra);
      }
      if (filters?.date) {
        filtered = filtered.filter((item) => item.date === filters.date);
      }
      return filtered.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    }

    const db = getDb(d1);
    const conditions = [];
    if (filters?.fleet) {
      const normFleet = normalizeFleetId(filters.fleet);
      conditions.push(eq(horometroLogs.fleet, normFleet));
    }
    if (filters?.obra) {
      conditions.push(eq(horometroLogs.obra, filters.obra));
    }
    if (filters?.date) {
      conditions.push(eq(horometroLogs.date, filters.date));
    }

    if (conditions.length > 0) {
      return db
        .select()
        .from(horometroLogs)
        .where(and(...conditions))
        .orderBy(desc(horometroLogs.createdAt))
        .all();
    }

    return db.select().from(horometroLogs).orderBy(desc(horometroLogs.createdAt)).all();
  });

export const createHorometroLog = createServerFn({ method: "POST" })
  .inputValidator((input: HorometroLogCreate) => input)
  .handler(async ({ data: input }) => {
    const fleetId = normalizeFleetId(input.fleet);
    const now = new Date().toISOString();
    const today = input.date || now.split("T")[0];
    const logId = `hl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const fleetNum = fleetId.replace(/\D/g, "") || fleetId;
    const fleetLabel = `Frota ${fleetNum}`;

    let status: "aprovado" | "pendente_revisao" =
      (input.ocrConfidence ?? 1.0) < 0.75 ? "pendente_revisao" : "aprovado";
    let extraNotes = input.notes?.trim() || "";

    const d1 = getHorometroD1();

    // Check fleet history for hours validation
    try {
      if (d1) {
        const db = getDb(d1);
        const existingEquip = await db
          .select()
          .from(equipmentTable)
          .where(eq(equipmentTable.id, fleetId))
          .get();

        if (existingEquip) {
          const prevHours = existingEquip.hours || 0;
          if (input.horometroValue < prevHours) {
            status = "pendente_revisao";
            extraNotes += ` [ALERTA HISTÓRICO: Valor lido (${input.horometroValue}h) é menor que o registrado anteriormente (${prevHours}h)]`;
          } else if (input.horometroValue > prevHours + 200) {
            status = "pendente_revisao";
            extraNotes += ` [ALERTA HISTÓRICO: Salto significativo de horômetro (+${(input.horometroValue - prevHours).toFixed(1)}h)]`;
          }
        }
      }
    } catch (e) {
      console.warn("Erro ao validar histórico da frota:", e);
    }

    const newLog: DbHorometroLog = {
      id: logId,
      fleet: fleetId,
      fleetLabel,
      obra: input.obra?.trim() || "",
      horometroValue: Number(input.horometroValue),
      type: input.type || "leitura",
      photoUrl: input.photoUrl || null,
      ocrConfidence: input.ocrConfidence ?? 1.0,
      operatorName: input.operatorName?.trim() || "Operador",
      operatorId: input.operatorId || null,
      status,
      rawOcrText: null,
      notes: extraNotes.trim() || null,
      date: today,
      createdAt: now,
      updatedAt: now,
    };

    if (!d1) {
      localHorometroLogs.unshift(newLog);
      return newLog;
    }

    const db = getDb(d1);
    await db.insert(horometroLogs).values(newLog);

    // Update equipment current hours if newer
    try {
      const existingEquip = await db
        .select()
        .from(equipmentTable)
        .where(eq(equipmentTable.id, fleetId))
        .get();

      if (existingEquip) {
        const updateData: Record<string, unknown> = { updatedAt: now };
        if (input.horometroValue > existingEquip.hours) {
          updateData.hours = Math.round(input.horometroValue);
        }
        if (input.obra?.trim()) {
          updateData.location = input.obra.trim();
        }
        await db.update(equipmentTable).set(updateData).where(eq(equipmentTable.id, fleetId));
      }
    } catch (e) {
      console.warn("Nao foi possivel atualizar equipamento vinculado:", e);
    }

    return newLog;
  });

export const processHorometroOCR = createServerFn({ method: "POST" })
  .inputValidator((args: { imageBase64: string; fullImageBase64?: string }) => args)
  .handler(async ({ data: { imageBase64 } }): Promise<OCRProcessResult> => {
    try {
      const apiKey =
        getOptionalEnvString("VITE_GEMINI_API_KEY") ||
        getOptionalEnvString("GEMINI_API_KEY") ||
        (typeof import.meta !== "undefined" && import.meta.env
          ? (import.meta.env.VITE_GEMINI_API_KEY as string)
          : undefined) ||
        (typeof process !== "undefined"
          ? process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY
          : undefined);

      if (!apiKey) {
        return {
          success: false,
          confidence: 0,
          legivel: false,
          error:
            "Chave da API Gemini (VITE_GEMINI_API_KEY) não configurada no arquivo .env. Configure VITE_GEMINI_API_KEY no servidor.",
        };
      }

      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `Você é um especialista em visão computacional para equipamentos pesados. Analise a foto cortada do visor do horômetro de uma máquina agrícola ou pesada (escavadeira, trator, caminhão, etc). Extraia com máxima precisão o número total do horômetro (acumulado de horas de funcionamento).

Responda EXATAMENTE em formato JSON estrito com o seguinte esquema:
{
  "valor": 4258.5,
  "tipo_leitura": "horometro_total",
  "confianca": 0.94,
  "legivel": true,
  "texto_visivel": "04258.5 h",
  "motivo_duvida": null
}

Regras estritas:
1. Se a foto estiver ilegível, desfocada, escura ou o visor não for visível com clareza, defina "legivel": false, "valor": null, "confianca": 0.3, "texto_visivel": null e forneça o "motivo_duvida" explicando o problema.
2. NUNCA invente, adivinhe ou chute números. Se houver dúvida em qualquer dígito, marque "legivel": false.
3. Extraia o valor numérico com casas decimais se visível (ex: 4258.5).`,
                  },
                  {
                    inlineData: {
                      mimeType: "image/jpeg",
                      data: cleanBase64,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.0,
            },
          }),
        },
      );

      if (response.ok) {
        const resData = (await response.json()) as any;
        const candidateText =
          resData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (candidateText) {
          try {
            const parsed = JSON.parse(candidateText);
            const isLegible = Boolean(parsed.legivel !== false && parsed.valor !== null && typeof parsed.valor === "number" && !isNaN(parsed.valor));
            const confidence = typeof parsed.confianca === "number" ? parsed.confianca : (isLegible ? 0.9 : 0.2);

            return {
              success: isLegible,
              horometroValue: isLegible ? parsed.valor : undefined,
              confidence,
              legivel: isLegible,
              tipo_leitura: parsed.tipo_leitura || "horometro_total",
              texto_visivel: parsed.texto_visivel || candidateText,
              motivo_duvida: parsed.motivo_duvida || undefined,
              rawText: candidateText,
              error: isLegible ? undefined : (parsed.motivo_duvida || "Leitura do visor ilegível ou incerta pela IA."),
            };
          } catch {
            return {
              success: false,
              confidence: 0,
              legivel: false,
              rawText: candidateText,
              error: "Falha ao interpretar resposta estruturada da IA.",
            };
          }
        }
      }

      return {
        success: false,
        confidence: 0,
        legivel: false,
        error: `Serviço de IA Gemini retornou erro (status ${response.status}).`,
      };
    } catch (error) {
      console.error("Erro na leitura OCR:", error);
      return {
        success: false,
        confidence: 0,
        legivel: false,
        error: "Não foi possível conectar ao serviço de visão computacional.",
      };
    }
  });

export const deleteHorometroLog = createServerFn({ method: "POST" })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }) => {
    const d1 = getHorometroD1();
    if (!d1) {
      localHorometroLogs = localHorometroLogs.filter((item) => item.id !== id);
      return { ok: true };
    }

    const db = getDb(d1);
    await db.delete(horometroLogs).where(eq(horometroLogs.id, id));
    return { ok: true };
  });
