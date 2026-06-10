import { getMaintenanceExternalCost, type MaintenanceRecord } from "@/lib/maintenance-store";
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

type MaintenanceReportOptions = {
  formatEquipment?: (equipment: string) => string;
  filterDescription?: string;
};

type MaintenanceReportRow = {
  id: string;
  equipment: string;
  type: string;
  item: string;
  serviceDescription: string;
  submittedBy: string;
  status: string;
  createdAt: string;
  daysStopped: number;
};

function parseMaintenanceDate(value: string) {
  if (!value) return null;

  if (value.includes("/")) {
    const [datePart] = value.split(",");
    const [day, month, year] = datePart.trim().split("/").map(Number);
    if (!day || !month || !year) return null;
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function maintenanceDaysStopped(createdAt: string) {
  const createdDate = parseMaintenanceDate(createdAt);
  if (!createdDate) return 0;

  const today = new Date();
  const start = new Date(
    createdDate.getFullYear(),
    createdDate.getMonth(),
    createdDate.getDate(),
  ).getTime();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

function prepareOpenMaintenanceRows(
  records: MaintenanceRecord[],
  options: MaintenanceReportOptions = {},
): MaintenanceReportRow[] {
  return records
    .filter((record) => record.status !== "Concluída")
    .map((record) => ({
      id: record.id,
      equipment: options.formatEquipment?.(record.equipment) || record.equipment || "—",
      type: record.type || "—",
      item: record.item || "—",
      serviceDescription: record.serviceDescription || "—",
      submittedBy: record.submittedBy || "—",
      status: record.status,
      createdAt: record.createdAt || "—",
      daysStopped: maintenanceDaysStopped(record.createdAt),
    }))
    .sort((a, b) => b.daysStopped - a.daysStopped || a.equipment.localeCompare(b.equipment));
}

function summarizeOpenMaintenance(rows: MaintenanceReportRow[]) {
  const equipmentCount = new Set(
    rows.map((row) => row.equipment.trim().toLocaleLowerCase("pt-BR")).filter(Boolean),
  ).size;
  const statusCounts = rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
    return counts;
  }, {});
  const typeCounts = rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.type] = (counts[row.type] ?? 0) + 1;
    return counts;
  }, {});
  const totalDays = rows.reduce((sum, row) => sum + row.daysStopped, 0);

  return {
    equipmentCount,
    statusCounts,
    typeCounts,
    averageDays: rows.length > 0 ? totalDays / rows.length : 0,
    maximumDays: rows.reduce((maximum, row) => Math.max(maximum, row.daysStopped), 0),
  };
}

function maintenanceReportFilename(extension: "pdf" | "xlsx") {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 5).replace(":", "");
  return `manutencoes-abertas-${date}-${time}.${extension}`;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type XlsxCellValue = string | number;

function escapeXml(value: string) {
  return Array.from(value)
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || code >= 32;
    })
    .join("")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function xlsxColumnName(index: number) {
  let column = "";
  let value = index + 1;
  while (value > 0) {
    value -= 1;
    column = String.fromCharCode(65 + (value % 26)) + column;
    value = Math.floor(value / 26);
  }
  return column;
}

function xlsxColumnWidths(rows: XlsxCellValue[][]) {
  const columnCount = Math.max(0, ...rows.map((row) => row.length));
  return Array.from({ length: columnCount }, (_, columnIndex) => {
    const maximumLength = rows.reduce((maximum, row) => {
      const value = row[columnIndex];
      return Math.max(maximum, String(value ?? "").length);
    }, 0);
    return Math.min(48, Math.max(12, maximumLength + 2));
  });
}

function buildXlsxWorksheet(rows: XlsxCellValue[][]) {
  const rowCount = Math.max(1, rows.length);
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  const lastCell = `${xlsxColumnName(columnCount - 1)}${rowCount}`;
  const columnsXml = xlsxColumnWidths(rows)
    .map(
      (width, index) =>
        `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`,
    )
    .join("");
  const rowsXml = rows
    .map((row, rowIndex) => {
      const excelRow = rowIndex + 1;
      const styleId = rowIndex === 0 ? 1 : rowIndex % 2 === 0 ? 3 : 2;
      const cellsXml = row
        .map((value, columnIndex) => {
          const reference = `${xlsxColumnName(columnIndex)}${excelRow}`;
          if (typeof value === "number" && Number.isFinite(value)) {
            return `<c r="${reference}" s="${styleId}"><v>${value}</v></c>`;
          }
          return `<c r="${reference}" s="${styleId}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
            String(value ?? ""),
          )}</t></is></c>`;
        })
        .join("");
      const height = rowIndex === 0 ? ' ht="24" customHeight="1"' : "";
      return `<row r="${excelRow}"${height}>${cellsXml}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastCell}"/>
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
      <selection pane="bottomLeft" activeCell="A2" sqref="A2"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>${columnsXml}</cols>
  <sheetData>${rowsXml}</sheetData>
  <autoFilter ref="A1:${lastCell}"/>
  <pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
</worksheet>`;
}

export function exportOpenMaintenanceAsPdf(
  records: MaintenanceRecord[],
  options: MaintenanceReportOptions = {},
) {
  if (typeof window === "undefined") return;

  const rows = prepareOpenMaintenanceRows(records, options);
  const summary = summarizeOpenMaintenance(rows);
  const generatedAt = new Date().toLocaleString("pt-BR");
  const filterDescription = options.filterDescription || "Todos os tipos";
  const statusSummaryRows = Object.entries(summary.statusCounts)
    .sort(([left], [right]) => left.localeCompare(right, "pt-BR"))
    .map(
      ([status, count]) =>
        `<tr><td>Status: ${escapeHtml(status)}</td><td class="numeric">${count}</td></tr>`,
    )
    .join("");
  const typeSummaryRows = Object.entries(summary.typeCounts)
    .sort(([left], [right]) => left.localeCompare(right, "pt-BR"))
    .map(
      ([type, count]) =>
        `<tr><td>Tipo: ${escapeHtml(type)}</td><td class="numeric">${count}</td></tr>`,
    )
    .join("");
  const maintenanceRows = rows
    .map(
      (row) => `<tr>
        <td>${escapeHtml(row.id)}</td>
        <td><strong>${escapeHtml(row.equipment)}</strong></td>
        <td>${escapeHtml(row.type)}</td>
        <td>${escapeHtml(row.item)}</td>
        <td>${escapeHtml(row.submittedBy)}</td>
        <td><span class="status-pill">${escapeHtml(row.status)}</span></td>
        <td>${escapeHtml(row.createdAt)}</td>
        <td class="numeric"><strong>${row.daysStopped}</strong></td>
      </tr>`,
    )
    .join("");

  const bodyHtml = `
    <style>
      @media print { @page { size: A4 landscape; } }
      .report-intro { margin-bottom: 16px; color: #555; }
      .report-kpis { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin: 16px 0 22px; }
      .report-kpi { border: 1px solid #dedede; border-top: 4px solid #ffd700; border-radius: 6px;
        padding: 12px; background: #fafafa; }
      .report-kpi span { display: block; color: #666; font-size: 9px; font-weight: 800;
        letter-spacing: .08em; text-transform: uppercase; }
      .report-kpi strong { display: block; margin-top: 5px; font-size: 21px; color: #171717; }
      .maintenance-report { font-size: 9px; }
      .maintenance-report th, .maintenance-report td { padding: 6px 7px; }
      .maintenance-report th { background: #202020; color: #ffd700; }
      .maintenance-report tbody tr:nth-child(even) { background: #fafafa; }
      .status-pill { display: inline-block; border-radius: 999px; padding: 2px 7px;
        background: #fff3b0; color: #4a3b00; font-weight: 700; white-space: nowrap; }
      .numeric { text-align: right; font-variant-numeric: tabular-nums; }
      .report-summary { max-width: 520px; }
      .report-summary td:last-child { width: 90px; }
      .empty-report { padding: 24px; text-align: center; color: #666; border: 1px dashed #ccc; }
    </style>

    <p class="report-intro">
      <strong>Filtros aplicados:</strong> ${escapeHtml(filterDescription)}.<br/>
      Relatório limitado às manutenções abertas visíveis na tela em ${escapeHtml(generatedAt)}.
    </p>

    <div class="report-kpis">
      <div class="report-kpi"><span>Equipamentos parados</span><strong>${summary.equipmentCount}</strong></div>
      <div class="report-kpi"><span>Manutenções abertas</span><strong>${rows.length}</strong></div>
    </div>

    <h2>Manutenções abertas</h2>
    ${
      rows.length > 0
        ? `<table class="maintenance-report">
            <thead><tr>
              <th>ID</th><th>Equipamento</th><th>Tipo</th><th>Item</th>
              <th>Aberto por</th><th>Status</th><th>Abertura</th><th>Dias parados</th>
            </tr></thead>
            <tbody>${maintenanceRows}</tbody>
          </table>`
        : `<div class="empty-report">Nenhuma manutenção aberta visível nos filtros atuais.</div>`
    }

    <h2>Resumo final</h2>
    <table class="report-summary">
      <thead><tr><th>Indicador</th><th class="numeric">Quantidade</th></tr></thead>
      <tbody>
        <tr><td>Total de equipamentos parados</td><td class="numeric">${summary.equipmentCount}</td></tr>
        <tr><td>Total de manutenções abertas</td><td class="numeric">${rows.length}</td></tr>
        ${statusSummaryRows}
        ${typeSummaryRows}
      </tbody>
    </table>
  `;

  openPdfWindow(
    buildPdfDocument({
      title: "Manutenções abertas - TransJap",
      docType: "Relatório de Manutenção",
      headline: "Manutenções Abertas",
      recordId: maintenanceReportFilename("pdf").replace(".pdf", ""),
      createdAt: generatedAt,
      bodyHtml,
    }),
  );
}

export async function exportOpenMaintenanceAsExcel(
  records: MaintenanceRecord[],
  options: MaintenanceReportOptions = {},
) {
  if (typeof window === "undefined") return;

  const { strToU8, zipSync } = await import("fflate");
  const rows = prepareOpenMaintenanceRows(records, options);
  const summary = summarizeOpenMaintenance(rows);
  const generatedAt = new Date();
  const filterDescription = options.filterDescription || "Todos os tipos";
  const maintenanceRows: XlsxCellValue[][] = [
    [
      "ID",
      "Equipamento",
      "Tipo",
      "Item / Componente",
      "Serviço",
      "Aberto por",
      "Status",
      "Data de abertura",
      "Dias parados",
    ],
    ...rows.map((row) => [
      row.id,
      row.equipment,
      row.type,
      row.item,
      row.serviceDescription,
      row.submittedBy,
      row.status,
      row.createdAt,
      row.daysStopped,
    ]),
  ];
  const summaryRows: XlsxCellValue[][] = [
    ["Indicador", "Valor"],
    ["Data/Hora da exportação", generatedAt.toLocaleString("pt-BR")],
    ["Filtros aplicados", filterDescription],
    ["Total de equipamentos parados", summary.equipmentCount],
    ["Total de manutenções abertas", rows.length],
    ["Média de dias parados", Number(summary.averageDays.toFixed(1))],
    ["Maior quantidade de dias parados", summary.maximumDays],
    ...Object.entries(summary.statusCounts)
      .sort(([left], [right]) => left.localeCompare(right, "pt-BR"))
      .map(([status, count]): XlsxCellValue[] => [`Status: ${status}`, count]),
    ...Object.entries(summary.typeCounts)
      .sort(([left], [right]) => left.localeCompare(right, "pt-BR"))
      .map(([type, count]): XlsxCellValue[] => [`Tipo: ${type}`, count]),
  ];

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;
  const rootRelationshipsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews><workbookView activeTab="0"/></bookViews>
  <sheets>
    <sheet name="Manutenções Abertas" sheetId="1" r:id="rId1"/>
    <sheet name="Resumo" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>`;
  const workbookRelationshipsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><color rgb="FFFFD700"/><sz val="11"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1F1F1F"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF8F8F8"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFD9D9D9"/></left>
      <right style="thin"><color rgb="FFD9D9D9"/></right>
      <top style="thin"><color rgb="FFD9D9D9"/></top>
      <bottom style="thin"><color rgb="FFD9D9D9"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="4">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">
      <alignment vertical="top" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="top" wrapText="1"/>
    </xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  const archive = zipSync(
    {
      "[Content_Types].xml": strToU8(contentTypesXml),
      "_rels/.rels": strToU8(rootRelationshipsXml),
      "xl/workbook.xml": strToU8(workbookXml),
      "xl/_rels/workbook.xml.rels": strToU8(workbookRelationshipsXml),
      "xl/styles.xml": strToU8(stylesXml),
      "xl/worksheets/sheet1.xml": strToU8(buildXlsxWorksheet(maintenanceRows)),
      "xl/worksheets/sheet2.xml": strToU8(buildXlsxWorksheet(summaryRows)),
    },
    { level: 6 },
  );
  triggerBlobDownload(
    new Blob([archive], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    maintenanceReportFilename("xlsx"),
  );
}

export function exportMaintenanceAsPdf(record: MaintenanceRecord, movements: StockMovement[] = []) {
  if (typeof window === "undefined") return;

  const inventoryCost = Math.max(
    movements.reduce((sum, movement) => sum + movement.costImpact, 0),
    record.totalCost,
  );
  const supplierCost = getMaintenanceExternalCost(record);
  const totalCost = inventoryCost + supplierCost;

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

  const supplierCostsSection =
    record.costEntries.length > 0
      ? `<h2>Custos de fornecedor</h2>
        <table>
          <thead><tr><th>Peça / serviço</th><th>Fornecedor</th><th>Valor</th></tr></thead>
          <tbody>${record.costEntries
            .map(
              (entry) => `<tr>
                <td>${escapeHtml(entry.partName || "Material")}</td>
                <td>${escapeHtml(entry.supplierName || "—")}</td>
                <td>${escapeHtml(brl(entry.amount))}</td>
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
      <dt>Peças do estoque</dt><dd>${escapeHtml(brl(inventoryCost))}</dd>
      <dt>Custos de fornecedor</dt><dd>${escapeHtml(brl(supplierCost))}</dd>
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
    ${supplierCostsSection}

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

export function exportMaintenanceAsCsv(record: MaintenanceRecord, movements: StockMovement[] = []) {
  const inventoryCost = Math.max(
    movements.reduce((sum, movement) => sum + movement.costImpact, 0),
    record.totalCost,
  );
  const supplierCost = getMaintenanceExternalCost(record);
  const totalCost = inventoryCost + supplierCost;

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
  const supplierCostLines = record.costEntries.map((entry) => [
    entry.partName || "Material",
    entry.supplierName || "—",
    brl(entry.amount),
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
    ["Peças do estoque", brl(inventoryCost)],
    ["Custos de fornecedor", brl(supplierCost)],
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

  if (supplierCostLines.length > 0) {
    rows.push(
      [],
      ["Custos de fornecedor"],
      ["Peça / serviço", "Fornecedor", "Valor"],
      ...supplierCostLines,
    );
  }

  rows.push([], ["Timeline"], ["Quando", "Ação", "Por", "Observação"], ...timelineLines);

  if (record.notes.trim()) {
    rows.push([], ["Observações"], [record.notes]);
  }

  triggerCsvDownload(rowsToCsv(rows), `manutencao-${record.id}.csv`);
}
