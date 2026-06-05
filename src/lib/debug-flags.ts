export const DEBUG_FLAG_DOCS = {
  debugWorksiteHours:
    "Imprime a soma de horas PDE por date|obra|item|equipment e mostra se cada linha entrou ou saiu do denominador, com motivo.",
  debugDieselIntegration:
    "Imprime cada CMB e fuel_allocation com obra do CMB, obra da allocation, obra do PDE, status de integracao e motivo.",
  debugDailySeries:
    "Imprime a serie diaria final antes dos graficos: m3 base, m3 relacionado, diesel, horas, participacao e formula.",
  debugProductionAudit:
    "Imprime tabela detalhada de origem das horas, producao e diesel por equipamento e obra.",
} as const;

export const DEBUG_FLAG_LABELS: Record<DebugFlag, string> = {
  debugWorksiteHours: "[DEBUG WSH]",
  debugDieselIntegration: "[DEBUG DSL]",
  debugDailySeries: "[DEBUG SER]",
  debugProductionAudit: "[DEBUG AUD]",
};

export type DebugFlag = keyof typeof DEBUG_FLAG_DOCS;

function parseDebugFlags(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function readDebugFlags() {
  if (typeof window === "undefined") return [];
  return parseDebugFlags(window.localStorage.getItem("debugFlags"));
}

export function isDebugRuntimeEnabled() {
  if (typeof window === "undefined") return false;
  if (import.meta.env.PROD) return false;
  if (import.meta.env.DEV) return true;
  const flags = readDebugFlags();
  return flags.includes("enableDebug") || window.localStorage.getItem("enableDebug") === "1";
}

export function isDebugFlagEnabled(flag: DebugFlag) {
  if (!isDebugRuntimeEnabled()) return false;
  const flags = readDebugFlags();
  return flags.includes(flag) || window.localStorage.getItem(flag) === "1";
}
