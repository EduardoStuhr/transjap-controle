import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Icon } from "@/components/AppLayout";
import { ManualPdeDialog } from "@/components/ManualPdeDialog";
import { createAnalysis } from "@/lib/api/production-consumption";
import { calculateCompactedM3 } from "@/lib/production-consumption-utils";
import {
  normalizeDateKey,
  normalizeFleet,
  parseCarcaraFile,
  parsePdeFileInWorker,
  extractRequiredFleets,
  extractDateRangeFromFueling,
} from "@/lib/carcara-parser";
import type {
  CarcaraFileType,
  PdeColumnMapping,
  PdeWarning,
  ParsedDailyPart,
  ParsedFueling,
  ParsedTrip,
} from "@/lib/carcara-parser";

type ParsedUploadResult =
  | { type: "trips"; rows: ParsedTrip[] }
  | { type: "fueling"; rows: ParsedFueling[] }
  | { type: "pde"; rows: ParsedDailyPart[]; warnings: PdeWarning[] }
  | { type: "unknown"; message: string };

type FileItem = {
  file: File;
  result: ParsedUploadResult;
  parsing?: boolean;
};

type UploadSlot = "rco" | "cmb" | "pde";

type PendingManualFile = {
  file: File;
  reason: string;
};

type PdeFallbackState = {
  file: File;
  reason: string;
  startRow: string;
  dateColumn: string;
  hoursColumn: string;
  fleetColumn: string;
  obraColumn: string;
};

type AnalysisDraft = {
  name: string;
  obra: string;
  material: string;
  dateStart: string;
  dateEnd: string;
  swellFactor: string;
};

type Preview = {
  trips: ParsedTrip[];
  fueling: ParsedFueling[];
  looseM3: number;
  compactedM3: number;
  liters: number;
  fuelCost: number;
  pdeRows: ParsedDailyPart[];
  pdeRowsUsed: ParsedDailyPart[];
  pdeHoursUsed: number;
  pdeFleets: string[];
  pdeFleetsUsed: string[];
  pdePending: string[];
  dateStart: string;
  dateEnd: string;
  equipments: string[];
  obras: string[];
  materials: string[];
};

function vehicleKey(row: { prefix: string; vehicleId: string; plate: string }) {
  return row.prefix || row.vehicleId || row.plate || "Sem identificação";
}

function uniq(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort();
}

function dateOnly(iso: string) {
  return iso ? iso.slice(0, 10) : "";
}

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fileIcon(type: ParsedUploadResult["type"]) {
  if (type === "trips") return "local_shipping";
  if (type === "fueling") return "local_gas_station";
  if (type === "pde") return "assignment";
  return "help";
}

function filePeriod(rows: Array<{ datetime: string }>) {
  const dates = rows
    .map((row) => row.datetime)
    .filter(Boolean)
    .sort();
  if (dates.length === 0) return "—";
  return `${dateOnly(dates[0])} até ${dateOnly(dates[dates.length - 1])}`;
}

export function CarcaraImportDialog({
  onClose,
  onSuccess,
  onCreatingChange,
  isSynchronizing = false,
  syncLabel,
  userName,
}: {
  onClose: () => void;
  onSuccess: (analysisId: string) => Promise<void> | void;
  onCreatingChange?: (isCreating: boolean) => void;
  isSynchronizing?: boolean;
  syncLabel?: string;
  userName?: string;
}) {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<AnalysisDraft>({
    name: "",
    obra: "",
    material: "",
    dateStart: "",
    dateEnd: "",
    swellFactor: "0.3",
  });
  const [arquivoRCO, setArquivoRCO] = useState<FileItem | null>(null);
  const [arquivoCMB, setArquivoCMB] = useState<FileItem | null>(null);
  const [arquivoPDE, setArquivoPDE] = useState<FileItem | null>(null);
  const [arquivoPendente, setArquivoPendente] = useState<PendingManualFile | null>(null);
  const [pdeFallback, setPdeFallback] = useState<PdeFallbackState | null>(null);
  const [manualPdeOpen, setManualPdeOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = creating || isSynchronizing;
  const busyLabel = isSynchronizing ? (syncLabel ?? "Sincronizando analise...") : "Criando...";

  const factor = Number.parseFloat(draft.swellFactor.replace(",", "."));
  const validFactor = Number.isFinite(factor) && factor >= 0;

  const trips = useMemo(() => {
    return arquivoRCO?.result.type === "trips" ? arquivoRCO.result.rows : [];
  }, [arquivoRCO]);
  const fueling = useMemo(() => {
    return arquivoCMB?.result.type === "fueling" ? arquivoCMB.result.rows : [];
  }, [arquivoCMB]);
  const dailyParts = useMemo(() => {
    return arquivoPDE?.result.type === "pde" ? arquivoPDE.result.rows : [];
  }, [arquivoPDE]);
  const rawTrips = trips;
  const rawFueling = fueling;
  const rawPde = dailyParts;

  const hasRco = arquivoRCO?.result.type === "trips";
  const hasCmb = arquivoCMB?.result.type === "fueling";
  const hasPde = arquivoPDE?.result.type === "pde";

  const parseErrors = useMemo(
    () =>
      [
        arquivoRCO?.result.type === "unknown" ? arquivoRCO.result.message : "",
        arquivoCMB?.result.type === "unknown" ? arquivoCMB.result.message : "",
        arquivoPDE?.result.type === "unknown" ? arquivoPDE.result.message : "",
      ].filter(Boolean),
    [arquivoCMB, arquivoPDE, arquivoRCO],
  );

  const preview = useMemo<Preview | null>(() => {
    if (!validFactor || !hasRco || !hasCmb || !hasPde) {
      return null;
    }
    const pdeRowsUsed = rawPde;
    const pdeKeys = new Set(pdeRowsUsed.map((row) => `${row.fleet}|${row.date}`));
    const pdePending = rawFueling
      .map((row) => {
        const fleet = normalizeFleet(row.prefix || row.vehicleId || row.plate);
        const date = normalizeDateKey(row.datetime);
        return pdeKeys.has(`${fleet}|${date}`) ? "" : `${fleet} em ${date}`;
      })
      .filter(Boolean);
    const allDates = [
      ...rawTrips.map((row) => row.datetime),
      ...rawFueling.map((row) => row.datetime),
    ]
      .filter(Boolean)
      .sort();
    const looseM3 = rawTrips.reduce((sum, row) => sum + row.cubicMLoose, 0);
    return {
      trips: rawTrips,
      fueling: rawFueling,
      looseM3,
      compactedM3: calculateCompactedM3(looseM3, factor),
      liters: rawFueling.reduce((sum, row) => sum + row.liters, 0),
      fuelCost: rawFueling.reduce((sum, row) => sum + row.total, 0),
      pdeRows: rawPde,
      pdeRowsUsed,
      pdeHoursUsed: pdeRowsUsed.reduce((sum, row) => sum + row.hours, 0),
      pdeFleets: uniq(rawPde.map((row) => row.fleet)),
      pdeFleetsUsed: uniq(pdeRowsUsed.map((row) => row.fleet)),
      pdePending: uniq(pdePending),
      dateStart: dateOnly(allDates[0] ?? ""),
      dateEnd: dateOnly(allDates[allDates.length - 1] ?? ""),
      equipments: uniq([...rawTrips.map(vehicleKey), ...rawFueling.map(vehicleKey)]),
      obras: uniq([...rawTrips.map((row) => row.obra), ...rawFueling.map((row) => row.obra)]),
      materials: uniq(rawTrips.map((row) => row.material)),
    };
  }, [factor, hasCmb, hasPde, hasRco, rawFueling, rawPde, rawTrips, validFactor]);

  const cmbRequiredFleets = useMemo(
    () => extractRequiredFleets({ fueling: fueling.length > 0 ? fueling : undefined }),
    [fueling],
  );

  function buildPdeOptions(overrideFueling?: ParsedFueling[]) {
    const fuelingRows = overrideFueling ?? (fueling.length > 0 ? fueling : undefined);
    const fleets = extractRequiredFleets({ fueling: fuelingRows });
    const range = extractDateRangeFromFueling(fuelingRows);
    return {
      requiredFleets: fleets.size > 0 ? fleets : undefined,
      dateFrom: range?.dateFrom ?? draft.dateStart,
      dateTo: range?.dateTo ?? draft.dateEnd,
    };
  }

  useEffect(() => {
    if (rawTrips.length === 0 && rawFueling.length === 0) return;
    const dates = [...rawTrips, ...rawFueling]
      .map((row) => normalizeDateKey(row.datetime))
      .filter(Boolean)
      .sort();
    const firstObra =
      rawTrips.find((row) => row.obra.trim())?.obra ||
      rawFueling.find((row) => row.obra.trim())?.obra ||
      "";
    const firstMaterial = rawTrips.find((row) => row.material.trim())?.material || "";

    setDraft((prev) => {
      const next = { ...prev };
      if (!next.dateStart && dates[0]) next.dateStart = dates[0];
      if (!next.dateEnd && dates[dates.length - 1]) next.dateEnd = dates[dates.length - 1];
      if (!next.obra.trim() && firstObra) next.obra = firstObra;
      if (!next.material.trim() && firstMaterial) next.material = firstMaterial;
      return next.dateStart !== prev.dateStart ||
        next.dateEnd !== prev.dateEnd ||
        next.obra !== prev.obra ||
        next.material !== prev.material
        ? next
        : prev;
    });
  }, [rawFueling, rawTrips]);

  const contextValid = Boolean(
    draft.name.trim() &&
    draft.obra.trim() &&
    draft.material.trim() &&
    draft.dateStart &&
    draft.dateEnd &&
    validFactor,
  );
  const canGoPreview = contextValid && hasRco && hasCmb && hasPde && parseErrors.length === 0;
  const canGoConfirm = canGoPreview && !!preview;

  function canAccessStep(targetStep: number) {
    if (targetStep <= 1) return true;
    if (targetStep === 2) return contextValid;
    if (targetStep === 3) return canGoPreview;
    return canGoConfirm;
  }

  function applyParsedFile(item: FileItem, rcoAtual: FileItem | null, cmbAtual: FileItem | null) {
    if (item.result.type === "trips") {
      if (rcoAtual) {
        toast.error("Já existe uma planilha RCO carregada");
        return { rco: rcoAtual, cmb: cmbAtual };
      }
      return { rco: item, cmb: cmbAtual };
    }
    if (item.result.type === "fueling") {
      if (cmbAtual) {
        toast.error("Já existe uma planilha CMB carregada");
        return { rco: rcoAtual, cmb: cmbAtual };
      }
      return { rco: rcoAtual, cmb: item };
    }
    if (item.result.type === "unknown") {
      setArquivoPendente({ file: item.file, reason: item.result.message });
    }
    return { rco: rcoAtual, cmb: cmbAtual };
  }

  async function replaceSlotFile(file: File, target: UploadSlot) {
    if (!file.name.match(/\.xlsx$/i)) {
      toast.error("Arquivo inválido. Selecione uma planilha XLSX.");
      return;
    }

    try {
      if (target === "rco") {
        const result = await parseCarcaraFile(file, "trips");
        if (result.type !== "trips" || result.rows.length === 0) {
          toast.error("Não foi possível ler viagens RCO neste arquivo.");
          return;
        }
        setArquivoRCO({ file, result });
        toast.success("Planilha RCO carregada");
        return;
      }

      if (target === "cmb") {
        const result = await parseCarcaraFile(file, "fueling");
        if (result.type !== "fueling" || result.rows.length === 0) {
          toast.error("Não foi possível ler abastecimentos CMB neste arquivo.");
          return;
        }
        setArquivoCMB({ file, result });
        toast.success("Planilha CMB carregada");
        return;
      }

      if (!arquivoCMB) {
        toast.info(
          "Suba o CMB (abastecimento) primeiro para filtrar a PDE automaticamente. Processando PDE completa...",
        );
      }
      const parsed = await parsePdeFileInWorker(file, undefined, buildPdeOptions());
      if (parsed.rows.length > 0) {
        setArquivoPDE({
          file,
          result: { type: "pde", rows: parsed.rows, warnings: parsed.warnings },
        });
        toast.success("Planilha PDE carregada");
        return;
      }
      setPdeFallback({
        file,
        reason: parsed.warnings[0]?.reason || "Não foi possível encontrar horas na Parte Diária.",
        startRow: "2",
        dateColumn: "A",
        hoursColumn: "B",
        fleetColumn: "",
        obraColumn: "",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao ler arquivo.");
    }
  }

  async function handleFileSelect(target: UploadSlot, file: File) {
    await replaceSlotFile(file, target);
  }

  async function handleSelected(selected: FileList) {
    if (selected.length === 0) return;

    let rcoAtual = arquivoRCO;
    let cmbAtual = arquivoCMB;
    let pdeAtual = arquivoPDE;

    for (const file of Array.from(selected)) {
      if (!file.name.match(/\.xlsx$/i)) {
        toast.error("Arquivo inválido. Selecione uma planilha XLSX.");
        continue;
      }

      try {
        const result = await parseCarcaraFile(file);
        if (result.type === "unknown") {
          if (!cmbAtual) {
            toast.info(
              "Suba o CMB (abastecimento) primeiro para filtrar a PDE automaticamente. Processando PDE completa...",
            );
          }
          const cmbFueling = cmbAtual?.result.type === "fueling" ? cmbAtual.result.rows : undefined;
          const pdeRows = await parsePdeFileInWorker(file, undefined, buildPdeOptions(cmbFueling));
          if (pdeRows.rows.length > 0) {
            if (pdeAtual) {
              toast.error("Já existe uma planilha PDE carregada");
            } else {
              pdeAtual = {
                file,
                result: { type: "pde", rows: pdeRows.rows, warnings: pdeRows.warnings },
              };
            }
          } else {
            setArquivoPendente({ file, reason: result.message });
          }
        } else {
          const next = applyParsedFile({ file, result }, rcoAtual, cmbAtual);
          rcoAtual = next.rco;
          cmbAtual = next.cmb;
        }
      } catch (err) {
        setArquivoPendente({
          file,
          reason: err instanceof Error ? err.message : "Erro ao ler arquivo.",
        });
      }
    }

    setArquivoRCO(rcoAtual);
    setArquivoCMB(cmbAtual);
    setArquivoPDE(pdeAtual);
  }

  async function forceType(type: CarcaraFileType | "pde") {
    if (!arquivoPendente) return;
    const file = arquivoPendente.file;
    if (type === "trips" && arquivoRCO) {
      toast.error("Já existe uma planilha RCO carregada");
      setArquivoPendente(null);
      return;
    }
    if (type === "fueling" && arquivoCMB) {
      toast.error("Já existe uma planilha CMB carregada");
      setArquivoPendente(null);
      return;
    }
    if (type === "pde" && arquivoPDE) {
      toast.error("Já existe uma planilha PDE carregada");
      setArquivoPendente(null);
      return;
    }

    try {
      if (type === "pde") {
        if (!arquivoCMB) {
          toast.info(
            "Suba o CMB (abastecimento) primeiro para filtrar a PDE automaticamente. Processando PDE completa...",
          );
        }
        const parsed = await parsePdeFileInWorker(file, undefined, buildPdeOptions());
        if (parsed.rows.length > 0) {
          setArquivoPDE({
            file,
            result: { type: "pde", rows: parsed.rows, warnings: parsed.warnings },
          });
        } else {
          setPdeFallback({
            file,
            reason:
              parsed.warnings[0]?.reason || "Não foi possível encontrar horas na Parte Diária.",
            startRow: "2",
            dateColumn: "A",
            hoursColumn: "B",
            fleetColumn: "",
            obraColumn: "",
          });
        }
      } else {
        const result = await parseCarcaraFile(file, type);
        if (result.type === "trips") setArquivoRCO({ file, result });
        else if (result.type === "fueling") setArquivoCMB({ file, result });
        else toast.error(result.message);
      }
      setArquivoPendente(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao reler arquivo.");
      setArquivoPendente(null);
    }
  }

  async function applyPdeFallback() {
    if (!pdeFallback) return;
    const mapping: PdeColumnMapping = {
      startRow: Number.parseInt(pdeFallback.startRow, 10) || 2,
      dateColumn: pdeFallback.dateColumn,
      hoursColumn: pdeFallback.hoursColumn,
      fleetColumn: pdeFallback.fleetColumn || undefined,
      obraColumn: pdeFallback.obraColumn || undefined,
    };
    try {
      const parsed = await parsePdeFileInWorker(pdeFallback.file, mapping, buildPdeOptions());
      if (parsed.rows.length === 0) {
        toast.error(
          parsed.warnings[0]?.reason || "Não foi possível identificar datas válidas nesta aba.",
        );
        return;
      }
      setArquivoPDE({
        file: pdeFallback.file,
        result: { type: "pde", rows: parsed.rows, warnings: parsed.warnings },
      });
      setPdeFallback(null);
      setArquivoPendente(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao aplicar fallback da PDE.");
    }
  }

  async function handleCreate() {
    if (!preview || !canGoConfirm) return;
    setCreating(true);
    onCreatingChange?.(true);
    try {
      const result = await createAnalysis({
        data: {
          name: draft.name,
          obra: draft.obra,
          material: draft.material,
          dateStart: draft.dateStart,
          dateEnd: draft.dateEnd,
          swellFactor: factor,
          createdBy: userName,
          tripsRows: rawTrips,
          fuelingRows: rawFueling,
          dailyPartRows: rawPde,
        },
      });
      await onSuccess(result.analysisId);
      toast.success("Análise criada", {
        description: `${result.trips} viagens, ${result.fueling} abastecimentos e ${result.dailyParts} apontamentos PDE usados.`,
      });
      onClose();
    } catch (err) {
      toast.error("Erro ao criar análise", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    } finally {
      onCreatingChange?.(false);
      setCreating(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto !flex flex-col p-0 gap-0">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-3">
          <DialogTitle>Criar Análise</DialogTitle>
          <DialogDescription>
            Informe o contexto, envie RCO, CMB e Parte Diária, confira o preview e confirme.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="flex gap-2 mb-4">
            {["Dados", "Planilhas", "Preview", "Confirmar"].map((label, index) => {
              const targetStep = index + 1;
              const enabled = canAccessStep(targetStep);
              return (
                <button
                  type="button"
                  key={label}
                  disabled={!enabled}
                  onClick={() => {
                    if (enabled) setStep(targetStep);
                  }}
                  className={`flex-1 rounded border px-3 py-2 text-left text-xs font-black uppercase tracking-widest transition-colors ${
                    step === index + 1
                      ? "border-primary bg-primary/10 text-primary"
                      : enabled
                        ? "border-border-low text-on-surface-variant hover:border-primary/60 hover:text-on-surface"
                        : "border-border-low text-on-surface-variant/40"
                  }`}
                >
                  {index + 1}. {label}
                </button>
              );
            })}
          </div>

          {step === 1 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-xs font-bold">
                Nome da análise
                <input
                  value={draft.name}
                  onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                  className="mt-1 w-full rounded border border-border-low bg-surface-highest px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                />
              </label>
              <label className="text-xs font-bold">
                Obra
                <input
                  value={draft.obra}
                  onChange={(e) => setDraft((prev) => ({ ...prev, obra: e.target.value }))}
                  className="mt-1 w-full rounded border border-border-low bg-surface-highest px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                />
              </label>
              <label className="text-xs font-bold">
                Material
                <input
                  value={draft.material}
                  onChange={(e) => setDraft((prev) => ({ ...prev, material: e.target.value }))}
                  className="mt-1 w-full rounded border border-border-low bg-surface-highest px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                />
              </label>
              <label className="text-xs font-bold">
                Fator de empolamento padrão
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.swellFactor}
                  onChange={(e) => setDraft((prev) => ({ ...prev, swellFactor: e.target.value }))}
                  className="mt-1 w-full rounded border border-border-low bg-surface-highest px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                />
              </label>
              <label className="text-xs font-bold">
                Início do período analisado
                <input
                  type="date"
                  value={draft.dateStart}
                  onChange={(e) => setDraft((prev) => ({ ...prev, dateStart: e.target.value }))}
                  className="mt-1 w-full rounded border border-border-low bg-surface-highest px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                />
              </label>
              <label className="text-xs font-bold">
                Fim do período analisado
                <input
                  type="date"
                  value={draft.dateEnd}
                  onChange={(e) => setDraft((prev) => ({ ...prev, dateEnd: e.target.value }))}
                  className="mt-1 w-full rounded border border-border-low bg-surface-highest px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                />
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  dragging
                    ? "border-primary bg-primary/5"
                    : "border-border-low hover:border-primary/50 hover:bg-surface-highest/40"
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  handleSelected(e.dataTransfer.files);
                }}
                onClick={() => inputRef.current?.click()}
              >
                <Icon name="upload_file" className="text-4xl text-on-surface-variant/50 mb-3" />
                <p className="text-sm font-black">Arraste RCO, CMB e PDE aqui</p>
                <p className="text-xs text-on-surface-variant mt-1">
                  ou clique para selecionar os 3 XLSX
                </p>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) handleSelected(e.target.files);
                    e.currentTarget.value = "";
                  }}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <UploadCard
                  title="Planilha RCO"
                  loadedLabel="RCO carregado"
                  emptyLabel="Aguardando planilha de viagens/produção"
                  item={arquivoRCO}
                  uploadType="rco"
                  onFileSelect={handleFileSelect}
                  onRemove={() => setArquivoRCO(null)}
                />
                <UploadCard
                  title="Planilha CMB"
                  loadedLabel="CMB carregado"
                  emptyLabel="Aguardando planilha de abastecimentos/consumo"
                  item={arquivoCMB}
                  uploadType="cmb"
                  onFileSelect={handleFileSelect}
                  onRemove={() => setArquivoCMB(null)}
                />
                <div>
                  <UploadCard
                    title="Planilha PDE"
                    loadedLabel="PDE carregada"
                    emptyLabel="Aguardando Parte Diária de Equipamentos"
                    item={arquivoPDE}
                    uploadType="pde"
                    onFileSelect={handleFileSelect}
                    onRemove={() => setArquivoPDE(null)}
                  />
                  {arquivoPDE && cmbRequiredFleets.size > 0 && (
                    <p className="text-xs text-on-surface-variant mt-1 px-1">
                      Filtrado para {cmbRequiredFleets.size} frota(s) própria(s) identificada(s) no
                      CMB
                    </p>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-2 px-1">
                    <span className="text-[10px] text-on-surface-variant">
                      Sem planilha PDE? Use a entrada manual simplificada.
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => setManualPdeOpen(true)}
                      disabled={!!arquivoPDE}
                    >
                      <Icon name="edit_note" className="text-base mr-1" />
                      Inserir manualmente
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 text-xs">
                <span className={arquivoRCO ? "text-status-success" : "text-on-surface-variant"}>
                  {arquivoRCO ? "✓ RCO carregado" : "RCO pendente"}
                </span>
                <span className={arquivoCMB ? "text-status-success" : "text-on-surface-variant"}>
                  {arquivoCMB ? "✓ CMB carregado" : "CMB pendente"}
                </span>
                <span className={arquivoPDE ? "text-status-success" : "text-on-surface-variant"}>
                  {arquivoPDE ? "✓ PDE carregada" : "PDE pendente"}
                </span>
              </div>
            </div>
          )}

          {step === 3 && preview && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  ["Viagens encontradas", preview.trips.length],
                  ["Volume solto total", `${preview.looseM3.toFixed(2)} m³`],
                  ["Volume compactado estimado", `${preview.compactedM3.toFixed(2)} m³`],
                  ["Abastecimentos", preview.fueling.length],
                  ["Litros totais", `${preview.liters.toFixed(0)} L`],
                  ["Custo diesel", `R$ ${fmtBRL(preview.fuelCost)}`],
                  ["Horas PDE usadas", `${preview.pdeHoursUsed.toFixed(1)} h`],
                  ["Frotas PDE usadas", preview.pdeFleetsUsed.length],
                  ["Pendências PDE", preview.pdePending.length],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded border border-border-low bg-surface-highest p-3"
                  >
                    <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-black">
                      {label}
                    </p>
                    <p className="text-lg font-black mt-1">{value}</p>
                  </div>
                ))}
              </div>
              {preview.trips.length > 0 && preview.looseM3 === 0 && (
                <div className="rounded border border-status-warning/30 bg-status-warning/5 p-3 text-xs">
                  RCO não possui coluna de volume m³ identificada. Produção m³ ficará zerada.
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="rounded border border-border-low p-3">
                  <p className="font-black uppercase tracking-widest text-on-surface-variant text-[10px]">
                    Período encontrado
                  </p>
                  <p className="mt-1">
                    {preview.dateStart || "—"} até {preview.dateEnd || "—"}
                  </p>
                </div>
                <div className="rounded border border-border-low p-3">
                  <p className="font-black uppercase tracking-widest text-on-surface-variant text-[10px]">
                    Equipamentos encontrados
                  </p>
                  <p className="mt-1">{preview.equipments.slice(0, 8).join(", ") || "—"}</p>
                </div>
                <div className="rounded border border-border-low p-3">
                  <p className="font-black uppercase tracking-widest text-on-surface-variant text-[10px]">
                    PDE
                  </p>
                  <p className="mt-1">
                    {preview.pdeFleets.length} frotas encontradas · {preview.pdeFleetsUsed.length}{" "}
                    usadas
                  </p>
                </div>
                <div className="rounded border border-border-low p-3">
                  <p className="font-black uppercase tracking-widest text-on-surface-variant text-[10px]">
                    Pendências de datas/frotas
                  </p>
                  <p className="mt-1">{preview.pdePending.slice(0, 4).join(", ") || "Nenhuma"}</p>
                </div>
                <div className="rounded border border-border-low p-3">
                  <p className="font-black uppercase tracking-widest text-on-surface-variant text-[10px]">
                    Obras encontradas
                  </p>
                  <p className="mt-1">{preview.obras.join(", ") || "—"}</p>
                </div>
                <div className="rounded border border-border-low p-3">
                  <p className="font-black uppercase tracking-widest text-on-surface-variant text-[10px]">
                    Materiais encontrados
                  </p>
                  <p className="mt-1">{preview.materials.join(", ") || "—"}</p>
                </div>
              </div>
            </div>
          )}

          {step === 3 && !preview && (
            <div className="rounded border border-status-warning/30 bg-status-warning/5 p-4 text-sm">
              Envie planilhas RCO, CMB e PDE válidas para gerar o preview.
            </div>
          )}

          {step === 4 && preview && (
            <div className="rounded border border-border-low p-5">
              <p className="text-sm font-black">Confirmar criação da análise</p>
              <p className="text-xs text-on-surface-variant mt-2">
                {draft.name} · {draft.obra} · {draft.material} · fator {factor.toFixed(2)}
              </p>
              <p className="text-xs text-on-surface-variant mt-1">
                Serão vinculadas {preview.trips.length} viagens, {preview.fueling.length}{" "}
                abastecimentos e {preview.pdeRowsUsed.length} apontamentos PDE usados a uma nova
                análise independente.
              </p>
            </div>
          )}

          {step === 4 && !preview && (
            <div className="rounded border border-status-warning/30 bg-status-warning/5 p-4 text-sm">
              Volte ao preview e confira as planilhas antes de confirmar.
            </div>
          )}

        </div>

        <DialogFooter className="sticky bottom-0 z-20 bg-surface border-t border-border-low p-4">
          {busy && (
            <span className="mr-auto self-center text-xs text-on-surface-variant">
              {busyLabel}
            </span>
          )}
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant="outline"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={busy || step === 1}
          >
            Voltar
          </Button>
          <Button variant="outline" onClick={() => setStep(3)} disabled={busy || !canGoPreview}>
            Preview
          </Button>
          {step < 4 ? (
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={
                busy ||
                (step === 1 && !contextValid) ||
                (step === 2 && !canGoPreview) ||
                (step === 3 && !canGoConfirm)
              }
            >
              Avançar
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setStep(4)} disabled>
              Avançar
            </Button>
          )}
          <Button
            onClick={step === 4 ? handleCreate : () => setStep(4)}
            disabled={busy || !canGoConfirm}
          >
            {busy ? busyLabel : step === 4 ? "Criar análise" : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>

      {arquivoPendente && (
        <Dialog open onOpenChange={() => setArquivoPendente(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Qual o tipo desta planilha?</DialogTitle>
              <DialogDescription>
                {arquivoPendente.file.name}
                {arquivoPendente.reason ? ` · ${arquivoPendente.reason}` : ""}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => forceType("trips")} disabled={!!arquivoRCO}>
                RCO
              </Button>
              <Button
                variant="outline"
                onClick={() => forceType("fueling")}
                disabled={!!arquivoCMB}
              >
                CMB
              </Button>
              <Button variant="outline" onClick={() => forceType("pde")} disabled={!!arquivoPDE}>
                PDE
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <ManualPdeDialog
        open={manualPdeOpen}
        onClose={() => setManualPdeOpen(false)}
        onConfirm={(rows) => {
          const synthetic = new File([""], "PDE-manual.txt", { type: "text/plain" });
          setArquivoPDE({
            file: synthetic,
            result: { type: "pde", rows, warnings: [] },
          });
        }}
        cmbFleets={cmbRequiredFleets}
        fueling={rawFueling}
        defaultDate={draft.dateStart}
        defaultObra={draft.obra}
      />

      {pdeFallback && (
        <Dialog open onOpenChange={() => setPdeFallback(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Configurar leitura da PDE</DialogTitle>
              <DialogDescription>
                {pdeFallback.file.name} · {pdeFallback.reason}
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <label className="font-bold">
                Linha inicial
                <input
                  value={pdeFallback.startRow}
                  onChange={(e) =>
                    setPdeFallback((prev) => prev && { ...prev, startRow: e.target.value })
                  }
                  className="mt-1 w-full rounded border border-border-low bg-surface-highest px-3 py-2"
                />
              </label>
              <label className="font-bold">
                Coluna da data
                <input
                  value={pdeFallback.dateColumn}
                  onChange={(e) =>
                    setPdeFallback((prev) => prev && { ...prev, dateColumn: e.target.value })
                  }
                  className="mt-1 w-full rounded border border-border-low bg-surface-highest px-3 py-2"
                />
              </label>
              <label className="font-bold">
                Coluna das horas
                <input
                  value={pdeFallback.hoursColumn}
                  onChange={(e) =>
                    setPdeFallback((prev) => prev && { ...prev, hoursColumn: e.target.value })
                  }
                  className="mt-1 w-full rounded border border-border-low bg-surface-highest px-3 py-2"
                />
              </label>
              <label className="font-bold">
                Coluna da frota
                <input
                  value={pdeFallback.fleetColumn}
                  onChange={(e) =>
                    setPdeFallback((prev) => prev && { ...prev, fleetColumn: e.target.value })
                  }
                  placeholder="opcional"
                  className="mt-1 w-full rounded border border-border-low bg-surface-highest px-3 py-2"
                />
              </label>
              <label className="font-bold">
                Coluna da obra
                <input
                  value={pdeFallback.obraColumn}
                  onChange={(e) =>
                    setPdeFallback((prev) => prev && { ...prev, obraColumn: e.target.value })
                  }
                  placeholder="opcional"
                  className="mt-1 w-full rounded border border-border-low bg-surface-highest px-3 py-2"
                />
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPdeFallback(null)}>
                Cancelar
              </Button>
              <Button onClick={applyPdeFallback}>Aplicar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}

function UploadCard({
  title,
  loadedLabel,
  emptyLabel,
  item,
  uploadType,
  onFileSelect,
  onRemove,
}: {
  title: string;
  loadedLabel: string;
  emptyLabel: string;
  item: FileItem | null;
  uploadType: UploadSlot;
  onFileSelect: (type: UploadSlot, file: File) => void;
  onRemove: () => void;
}) {
  const cardInputRef = useRef<HTMLInputElement>(null);
  const rows: ParsedTrip[] = item?.result.type === "trips" ? item.result.rows : [];
  const abastecimentos: ParsedFueling[] = item?.result.type === "fueling" ? item.result.rows : [];
  const partes: ParsedDailyPart[] = item?.result.type === "pde" ? item.result.rows : [];
  const liters = abastecimentos.reduce((sum, row) => sum + row.liters, 0);
  const equipamentos = uniq(abastecimentos.map(vehicleKey));
  const obras = uniq(rows.map((row) => row.obra));
  const pdeFrotas = uniq(partes.map((row) => row.fleet));
  const pdeHoras = partes.reduce((sum, row) => sum + row.hours, 0);

  return (
    <div
      className={`rounded border p-3 min-h-[180px] ${
        item ? "border-status-success/40 bg-status-success/5" : "border-border-low"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
            {title}
          </p>
          <p
            className={`mt-1 text-xs font-bold ${item ? "text-status-success" : "text-on-surface-variant"}`}
          >
            {item ? `✓ ${loadedLabel}` : emptyLabel}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <input
            ref={cardInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFileSelect(uploadType, file);
              e.currentTarget.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={(e) => {
              e.stopPropagation();
              cardInputRef.current?.click();
            }}
          >
            {item ? "Enviar novamente" : "Selecionar"}
          </Button>
          {item && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={onRemove}
            >
              Remover
            </Button>
          )}
        </div>
      </div>

      {!item ? (
        <div className="mt-6 flex items-center justify-center text-xs text-on-surface-variant">
          Nenhum arquivo carregado
        </div>
      ) : (
        <div className="mt-4 space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <Icon name={fileIcon(item.result.type)} className="text-on-surface-variant" />
            <span className="font-bold truncate">{item.file.name}</span>
          </div>
          {item.result.type === "trips" && (
            <>
              <p>{rows.length} viagens</p>
              <p>Período: {filePeriod(rows)}</p>
              <p className="text-on-surface-variant">
                Obras: {obras.slice(0, 4).join(", ") || "—"}
              </p>
            </>
          )}
          {item.result.type === "fueling" && (
            <>
              <p>{abastecimentos.length} abastecimentos</p>
              <p>Litros totais: {liters.toFixed(0)} L</p>
              <p className="text-on-surface-variant">
                Equipamentos: {equipamentos.slice(0, 4).join(", ") || "—"}
              </p>
            </>
          )}
          {item.result.type === "pde" && (
            <>
              <p>{partes.length} apontamentos de horas</p>
              <p>Horas totais: {pdeHoras.toFixed(1)} h</p>
              <p>Inconsistências: {item.result.warnings.length}</p>
              <p className="text-on-surface-variant">
                Frotas: {pdeFrotas.slice(0, 4).join(", ") || "—"}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
