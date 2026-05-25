/**
 * Componentes para gerenciar e selecionar análises salvas
 * Suporta busca, filtros, e seleção múltipla
 */

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { DbProductionAnalysis } from "@/db/schema";

interface MyAnalysesDialogProps {
  isOpen: boolean;
  analyses: DbProductionAnalysis[];
  selectedIds: string[];
  onClose: () => void;
  onSelect: (ids: string[]) => void;
  onDelete?: (id: string) => Promise<void> | void;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function uniqueValues<T>(arr: T[]): T[] {
  return [...new Set(arr.filter(Boolean))].sort() as T[];
}

export function MyAnalysesDialog({
  isOpen,
  analyses,
  selectedIds,
  onClose,
  onSelect,
  onDelete,
}: MyAnalysesDialogProps) {
  const [obra, setObra] = useState("");
  const [material, setMaterial] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [draftIds, setDraftIds] = useState<string[]>(selectedIds);
  const [deletingId, setDeletingId] = useState("");

  useEffect(() => {
    if (isOpen) setDraftIds(selectedIds);
  }, [isOpen, selectedIds]);

  const obras = uniqueValues(analyses.map((a) => a.obra));
  const materials = uniqueValues(analyses.map((a) => a.material));

  const filtered = analyses.filter((analysis) => {
    if (obra && analysis.obra !== obra) return false;
    if (material && analysis.material !== material) return false;
    if (dateFrom && analysis.dateEnd < dateFrom) return false;
    if (dateTo && analysis.dateStart > dateTo) return false;
    return true;
  });

  const toggle = (id: string) => {
    setDraftIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  };

  const handleDelete = async (analysis: DbProductionAnalysis) => {
    if (!onDelete) return;
    const confirmed = window.confirm(
      `Excluir a analise "${analysis.name}" e as viagens vinculadas?`,
    );
    if (!confirmed) return;
    setDeletingId(analysis.id);
    try {
      await onDelete(analysis.id);
      setDraftIds((current) => current.filter((id) => id !== analysis.id));
    } finally {
      setDeletingId("");
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Minhas Análises</DialogTitle>
          <DialogDescription>
            Selecione uma ou mais análises para comparação, histórico ou abertura.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 py-3">
          <select
            value={obra}
            onChange={(e) => setObra(e.target.value)}
            className="rounded border border-border-low bg-surface-highest px-3 py-2 text-xs"
          >
            <option value="">Todas as obras</option>
            {obras.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>

          <select
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
            className="rounded border border-border-low bg-surface-highest px-3 py-2 text-xs"
          >
            <option value="">Todos materiais</option>
            {materials.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded border border-border-low bg-surface-highest px-3 py-2 text-xs"
          />

          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded border border-border-low bg-surface-highest px-3 py-2 text-xs"
          />
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => setDraftIds(filtered.map((analysis) => analysis.id))}
            disabled={filtered.length === 0}
          >
            Selecionar filtradas
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => setDraftIds([])}
            disabled={draftIds.length === 0}
          >
            Limpar
          </Button>
          <span className="self-center text-xs text-on-surface-variant ml-auto">
            {draftIds.length} selecionada(s)
          </span>
        </div>

        <div className="max-h-96 overflow-y-auto space-y-2 flex-1">
          {filtered.map((analysis) => (
            <div
              key={analysis.id}
              className={`w-full rounded border p-3 text-left transition-colors ${
                draftIds.includes(analysis.id)
                  ? "border-primary bg-primary/10"
                  : "border-border-low hover:bg-surface-highest"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={draftIds.includes(analysis.id)}
                    onChange={() => toggle(analysis.id)}
                    className="mt-1"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-black">{analysis.name}</span>
                    <span className="mt-1 block text-xs text-on-surface-variant">
                      {analysis.obra} · {analysis.material} · {formatDate(analysis.dateStart)} a{" "}
                      {formatDate(analysis.dateEnd)}
                    </span>
                  </span>
                </label>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-[10px] uppercase tracking-widest text-on-surface-variant">
                    {formatDate(analysis.createdAt)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      onSelect([analysis.id]);
                      onClose();
                    }}
                  >
                    Abrir
                  </Button>
                  {onDelete && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs text-status-error"
                      disabled={deletingId === analysis.id}
                      onClick={() => handleDelete(analysis)}
                    >
                      {deletingId === analysis.id ? "Excluindo..." : "Excluir"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <p className="py-8 text-center text-xs text-on-surface-variant">
              Nenhuma análise encontrada.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border-low pt-3">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              onSelect(draftIds);
              onClose();
            }}
            disabled={draftIds.length === 0}
          >
            Aplicar ({draftIds.length})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Painel de análises históricas para acumulado
 */
interface AnalysisHistoryPanelProps {
  analyses: DbProductionAnalysis[];
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
}

export function AnalysisHistoryPanel({
  analyses,
  selectedIds,
  onSelect,
}: AnalysisHistoryPanelProps) {
  return (
    <div className="rounded border border-border-low bg-surface-container p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[10px] font-black uppercase tracking-widest">Histórico Acumulado</h3>
          <p className="mt-1 text-xs text-on-surface-variant">
            Cada análise permanece disponível para acumulado, comparação e auditoria.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={() => onSelect(analyses.map((analysis) => analysis.id))}
          disabled={analyses.length === 0}
        >
          Todas
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border-low text-on-surface-variant">
              {["", "Análise", "Obra", "Material", "Período", "Criada em"].map((header) => (
                <th key={header} className="py-2 text-left font-black uppercase tracking-widest">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {analyses.map((analysis) => {
              const selected = selectedIds.includes(analysis.id);
              return (
                <tr key={analysis.id} className="border-b border-border-low/40">
                  <td className="py-2 pr-2">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() =>
                        onSelect(
                          selected
                            ? selectedIds.filter((id) => id !== analysis.id)
                            : [...selectedIds, analysis.id],
                        )
                      }
                    />
                  </td>
                  <td className="py-2 pr-4 font-semibold">{analysis.name}</td>
                  <td className="py-2 pr-4">{analysis.obra || "—"}</td>
                  <td className="py-2 pr-4">{analysis.material || "—"}</td>
                  <td className="py-2 pr-4">
                    {formatDate(analysis.dateStart)} a {formatDate(analysis.dateEnd)}
                  </td>
                  <td className="py-2 pr-4">{formatDate(analysis.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
