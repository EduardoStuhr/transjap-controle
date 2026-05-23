/**
 * ManualPdeDialog — entrada manual simplificada da PDE.
 * 1 linha por frota detectada no CMB (Set<string>); usuário digita total de horas.
 * Saída: ParsedDailyPart[] com `sourceSheet = "manual"`, datadas em `defaultDate`.
 */

import { useEffect, useMemo, useState } from "react";
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
import type { ParsedDailyPart, ParsedFueling } from "@/lib/carcara-parser";
import { normalizeFleet } from "@/lib/carcara-parser";

type Row = {
  fleet: string;
  fleetLabel: string;
  hours: string;
  obra: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (rows: ParsedDailyPart[]) => void;
  /** Frotas detectadas no CMB (priorizadas no topo) */
  cmbFleets: Set<string>;
  /** Linhas de CMB para inferir obra preferencial por frota */
  fueling: ParsedFueling[];
  /** Data a ser usada como referência (yyyy-mm-dd) — geralmente draft.dateStart */
  defaultDate: string;
  /** Obra padrão da análise (fallback quando o CMB não tem obra para a frota) */
  defaultObra: string;
};

function preferredObraByFleet(fueling: ParsedFueling[]): Map<string, string> {
  const map = new Map<string, string>();
  fueling.forEach((f) => {
    const key = normalizeFleet(f.prefix) || normalizeFleet(f.vehicleId) || normalizeFleet(f.plate);
    if (!key) return;
    if (!map.has(key) && f.obra) map.set(key, f.obra);
  });
  return map;
}

export function ManualPdeDialog({
  open,
  onClose,
  onConfirm,
  cmbFleets,
  fueling,
  defaultDate,
  defaultObra,
}: Props) {
  const obraByFleet = useMemo(() => preferredObraByFleet(fueling), [fueling]);

  const initialRows = useMemo<Row[]>(() => {
    const fleets = Array.from(cmbFleets).sort();
    if (fleets.length === 0) {
      return [{ fleet: "", fleetLabel: "", hours: "", obra: defaultObra }];
    }
    return fleets.map((f) => ({
      fleet: f,
      fleetLabel: f,
      hours: "",
      obra: obraByFleet.get(f) || defaultObra,
    }));
  }, [cmbFleets, obraByFleet, defaultObra]);

  const [rows, setRows] = useState<Row[]>(initialRows);

  // Reset ao reabrir
  useEffect(() => {
    if (open) setRows(initialRows);
  }, [open, initialRows]);

  function updateRow(idx: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function addEmptyRow() {
    setRows((prev) => [...prev, { fleet: "", fleetLabel: "", hours: "", obra: defaultObra }]);
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleConfirm() {
    if (!defaultDate) {
      toast.error("Defina a data inicial da análise antes de inserir PDE manual.");
      return;
    }
    const valid: ParsedDailyPart[] = [];
    const seen = new Set<string>();
    rows.forEach((r) => {
      const fleet = normalizeFleet(r.fleet);
      const hours = Number(String(r.hours).replace(",", "."));
      if (!fleet || !Number.isFinite(hours) || hours <= 0) return;
      const key = `${fleet}|${defaultDate}`;
      if (seen.has(key)) return;
      seen.add(key);
      valid.push({
        fleet,
        fleetLabel: r.fleetLabel || r.fleet || fleet,
        date: defaultDate,
        obra: (r.obra || defaultObra || "").trim(),
        hours,
        sourceSheet: "manual",
      });
    });
    if (valid.length === 0) {
      toast.error("Informe pelo menos uma frota com horas > 0.");
      return;
    }
    onConfirm(valid);
    toast.success(`${valid.length} apontamento(s) PDE manual(is) registrado(s).`);
    onClose();
  }

  const totalHoras = rows.reduce((sum, r) => {
    const h = Number(String(r.hours).replace(",", "."));
    return sum + (Number.isFinite(h) && h > 0 ? h : 0);
  }, 0);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Inserir PDE manualmente</DialogTitle>
          <DialogDescription>
            Total de horas trabalhadas por frota no período. Frotas pré-listadas vêm do CMB.
            {defaultDate && (
              <>
                {" "}
                Os apontamentos serão registrados na data{" "}
                <span className="mono tnum">{defaultDate}</span>.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[420px] overflow-y-auto rounded border border-border-low">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-high">
              <tr className="border-b border-border-low text-left">
                <th className="px-2 py-2 font-black uppercase tracking-wider">Frota</th>
                <th className="px-2 py-2 font-black uppercase tracking-wider">Obra</th>
                <th className="px-2 py-2 font-black uppercase tracking-wider text-right">Horas</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border-low/40">
                  <td className="px-2 py-1">
                    <input
                      value={r.fleet}
                      onChange={(e) =>
                        updateRow(i, { fleet: e.target.value, fleetLabel: e.target.value })
                      }
                      placeholder="ex: TR-22"
                      className="w-full rounded border border-border-low bg-surface-highest px-2 py-1 mono tnum"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      value={r.obra}
                      onChange={(e) => updateRow(i, { obra: e.target.value })}
                      placeholder="obra"
                      className="w-full rounded border border-border-low bg-surface-highest px-2 py-1"
                    />
                  </td>
                  <td className="px-2 py-1 text-right">
                    <input
                      value={r.hours}
                      onChange={(e) => updateRow(i, { hours: e.target.value })}
                      inputMode="decimal"
                      placeholder="0"
                      className="w-24 rounded border border-border-low bg-surface-highest px-2 py-1 text-right mono tnum"
                    />
                  </td>
                  <td className="px-2 py-1 w-10">
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      className="text-on-surface-variant hover:text-status-error"
                      aria-label="Remover linha"
                    >
                      <Icon name="close" className="text-base" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-xs">
          <Button variant="outline" size="sm" onClick={addEmptyRow}>
            <Icon name="add" className="text-base mr-1" />
            Adicionar frota
          </Button>
          <span className="text-on-surface-variant">
            Total: <span className="mono tnum font-bold">{totalHoras.toFixed(1)} h</span> ·{" "}
            {rows.filter((r) => Number(r.hours) > 0).length} frota(s)
          </span>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm}>Aplicar PDE manual</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
