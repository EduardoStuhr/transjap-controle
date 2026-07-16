import type { Equipment } from "@/lib/equipment-store";
import type { DieselFilterChangeWithHours } from "@/lib/diesel-filter-store";
import { formatEquipmentReference } from "@/lib/operational-options";
import { buildPdfDocument, escapeHtml, openPdfWindow } from "@/lib/pdf-template";
import { formatBrDate } from "@/lib/utils";

type DieselFilterExportOptions = {
  rows: DieselFilterChangeWithHours[];
  equipments: Pick<Equipment, "id" | "model">[];
  filterDescription?: string;
};

function filename(extension: "pdf" | "xlsx") {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 5).replace(":", "");
  return `troca-filtros-diesel-${date}-${time}.${extension}`;
}

function numberPt(value: number | null) {
  if (value === null) return "";
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 1,
  });
}

function rowToExport(row: DieselFilterChangeWithHours, equipments: Pick<Equipment, "id" | "model">[]) {
  return {
    Data: formatBrDate(row.date),
    Frota: formatEquipmentReference(row.fleet, equipments),
    Horimetro: numberPt(row.hourmeter),
    "Horas desde ultima troca": row.hoursSinceLastChangeLabel,
    "Filtro Primario": row.primaryFilter || "",
    "Filtro Secundario": row.secondaryFilter || "",
    Racor: row.racor || "",
    Marca: row.brand || "",
    Obra: row.obra || "",
    Responsavel: row.responsible || "",
    Observacoes: row.notes || "",
  };
}

function summarize(rows: DieselFilterChangeWithHours[]) {
  const fleets = new Set(rows.map((row) => row.fleet)).size;
  const maxInterval = rows.reduce(
    (max, row) =>
      row.hoursSinceLastChange === null ? max : Math.max(max ?? 0, row.hoursSinceLastChange),
    null as number | null,
  );

  return { fleets, maxInterval };
}

export function exportDieselFilterChangesAsPdf({
  rows,
  equipments,
  filterDescription = "Registros visiveis na tela",
}: DieselFilterExportOptions) {
  if (typeof window === "undefined") return;

  const generatedAt = new Date().toLocaleString("pt-BR");
  const summary = summarize(rows);
  const tableRows = rows
    .map((row) => {
      const exported = rowToExport(row, equipments);
      return `<tr>
        <td>${escapeHtml(exported.Data)}</td>
        <td><strong>${escapeHtml(exported.Frota)}</strong></td>
        <td class="numeric">${escapeHtml(exported.Horimetro)}</td>
        <td class="numeric"><strong>${escapeHtml(exported["Horas desde ultima troca"])}</strong></td>
        <td>${escapeHtml(exported["Filtro Primario"])}</td>
        <td>${escapeHtml(exported["Filtro Secundario"])}</td>
        <td>${escapeHtml(exported.Racor)}</td>
        <td>${escapeHtml(exported.Marca)}</td>
        <td>${escapeHtml(exported.Obra)}</td>
        <td>${escapeHtml(exported.Responsavel)}</td>
        <td>${escapeHtml(exported.Observacoes)}</td>
      </tr>`;
    })
    .join("");

  const bodyHtml = `
    <style>
      @media print { @page { size: A4 landscape; } }
      .report-intro { margin-bottom: 16px; color: #555; }
      .report-kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 16px 0 22px; }
      .report-kpi { border: 1px solid #dedede; border-top: 4px solid #ffd700; border-radius: 6px; padding: 12px; background: #fafafa; }
      .report-kpi span { display: block; color: #666; font-size: 9px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
      .report-kpi strong { display: block; margin-top: 5px; font-size: 20px; color: #171717; }
      .diesel-report { font-size: 8px; }
      .diesel-report th, .diesel-report td { padding: 5px 6px; }
      .diesel-report th { background: #12402a; color: #ffd700; }
      .diesel-report tbody tr:nth-child(even) { background: #fafafa; }
      .numeric { text-align: right; font-variant-numeric: tabular-nums; }
      .empty-report { padding: 24px; text-align: center; color: #666; border: 1px dashed #ccc; }
    </style>

    <p class="report-intro">
      <strong>Filtros aplicados:</strong> ${escapeHtml(filterDescription)}.<br/>
      Relatorio gerado em ${escapeHtml(generatedAt)}.
    </p>

    <div class="report-kpis">
      <div class="report-kpi"><span>Total de trocas</span><strong>${rows.length}</strong></div>
      <div class="report-kpi"><span>Frotas acompanhadas</span><strong>${summary.fleets}</strong></div>
      <div class="report-kpi"><span>Maior intervalo</span><strong>${summary.maxInterval === null ? "-" : `${numberPt(summary.maxInterval)} h`}</strong></div>
    </div>

    ${
      rows.length > 0
        ? `<table class="diesel-report">
            <thead><tr>
              <th>Data</th><th>Frota</th><th>Horimetro</th><th>Horas desde ultima troca</th>
              <th>Filtro Primario</th><th>Filtro Secundario</th><th>Racor</th><th>Marca</th>
              <th>Obra</th><th>Responsavel</th><th>Observacoes</th>
            </tr></thead>
            <tbody>${tableRows}</tbody>
          </table>`
        : `<div class="empty-report">Nenhuma troca visivel nos filtros atuais.</div>`
    }
  `;

  openPdfWindow(
    buildPdfDocument({
      title: "Troca de Filtros Diesel - Transjap",
      docType: "Relatorio de Trocas Diesel",
      headline: "Troca de Filtros Diesel",
      recordId: filename("pdf").replace(".pdf", ""),
      createdAt: generatedAt,
      bodyHtml,
    }),
  );
}

export async function exportDieselFilterChangesAsExcel({
  rows,
  equipments,
}: DieselFilterExportOptions) {
  if (typeof window === "undefined") return;

  const XLSX = await import("xlsx");
  const data = rows.map((row) => rowToExport(row, equipments));
  const worksheet = XLSX.utils.json_to_sheet(data);
  worksheet["!cols"] = [
    { wch: 12 },
    { wch: 36 },
    { wch: 12 },
    { wch: 24 },
    { wch: 18 },
    { wch: 18 },
    { wch: 14 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 34 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Trocas Diesel");
  XLSX.writeFile(workbook, filename("xlsx"));
}
