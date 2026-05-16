import { AUTH_USER_OPTIONS } from "@/lib/auth-store";

export const ASSIGNMENT_OPTIONS = ["Todos", ...AUTH_USER_OPTIONS.map((user) => user.name)] as const;

const ALL_USER_NAMES = AUTH_USER_OPTIONS.map((user) => user.name);

/**
 * Resolve a tasks's assignedTo list into the actual recipient names.
 * "Todos" expands to every registered auth user.
 */
export function resolveRecipients(assignedTo: readonly string[]): string[] {
  if (assignedTo.includes("Todos")) return ALL_USER_NAMES;
  return assignedTo.filter((name) => name && name !== "Todos");
}

export const SECTOR_OPTIONS = [
  "Operacional",
  "Manutenção",
  "Almoxarifado",
  "Administrativo",
  "Compras",
  "Estoque",
  "Oficina",
  "Financeiro",
  "Segurança",
  "Diretoria",
] as const;

export const EQUIPMENT_OPTIONS = [
  "Escavadeira CAT 320",
  "Caminhão Volvo FH-540",
  "Trator Komatsu D61",
  "Pá Carregadeira CAT 950",
  "Empilhadeira Hyster H80",
  "Gerador Stemac 180kVA",
  "Compressor Atlas Copco",
  "Bomba Hidráulica Principal",
] as const;

export const MAINTENANCE_TYPE_OPTIONS = [
  "Preventiva",
  "Corretiva",
  "Inspeção",
  "Troca de óleo",
  "Hidráulica",
  "Mecânica",
] as const;

export function normalizeOption<T extends readonly string[]>(
  value: string | undefined,
  options: T,
  fallback: T[number],
): T[number] {
  return options.includes(value || "") ? (value as T[number]) : fallback;
}
