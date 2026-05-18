import { getCurrentUser } from "@/lib/auth-store";

export function escapeHtml(value: string | undefined | null): string {
  if (!value) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const PDF_STYLES = `
  * { box-sizing: border-box; }
  body { font-family: Inter, system-ui, sans-serif; color: #1a1a1a; padding: 32px 40px;
    max-width: 820px; margin: 0 auto; background: #fff; }
  .pdf-header { display: flex; align-items: center; gap: 16px; padding-bottom: 16px;
    border-bottom: 3px solid #ffd700; margin-bottom: 24px; }
  .pdf-header img { height: 56px; width: auto; object-fit: contain; }
  .pdf-header .doc-info { margin-left: auto; text-align: right; font-size: 11px; color: #666; }
  .pdf-header .doc-info strong { display: block; font-size: 16px; color: #1a1a1a;
    text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 2px; }
  h1 { font-size: 24px; margin: 0 0 4px; font-weight: 800; letter-spacing: -0.01em; }
  .pdf-meta { color: #666; font-size: 12px; margin-bottom: 20px; font-family: monospace; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; color: #555;
    margin: 24px 0 10px; border-bottom: 1px solid #e5e5e5; padding-bottom: 6px; font-weight: 700; }
  dl.pdf-dl { display: grid; grid-template-columns: 160px 1fr; gap: 8px 16px; font-size: 13px; margin: 0; }
  dl.pdf-dl dt { color: #666; font-weight: 500; }
  dl.pdf-dl dd { margin: 0; font-weight: 600; color: #1a1a1a; }
  ul { padding-left: 20px; font-size: 13px; line-height: 1.6; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 4px; }
  table th { text-align: left; background: #f5f5f5; padding: 8px 10px; font-weight: 700;
    text-transform: uppercase; font-size: 10px; letter-spacing: 0.06em; color: #555;
    border-bottom: 1px solid #ddd; }
  table td { padding: 8px 10px; border-bottom: 1px solid #eee; vertical-align: top; }
  p { font-size: 13px; line-height: 1.55; margin: 6px 0; }
  .pdf-footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e5e5;
    font-size: 10px; color: #888; text-align: center; letter-spacing: 0.05em; }
  @media print { body { padding: 20px 28px; } @page { margin: 16mm; } }
`;

export function buildPdfDocument(opts: {
  title: string;
  docType: string;
  headline: string;
  recordId: string;
  createdAt: string;
  bodyHtml: string;
}): string {
  const user = getCurrentUser();
  const now = new Date().toLocaleString("pt-BR");
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/>
<title>${escapeHtml(opts.title)}</title>
<style>${PDF_STYLES}</style></head><body>
<header class="pdf-header">
  <img src="/logo.png" alt="TransJap" onerror="this.style.display='none'"/>
  <div class="doc-info"><strong>${escapeHtml(opts.docType)}</strong>
    Documento gerado em ${escapeHtml(now)}</div>
</header>
<h1>${escapeHtml(opts.headline)}</h1>
<p class="pdf-meta">#${escapeHtml(opts.recordId)} · Criado em ${escapeHtml(opts.createdAt)}</p>
${opts.bodyHtml}
<footer class="pdf-footer">TransJap Fleet & Ops Management ·
  Gerado por ${escapeHtml(user?.name || "Sistema")} (${escapeHtml(user?.role || "—")}) em ${escapeHtml(now)}
</footer>
<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),200));</script>
</body></html>`;
}

export function openPdfWindow(html: string): void {
  const popup = window.open("", "_blank", "width=820,height=920");
  if (!popup) {
    console.warn("Popup bloqueado pelo navegador.");
    return;
  }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
}

export function triggerCsvDownload(csv: string, filename: string): void {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
