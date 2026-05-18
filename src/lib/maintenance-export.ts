import type { MaintenanceRecord } from "@/lib/maintenance-store";
import type { StockMovement } from "@/lib/inventory-types";
import {
  buildPdfDocument,
  escapeHtml,
  openPdfWindow,
  triggerCsvDownload,
} from "@/lib/pdf-template";

function escapeCsv(value: string) {
  if (value == null) return "";
  const needsQuotes = /[",\r\n;]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function rowsToCsv(rows: string[][]) {
  return rows.map((row) => row.map(escapeCsv).join(";")).join("\r\n");
}

function brl(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function stepStatusLabel(status: string) {
  if (status === "concluida") return "Concluída";
  if (status === "em_andamento") return "Em andamento";
  return "Pendente";
}

function formatTimestamp(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR");
}

export function exportMaintenanceAsPdf(record: MaintenanceRecord, movements: StockMovement[] = []) {
  if (typeof window === "undefined") return;

  const totalCost =
    movements.reduce((sum, movement) => sum + movement.costImpact, 0) || record.totalCost;

  const stepRows = record.steps
    .map(
      (step, index) => `<tr>
        <td>${index + 1}. ${escapeHtml(step.label)}</td>
        <td>${escapeHtml(stepStatusLabel(step.status))}</td>
        <td>${step.durationMinutes > 0 ? step.durationMinutes : "—"}</td>
        <td>${escapeHtml(step.completedBy || "—")}</td>
      </tr>`,
    )
    .join("");

  const partsSection =
    movements.length > 0
      ? `<h2>Peças consumidas</h2>
        <table>
          <thead><tr><th>Peça</th><th>Quantidade</th><th>Custo</th></tr></thead>
          <tbody>${movements
            .map(
              (movement) => `<tr>
                <td>${escapeHtml(movement.itemName)}</td>
                <td>${movement.quantity}</td>
                <td>${escapeHtml(brl(movement.costImpact))}</td>
              </tr>`,
            )
            .join("")}</tbody>
        </table>`
      : "";

  const timelineRows = record.timeline.length
    ? record.timeline
        .map(
          (event) => `<tr>
            <td>${escapeHtml(formatTimestamp(event.timestamp))}</td>
            <td>${escapeHtml(event.action)}</td>
            <td>${escapeHtml(event.user)}</td>
            <td>${escapeHtml(event.note || "—")}</td>
          </tr>`,
        )
        .join("")
    : `<tr><td colspan="4"><em>Sem eventos registrados.</em></td></tr>`;

  const notesSection = record.notes.trim()
    ? `<h2>Observações</h2><p>${escapeHtml(record.notes)}</p>`
    : "";

  const bodyHtml = `
    <h2>Detalhes</h2>
    <dl class="pdf-dl">
      <dt>Equipamento</dt><dd>${escapeHtml(record.equipment || "—")}</dd>
      <dt>Tipo</dt><dd>${escapeHtml(record.type || "—")}</dd>
      <dt>Status</dt><dd>${escapeHtml(record.status)}</dd>
      <dt>Item / Componente</dt><dd>${escapeHtml(record.item || "—")}</dd>
      <dt>Aberto por</dt><dd>${escapeHtml(record.submittedBy || "—")}</dd>
      <dt>Custo total</dt><dd>${escapeHtml(brl(totalCost))}</dd>
    </dl>

    <h2>Serviço a executar</h2>
    <p>${escapeHtml(record.serviceDescription || "Sem descrição")}</p>

    <h2>Pipeline de etapas</h2>
    <table>
      <thead><tr><th>Etapa</th><th>Status</th><th>Duração (min)</th><th>Concluído por</th></tr></thead>
      <tbody>${stepRows}</tbody>
    </table>

    ${partsSection}

    <h2>Timeline</h2>
    <table>
      <thead><tr><th>Quando</th><th>Ação</th><th>Por</th><th>Observação</th></tr></thead>
      <tbody>${timelineRows}</tbody>
    </table>

    ${notesSection}
  `;

  openPdfWindow(
    buildPdfDocument({
      title: `Manutenção ${record.id}`,
      docType: "Ordem de Manutenção",
      headline: record.equipment || "Manutenção",
      recordId: record.id,
      createdAt: record.createdAt,
      bodyHtml,
    }),
  );
}

export function exportMaintenanceAsCsv(
  record: MaintenanceRecord,
  movements: StockMovement[] = [],
) {
  const totalCost =
    movements.reduce((sum, movement) => sum + movement.costImpact, 0) || record.totalCost;

  const stepLines = record.steps.map((step, index) => [
    `${index + 1}. ${step.label}`,
    stepStatusLabel(step.status),
    step.durationMinutes > 0 ? String(step.durationMinutes) : "—",
    step.completedBy || "—",
  ]);

  const movementLines = movements.map((movement) => [
    movement.itemName,
    String(movement.quantity),
    brl(movement.costImpact),
  ]);

  const timelineLines = record.timeline.map((event) => [
    formatTimestamp(event.timestamp),
    event.action,
    event.user,
    event.note || "—",
  ]);

  const rows: string[][] = [
    ["TransJap — Manutenção", ""],
    ["ID", record.id],
    ["Equipamento", record.equipment],
    ["Tipo", record.type],
    ["Status", record.status],
    ["Item / Componente", record.item || "—"],
    ["Aberto por", record.submittedBy || "—"],
    ["Custo total", brl(totalCost)],
    ["Criada em", record.createdAt],
    [],
    ["Serviço a executar"],
    [record.serviceDescription || "Sem descrição"],
    [],
    ["Pipeline de etapas"],
    ["Etapa", "Status", "Duração (min)", "Concluído por"],
    ...stepLines,
  ];

  if (movementLines.length > 0) {
    rows.push([], ["Peças consumidas"], ["Peça", "Quantidade", "Custo"], ...movementLines);
  }

  rows.push([], ["Timeline"], ["Quando", "Ação", "Por", "Observação"], ...timelineLines);

  if (record.notes.trim()) {
    rows.push([], ["Observações"], [record.notes]);
  }

  triggerCsvDownload(rowsToCsv(rows), `manutencao-${record.id}.csv`);
}
