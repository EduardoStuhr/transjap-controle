import type { AttachedFile } from "@/components/AttachmentUpload";
import type { TaskRecord } from "@/lib/task-types";
import { resolveRecipients } from "@/lib/operational-options";
import { getTaskViewedAtForRecipient } from "@/lib/task-visibility";
import {
  buildPdfDocument,
  escapeHtml,
  openPdfWindow,
  triggerCsvDownload,
} from "@/lib/pdf-template";

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
    const ts = getTaskViewedAtForRecipient(task, name);
    return [name, ts ? `Visto em ${new Date(ts).toLocaleString("pt-BR")}` : "Não visualizado"];
  });

  const responseLines = task.responses.map((response) => [
    response.timestamp,
    response.author,
    response.text.replace(/\s+/g, " ").trim(),
  ]);

  const rows: string[][] = [
    ["Transjap — Tarefa", ""],
    ["ID", task.id],
    ["Título", task.title],
    ["Status", task.status],
    ["Prioridade", task.priority],
    ["Enviado por", task.createdBy || "Sistema"],
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

  triggerCsvDownload(rowsToCsv(rows), `tarefa-${task.id}.csv`);
}

export function exportTaskAsPdf(task: TaskRecord) {
  if (typeof window === "undefined") return;

  const recipients = resolveRecipients(task.assignedTo);
  const recipientHtml = recipients
    .map((name) => {
      const ts = getTaskViewedAtForRecipient(task, name);
      const label = ts ? `Visto em ${new Date(ts).toLocaleString("pt-BR")}` : "Não visualizado";
      return `<li><strong>${escapeHtml(name)}</strong> — ${escapeHtml(label)}</li>`;
    })
    .join("");

  const responseRows = task.responses.length
    ? task.responses
        .map(
          (r) => `<tr>
            <td>${escapeHtml(r.timestamp)}</td>
            <td>${escapeHtml(r.author)}</td>
            <td>${escapeHtml(r.text)}</td>
          </tr>`,
        )
        .join("")
    : `<tr><td colspan="3"><em>Nenhuma resposta registrada.</em></td></tr>`;

  const bodyHtml = `
    <h2>Detalhes</h2>
    <dl class="pdf-dl">
      <dt>Status</dt><dd>${escapeHtml(task.status)}</dd>
      <dt>Prioridade</dt><dd>${escapeHtml(task.priority)}</dd>
      <dt>Enviado por</dt><dd>${escapeHtml(task.createdBy || "Sistema")}</dd>
      <dt>Equipamento</dt><dd>${escapeHtml(task.equipment || "—")}</dd>
      <dt>Setor</dt><dd>${escapeHtml(task.sector || "—")}</dd>
      <dt>Prazo</dt><dd>${escapeHtml(task.deadline || "Sem prazo")}</dd>
    </dl>

    <h2>Destinatários</h2>
    <ul>${recipientHtml || "<li>Sem destinatários</li>"}</ul>

    <h2>Descrição</h2>
    <p>${escapeHtml(task.description || "Sem descrição.")}</p>

    <h2>Respostas</h2>
    <table>
      <thead><tr><th>Quando</th><th>Autor</th><th>Mensagem</th></tr></thead>
      <tbody>${responseRows}</tbody>
    </table>
  `;

  openPdfWindow(
    buildPdfDocument({
      title: `Tarefa ${task.id}`,
      docType: "Tarefa Operacional",
      headline: task.title || "Tarefa sem título",
      recordId: task.id,
      createdAt: task.createdAt,
      bodyHtml,
    }),
  );
}
