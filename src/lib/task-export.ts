import type { AttachedFile } from "@/components/AttachmentUpload";
import type { TaskRecord } from "@/lib/task-types";
import { resolveRecipients } from "@/lib/operational-options";

function triggerDownload(href: string, filename: string) {
  if (typeof document === "undefined") return;
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

export function downloadAttachment(file: AttachedFile) {
  if (!file.url) return false;
  triggerDownload(file.url, file.name);
  return true;
}

function escapeCsv(value: string) {
  if (value == null) return "";
  const needsQuotes = /[",\r\n;]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function rowsToCsv(rows: string[][]) {
  return rows.map((row) => row.map(escapeCsv).join(";")).join("\r\n");
}

export function exportTaskAsCsv(task: TaskRecord) {
  const recipients = resolveRecipients(task.assignedTo);
  const recipientLines = recipients.map((name) => {
    const ts = task.viewedBy[name];
    return [name, ts ? `Visto em ${new Date(ts).toLocaleString("pt-BR")}` : "Não visualizado"];
  });

  const responseLines = task.responses.map((response) => [
    response.timestamp,
    response.author,
    response.text.replace(/\s+/g, " ").trim(),
  ]);

  const rows: string[][] = [
    ["TransJap — Tarefa", ""],
    ["ID", task.id],
    ["Título", task.title],
    ["Status", task.status],
    ["Prioridade", task.priority],
    ["Equipamento", task.equipment],
    ["Setor", task.sector],
    ["Prazo", task.deadline],
    ["Criada em", task.createdAt],
    [],
    ["Destinatário", "Status de visualização"],
    ...recipientLines,
    [],
    ["Descrição"],
    [task.description.replace(/\s+/g, " ").trim()],
    [],
    ["Respostas"],
    ["Quando", "Quem", "Mensagem"],
    ...responseLines,
  ];

  const csv = "﻿" + rowsToCsv(rows); // BOM so Excel detects UTF-8
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, `tarefa-${task.id}.csv`);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function exportTaskAsPdf(task: TaskRecord) {
  if (typeof window === "undefined") return;

  const recipients = resolveRecipients(task.assignedTo);
  const recipientHtml = recipients
    .map((name) => {
      const ts = task.viewedBy[name];
      const label = ts ? `Visto em ${new Date(ts).toLocaleString("pt-BR")}` : "Não visualizado";
      return `<li><strong>${escapeHtml(name)}</strong> — ${escapeHtml(label)}</li>`;
    })
    .join("");

  const responsesHtml = task.responses.length
    ? task.responses
        .map(
          (r) => `
        <article style="border-top:1px solid #ccc;padding:8px 0;">
          <header style="font-size:12px;color:#555;">${escapeHtml(r.timestamp)} — <strong>${escapeHtml(r.author)}</strong></header>
          <p style="margin:6px 0 0;">${escapeHtml(r.text)}</p>
        </article>`,
        )
        .join("")
    : "<p><em>Nenhuma resposta registrada.</em></p>";

  const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Tarefa ${escapeHtml(task.id)}</title>
    <style>
      body { font-family: Inter, system-ui, sans-serif; color: #111; padding: 24px; max-width: 760px; margin: 0 auto; }
      h1 { font-size: 22px; margin: 0 0 4px; }
      .meta { color: #555; font-size: 12px; margin-bottom: 16px; }
      dl { display: grid; grid-template-columns: 160px 1fr; gap: 6px 12px; font-size: 13px; }
      dt { color: #555; }
      dd { margin: 0; font-weight: 600; }
      section { margin-top: 20px; }
      h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.08em; color: #333; margin: 0 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
      ul { padding-left: 18px; }
      @media print {
        body { padding: 0; }
      }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(task.title || "Tarefa")}</h1>
    <p class="meta">#${escapeHtml(task.id)} · Criada em ${escapeHtml(task.createdAt)}</p>

    <dl>
      <dt>Status</dt><dd>${escapeHtml(task.status)}</dd>
      <dt>Prioridade</dt><dd>${escapeHtml(task.priority)}</dd>
      <dt>Equipamento</dt><dd>${escapeHtml(task.equipment || "—")}</dd>
      <dt>Setor</dt><dd>${escapeHtml(task.sector || "—")}</dd>
      <dt>Prazo</dt><dd>${escapeHtml(task.deadline || "Sem prazo")}</dd>
    </dl>

    <section>
      <h2>Destinatários</h2>
      <ul>${recipientHtml || "<li>Sem destinatários</li>"}</ul>
    </section>

    <section>
      <h2>Descrição</h2>
      <p>${escapeHtml(task.description || "Sem descrição.")}</p>
    </section>

    <section>
      <h2>Respostas</h2>
      ${responsesHtml}
    </section>

    <script>
      window.addEventListener("load", () => {
        setTimeout(() => window.print(), 100);
      });
    </script>
  </body>
</html>`;

  const popup = window.open("", "_blank", "noopener,noreferrer,width=800,height=900");
  if (!popup) return;
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
}
