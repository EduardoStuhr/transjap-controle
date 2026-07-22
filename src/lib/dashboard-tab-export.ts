export type DashboardExportCell = string | number | boolean | null | undefined;

export type DashboardExportSheet = {
  name: string;
  rows: Array<Record<string, DashboardExportCell>>;
};

export type DashboardTabExportOptions = {
  element: HTMLElement;
  tabLabel: string;
  filters?: Array<[string, string]>;
  dataSheets?: DashboardExportSheet[];
};

function exportTimestamp() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 5).replace(":", "");
  return `${date}-${time}`;
}

function filenamePart(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "aba"
  );
}

function exportFilename(tabLabel: string, extension: "pdf" | "xlsx") {
  return `producao-consumo-${filenamePart(tabLabel)}-${exportTimestamp()}.${extension}`;
}

function copyFormState(source: HTMLElement, clone: HTMLElement) {
  const sourceControls = source.querySelectorAll("input, select, textarea");
  const cloneControls = clone.querySelectorAll("input, select, textarea");

  sourceControls.forEach((control, index) => {
    const clonedControl = cloneControls[index];
    if (!clonedControl) return;

    if (control instanceof HTMLSelectElement && clonedControl instanceof HTMLSelectElement) {
      Array.from(clonedControl.options).forEach((option) => {
        const selected = Array.from(control.selectedOptions).some(
          (selectedOption) => selectedOption.value === option.value,
        );
        option.selected = selected;
        if (selected) option.setAttribute("selected", "");
        else option.removeAttribute("selected");
      });
      return;
    }

    if (control instanceof HTMLTextAreaElement && clonedControl instanceof HTMLTextAreaElement) {
      clonedControl.textContent = control.value;
      return;
    }

    if (control instanceof HTMLInputElement && clonedControl instanceof HTMLInputElement) {
      clonedControl.setAttribute("value", control.value);
      if (control.checked) clonedControl.setAttribute("checked", "");
      else clonedControl.removeAttribute("checked");
    }
  });
}

function expandClippedContent(source: HTMLElement, clone: HTMLElement) {
  const sourceElements = [source, ...Array.from(source.querySelectorAll<HTMLElement>("*"))];
  const cloneElements = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>("*"))];

  sourceElements.forEach((sourceElement, index) => {
    const clonedElement = cloneElements[index];
    if (!clonedElement) return;
    const clipsVertically = sourceElement.scrollHeight > sourceElement.clientHeight + 2;
    const clipsHorizontally = sourceElement.scrollWidth > sourceElement.clientWidth + 2;
    if (clipsVertically) {
      clonedElement.style.height = "auto";
      clonedElement.style.maxHeight = "none";
      clonedElement.style.overflowY = "visible";
    }
    if (clipsHorizontally) {
      clonedElement.style.maxWidth = "none";
      clonedElement.style.overflowX = "visible";
    }
    if (clipsVertically || clipsHorizontally) clonedElement.style.overflow = "visible";
  });
}

function cloneForExport(element: HTMLElement) {
  const clone = element.cloneNode(true) as HTMLElement;
  copyFormState(element, clone);
  expandClippedContent(element, clone);
  clone.querySelectorAll<HTMLElement>("table").forEach((table) => {
    table.style.width = "100%";
    table.style.minWidth = "0";
    table.style.tableLayout = "auto";
  });
  clone.querySelectorAll("[data-export-exclude]").forEach((node) => node.remove());
  return clone;
}

type DashboardCapture = {
  png: string;
  width: number;
  height: number;
  protectedRanges: Array<{ top: number; bottom: number }>;
};

async function waitForCloneImages(root: HTMLElement) {
  await Promise.all(
    Array.from(root.querySelectorAll("img")).map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) {
            resolve();
            return;
          }
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        }),
    ),
  );
}

function nextPaint() {
  return new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}

function chartProtectedRanges(root: HTMLElement) {
  const rootRect = root.getBoundingClientRect();
  const ranges = Array.from(root.querySelectorAll<HTMLElement>(".app-chart-card"))
    .map((card) => {
      const rect = card.getBoundingClientRect();
      return {
        top: Math.max(0, rect.top - rootRect.top),
        bottom: Math.min(root.scrollHeight, rect.bottom - rootRect.top),
      };
    })
    .filter(({ top, bottom }) => bottom - top > 40)
    .sort((left, right) => left.top - right.top);

  return ranges.reduce<Array<{ top: number; bottom: number }>>((merged, range) => {
    const previous = merged.at(-1);
    if (previous && range.top <= previous.bottom + 2) {
      previous.bottom = Math.max(previous.bottom, range.bottom);
    } else {
      merged.push({ ...range });
    }
    return merged;
  }, []);
}

async function captureDashboardTab(element: HTMLElement): Promise<DashboardCapture> {
  await Promise.all([document.fonts?.ready, waitForCloneImages(element)]);
  await nextPaint();

  const initialWidth = Math.max(1, Math.ceil(element.getBoundingClientRect().width));
  const exportClone = cloneForExport(element);
  const sandbox = document.createElement("div");
  sandbox.setAttribute("aria-hidden", "true");
  sandbox.style.position = "fixed";
  sandbox.style.left = "-100000px";
  sandbox.style.top = "0";
  sandbox.style.width = `${initialWidth}px`;
  sandbox.style.pointerEvents = "none";
  sandbox.style.zIndex = "-1";
  exportClone.style.width = `${initialWidth}px`;
  sandbox.appendChild(exportClone);
  document.body.appendChild(sandbox);

  try {
    await waitForCloneImages(exportClone);
    await nextPaint();
    const { toPng } = await import("html-to-image");
    const width = initialWidth;
    const height = Math.max(1, Math.ceil(exportClone.scrollHeight));
    const protectedRanges = chartProtectedRanges(exportClone);
    const maximumPixels = 24_000_000;
    const pixelRatio = Math.min(1.5, Math.max(0.75, Math.sqrt(maximumPixels / (width * height))));
    const rootStyles = getComputedStyle(document.documentElement);
    const backgroundColor = rootStyles.getPropertyValue("--surface").trim() || "#131313";
    const png = await toPng(exportClone, {
      cacheBust: true,
      backgroundColor,
      width,
      height,
      pixelRatio,
      style: {
        width: `${width}px`,
        height: `${height}px`,
      },
    });
    return { png, width, height, protectedRanges };
  } finally {
    sandbox.remove();
  }
}

function loadExportImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível preparar os gráficos para o PDF."));
    image.src = source;
  });
}

function buildPdfSlices(
  totalHeight: number,
  maximumSliceHeight: number,
  protectedRanges: Array<{ top: number; bottom: number }>,
) {
  const slices: Array<{ sourceY: number; height: number }> = [];
  const minimumUsefulSlice = maximumSliceHeight * 0.12;
  let sourceY = 0;

  while (sourceY < totalHeight) {
    let end = Math.min(totalHeight, sourceY + maximumSliceHeight);
    if (end < totalHeight) {
      const crossingRange = protectedRanges.find(
        (range) => range.top < end - 1 && range.bottom > end + 1,
      );
      if (crossingRange && crossingRange.bottom - crossingRange.top <= maximumSliceHeight) {
        const breakBeforeChart = Math.floor(crossingRange.top);
        if (breakBeforeChart - sourceY >= minimumUsefulSlice) {
          end = breakBeforeChart;
        } else if (crossingRange.bottom - sourceY <= maximumSliceHeight * 1.12) {
          end = Math.ceil(crossingRange.bottom);
        }
      }
    }

    end = Math.min(totalHeight, Math.max(sourceY + 1, end));
    slices.push({ sourceY, height: end - sourceY });
    sourceY = end;
  }

  return slices;
}

export async function exportDashboardTabAsPdf({
  element,
  tabLabel,
  filters = [],
}: DashboardTabExportOptions) {
  if (typeof window === "undefined") return;

  const [{ png, height, protectedRanges }, { jsPDF }] = await Promise.all([
    captureDashboardTab(element),
    import("jspdf"),
  ]);
  const image = await loadExportImage(png);
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const contentWidth = pageWidth - margin * 2;
  const filterText = filters.map(([label, value]) => `${label}: ${value || "Todos"}`).join("  |  ");
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  const filterLines = (filterText ? pdf.splitTextToSize(filterText, contentWidth) : []).slice(0, 3);
  const headerHeight = 16 + filterLines.length * 3.2;
  const footerHeight = 6;
  const contentHeight = pageHeight - headerHeight - footerHeight;
  const pagePixelHeight = Math.max(
    1,
    Math.floor((image.naturalWidth * contentHeight) / contentWidth),
  );
  const imageScale = image.naturalHeight / height;
  const slices = buildPdfSlices(
    image.naturalHeight,
    pagePixelHeight,
    protectedRanges.map((range) => ({
      top: range.top * imageScale,
      bottom: range.bottom * imageScale,
    })),
  );
  const totalPages = slices.length;
  const generatedAt = new Date().toLocaleString("pt-BR");

  for (let pageIndex = 0; pageIndex < slices.length; pageIndex += 1) {
    if (pageIndex > 0) pdf.addPage("a4", "landscape");
    pdf.setFillColor(19, 19, 19);
    pdf.rect(0, 0, pageWidth, pageHeight, "F");
    pdf.setTextColor(255, 215, 0);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text(tabLabel, margin, 8.5);
    pdf.setTextColor(190, 190, 190);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    const generatedWidth = pdf.getTextWidth(generatedAt);
    pdf.text(generatedAt, pageWidth - margin - generatedWidth, 8.5);
    pdf.setDrawColor(255, 215, 0);
    pdf.setLineWidth(0.5);
    pdf.line(margin, 11, pageWidth - margin, 11);
    if (filterLines.length > 0) {
      pdf.setTextColor(205, 198, 171);
      pdf.text(filterLines, margin, 15);
    }

    const { sourceY, height: cropHeight } = slices[pageIndex];
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = cropHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("O navegador não conseguiu montar as páginas do PDF.");
    context.drawImage(
      image,
      0,
      sourceY,
      image.naturalWidth,
      cropHeight,
      0,
      0,
      image.naturalWidth,
      cropHeight,
    );
    const pageImage = canvas.toDataURL("image/png");
    const scale = Math.min(contentWidth / image.naturalWidth, contentHeight / cropHeight);
    const renderedWidth = image.naturalWidth * scale;
    const renderedHeight = cropHeight * scale;
    pdf.addImage(
      pageImage,
      "PNG",
      margin + (contentWidth - renderedWidth) / 2,
      headerHeight,
      renderedWidth,
      renderedHeight,
      undefined,
      "FAST",
    );
    pdf.setTextColor(150, 150, 150);
    pdf.setFontSize(7);
    pdf.text(`Página ${pageIndex + 1} de ${totalPages}`, margin, pageHeight - 2.5);
    canvas.width = 1;
    canvas.height = 1;
  }

  pdf.save(exportFilename(tabLabel, "pdf"));
}

function sheetName(value: string, usedNames: Set<string>) {
  const base =
    value
      .replace(/[\\/?*:[\]]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 31) || "Dados";
  let candidate = base;
  let suffix = 2;
  while (usedNames.has(candidate.toLocaleLowerCase("pt-BR"))) {
    const suffixLabel = ` ${suffix}`;
    candidate = `${base.slice(0, 31 - suffixLabel.length)}${suffixLabel}`;
    suffix += 1;
  }
  usedNames.add(candidate.toLocaleLowerCase("pt-BR"));
  return candidate;
}

function styleHeaderRow(row: {
  eachCell: (
    callback: (cell: { font: unknown; fill: unknown; alignment: unknown; border: unknown }) => void,
  ) => void;
}) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFD700" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF20201F" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FF555555" } },
      left: { style: "thin", color: { argb: "FF555555" } },
      bottom: { style: "thin", color: { argb: "FF555555" } },
      right: { style: "thin", color: { argb: "FF555555" } },
    };
  });
}

function triggerWorkbookDownload(bytes: Uint8Array, filename: string) {
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  const blob = new Blob([arrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportDashboardTabAsExcel({
  element,
  tabLabel,
  filters = [],
  dataSheets = [],
}: DashboardTabExportOptions) {
  if (typeof window === "undefined") return;

  const { png, width, height } = await captureDashboardTab(element);

  const ExcelJSModule = await import("exceljs");
  const ExcelJS = "default" in ExcelJSModule ? ExcelJSModule.default : ExcelJSModule;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Transjap";
  workbook.created = new Date();
  workbook.subject = `Aba ${tabLabel} - Produção x Consumo`;
  const usedNames = new Set<string>();
  const visualSheet = workbook.addWorksheet(sheetName(tabLabel, usedNames), {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  visualSheet.mergeCells("A1:J1");
  const titleCell = visualSheet.getCell("A1");
  titleCell.value = tabLabel;
  titleCell.font = { bold: true, size: 18, color: { argb: "FFFFD700" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF20201F" } };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  visualSheet.getRow(1).height = 28;
  visualSheet.addRow(["Gerado em", new Date().toLocaleString("pt-BR")]);
  filters.forEach(([label, value]) => visualSheet.addRow([label, value || "Todos"]));
  visualSheet.columns = Array.from({ length: 10 }, () => ({ width: 16 }));

  const imageStartRow = filters.length + 4;
  const displayWidth = Math.min(1200, width);
  const displayHeight = Math.max(1, Math.round((height / width) * displayWidth));
  const imageId = workbook.addImage({ base64: png, extension: "png" });
  visualSheet.addImage(imageId, {
    tl: { col: 0, row: imageStartRow - 1 },
    ext: { width: displayWidth, height: displayHeight },
  });
  visualSheet.pageSetup.printArea = `A1:J${Math.max(imageStartRow + Math.ceil(displayHeight / 20), 10)}`;

  dataSheets.forEach(({ name, rows }) => {
    if (rows.length === 0) return;
    const worksheet = workbook.addWorksheet(sheetName(name, usedNames), {
      views: [{ state: "frozen", ySplit: 1 }],
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
    worksheet.addRow(columns);
    styleHeaderRow(worksheet.getRow(1));
    rows.forEach((row) => worksheet.addRow(columns.map((column) => row[column] ?? "")));
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, rows.length + 1), column: Math.max(1, columns.length) },
    };
    worksheet.columns = columns.map((column) => ({
      width: Math.min(
        42,
        Math.max(
          12,
          column.length + 2,
          ...rows.slice(0, 100).map((row) => String(row[column] ?? "").length + 2),
        ),
      ),
    }));
  });

  const buffer = await workbook.xlsx.writeBuffer();
  triggerWorkbookDownload(new Uint8Array(buffer), exportFilename(tabLabel, "xlsx"));
}
