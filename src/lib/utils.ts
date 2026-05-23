import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBrDate(value: string | undefined | null): string {
  if (!value) return "—";
  const s = String(value).trim();
  if (!s || s === "—") return "—";
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) return s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  }
  const date = new Date(s);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleDateString("pt-BR");
  }
  return s;
}

export function formatBrDateTime(value: string | undefined | null): string {
  if (!value) return "—";
  const s = String(value).trim();
  if (!s || s === "—") return "—";
  const date = new Date(s);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return formatBrDate(s);
}
