import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AppLayout, Icon } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { authActions, useAuthStore } from "@/lib/auth-store";
import { isEduardoUser } from "@/lib/auth-users";
import {
  filterDieselFilterChanges,
  summarizeDieselFilterChanges,
  useDieselFilterActions,
  useDieselFilterChanges,
  type DieselFilterChangeDraft,
  type DieselFilterChangeFilters,
  type DieselFilterChangeWithHours,
} from "@/lib/diesel-filter-store";
import {
  exportDieselFilterChangesAsExcel,
  exportDieselFilterChangesAsPdf,
} from "@/lib/diesel-filter-export";
import { useEquipmentStore } from "@/lib/equipment-store";
import { buildEquipmentOptions, formatEquipmentReference } from "@/lib/operational-options";
import { formatBrDate } from "@/lib/utils";

export const Route = createFileRoute("/troca-filtros-diesel")({
  component: TrocaFiltrosDiesel,
});

type FormState = {
  date: string;
  primaryFilter: string;
  secondaryFilter: string;
  racor: string;
  brand: string;
  fleet: string;
  hourmeter: string;
  obra: string;
  responsible: string;
  notes: string;
};

const EMPTY_FILTERS: DieselFilterChangeFilters = {
  fleet: "",
  obra: "",
  date: "",
  responsible: "",
};

function todayLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function emptyForm(): FormState {
  return {
    date: todayLocalDate(),
    primaryFilter: "",
    secondaryFilter: "",
    racor: "",
    brand: "",
    fleet: "",
    hourmeter: "",
    obra: "",
    responsible: "",
    notes: "",
  };
}

function parseHourmeter(value: string) {
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function toDraft(form: FormState): DieselFilterChangeDraft {
  return {
    date: form.date,
    primaryFilter: form.primaryFilter,
    secondaryFilter: form.secondaryFilter,
    racor: form.racor,
    brand: form.brand,
    fleet: form.fleet,
    hourmeter: parseHourmeter(form.hourmeter),
    obra: form.obra,
    responsible: form.responsible,
    notes: form.notes,
  };
}

function formFromRow(row: DieselFilterChangeWithHours): FormState {
  return {
    date: row.date,
    primaryFilter: row.primaryFilter ?? "",
    secondaryFilter: row.secondaryFilter ?? "",
    racor: row.racor ?? "",
    brand: row.brand ?? "",
    fleet: row.fleet,
    hourmeter: String(row.hourmeter).replace(".", ","),
    obra: row.obra ?? "",
    responsible: row.responsible ?? "",
    notes: row.notes ?? "",
  };
}

function formatNumber(value: number | null) {
  if (value === null) return "-";
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 1,
  });
}

function getLatestIdsByFleet(rows: DieselFilterChangeWithHours[]) {
  const latest = new Map<string, DieselFilterChangeWithHours>();
  rows.forEach((row) => {
    const current = latest.get(row.fleet);
    if (
      !current ||
      row.date.localeCompare(current.date) > 0 ||
      (row.date === current.date && row.createdAt.localeCompare(current.createdAt) > 0)
    ) {
      latest.set(row.fleet, row);
    }
  });
  return new Set(Array.from(latest.values()).map((row) => row.id));
}

function moduleErrorDescription(error: unknown) {
  const message = error instanceof Error ? error.message.trim() : "";
  if (/401|sess[aã]o|unauthorized/i.test(message)) {
    return "Sua sessão expirou. Entre novamente para consultar e registrar as trocas.";
  }
  return message && message !== "HTTPError"
    ? message
    : "Verifique sua conexão e tente carregar os registros novamente.";
}

function TrocaFiltrosDiesel() {
  const navigate = useNavigate();
  const user = useAuthStore((snapshot) => snapshot.user);
  const hydrated = useAuthStore((snapshot) => snapshot.hydrated);
  const allowed = isEduardoUser(user);
  const equipments = useEquipmentStore((snapshot) => snapshot.equipments);
  const equipmentOptions = useMemo(() => buildEquipmentOptions(equipments), [equipments]);
  const {
    data: rows = [],
    isLoading,
    isFetching,
    error,
    refetch,
  } = useDieselFilterChanges(allowed);
  const actions = useDieselFilterActions();
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [editForm, setEditForm] = useState<FormState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<DieselFilterChangeFilters>(EMPTY_FILTERS);
  const [exportingExcel, setExportingExcel] = useState(false);

  useEffect(() => {
    if (!hydrated || allowed) return;
    toast.error("Acesso restrito", {
      description: "A tela Troca de Filtros Diesel está liberada apenas para Eduardo.",
    });
    void navigate({ to: "/" });
  }, [allowed, hydrated, navigate]);

  const visibleRows = useMemo(() => filterDieselFilterChanges(rows, filters), [filters, rows]);
  const summary = useMemo(() => summarizeDieselFilterChanges(rows), [rows]);
  const latestIds = useMemo(() => getLatestIdsByFleet(rows), [rows]);
  const groupedRows = useMemo(() => {
    const groups = new Map<string, DieselFilterChangeWithHours[]>();
    visibleRows.forEach((row) => {
      const current = groups.get(row.fleet) ?? [];
      current.push(row);
      groups.set(row.fleet, current);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [visibleRows]);

  if (!hydrated || !allowed) {
    return <div className="min-h-screen bg-background" />;
  }

  const setValue = (key: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const setFilter = (key: keyof DieselFilterChangeFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const resetForm = () => {
    setForm(emptyForm());
  };

  const closeEditDialog = () => {
    setEditForm(null);
    setEditingId(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const draft = toDraft(form);

    if (!draft.fleet.trim()) {
      toast.error("Frota obrigatória", { description: "Informe a frota do equipamento." });
      return;
    }
    if (!Number.isFinite(draft.hourmeter)) {
      toast.error("Horímetro inválido", { description: "Use número com vírgula ou ponto." });
      return;
    }

    try {
      await actions.create(draft);
      toast.success("Troca cadastrada", { description: form.fleet });
      resetForm();
    } catch (submitError) {
      toast.error("Não foi possível salvar", {
        description: submitError instanceof Error ? submitError.message : "Tente novamente.",
      });
    }
  };

  const editRow = (row: DieselFilterChangeWithHours) => {
    setEditingId(row.id);
    setEditForm(formFromRow(row));
  };

  const submitEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingId || !editForm) return;

    const draft = toDraft(editForm);
    if (!draft.fleet.trim()) {
      toast.error("Frota obrigatória", { description: "Informe a frota do equipamento." });
      return;
    }
    if (!Number.isFinite(draft.hourmeter)) {
      toast.error("Horímetro inválido", { description: "Use número com vírgula ou ponto." });
      return;
    }

    try {
      await actions.update({ id: editingId, patch: draft });
      toast.success("Troca atualizada", { description: editForm.fleet });
      closeEditDialog();
    } catch (submitError) {
      toast.error("Não foi possível salvar", {
        description: submitError instanceof Error ? submitError.message : "Tente novamente.",
      });
    }
  };

  const removeRow = async (row: DieselFilterChangeWithHours) => {
    if (!window.confirm(`Excluir troca da ${formatEquipmentReference(row.fleet, equipments)}?`)) {
      return;
    }

    try {
      await actions.remove(row.id);
      toast.success("Troca excluída");
      if (editingId === row.id) closeEditDialog();
    } catch (deleteError) {
      toast.error("Não foi possível excluir", {
        description: deleteError instanceof Error ? deleteError.message : "Tente novamente.",
      });
    }
  };

  const activeFilterDescription = [
    filters.fleet?.trim() ? `Frota: ${filters.fleet.trim()}` : "",
    filters.obra?.trim() ? `Obra: ${filters.obra.trim()}` : "",
    filters.date ? `Data: ${formatBrDate(filters.date)}` : "",
    filters.responsible?.trim() ? `Responsável: ${filters.responsible.trim()}` : "",
  ]
    .filter(Boolean)
    .join(" · ") || "Todos os registros visíveis";

  const viewPdf = () => {
    exportDieselFilterChangesAsPdf({
      rows: visibleRows,
      equipments,
      filterDescription: activeFilterDescription,
    });
  };

  const viewSpreadsheet = async () => {
    setExportingExcel(true);
    try {
      await exportDieselFilterChangesAsExcel({ rows: visibleRows, equipments });
      toast.success("Planilha gerada", {
        description: `${visibleRows.length} troca(s) incluída(s).`,
      });
    } catch (spreadsheetError) {
      toast.error("Não foi possível gerar a planilha", {
        description:
          spreadsheetError instanceof Error ? spreadsheetError.message : "Tente novamente.",
      });
    } finally {
      setExportingExcel(false);
    }
  };

  return (
    <AppLayout>
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.3em] text-primary">
            Módulo restrito
          </span>
          <h1 className="text-2xl font-black uppercase tracking-tight text-on-surface md:text-4xl">
            Troca de Filtros Diesel
          </h1>
          <p className="mt-2 max-w-3xl text-sm font-medium text-on-surface-variant">
            Controle por frota com cálculo automático do intervalo de horímetro entre trocas.
          </p>
        </div>
        <div className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-xs font-black uppercase tracking-widest text-primary">
          Visível somente para Eduardo
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-4">
        <Metric icon="filter_alt" label="Total de trocas" value={String(summary.totalChanges)} />
        <Metric
          icon="construction"
          label="Frotas acompanhadas"
          value={String(summary.trackedFleets)}
        />
        <Metric
          icon="speed"
          label="Maior intervalo"
          value={summary.maxInterval === null ? "-" : `${formatNumber(summary.maxInterval)} h`}
        />
        <Metric
          icon="warning"
          label="Próximas trocas"
          value={String(summary.upcomingChanges)}
          tone="warning"
          hint=">= 250h no último intervalo"
        />
      </div>

      <form
        onSubmit={submit}
        className="mb-6 rounded-xl border border-border-low bg-surface-container p-4 shadow-industrial"
      >
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-on-surface">
              Cadastrar nova troca
            </h2>
            <p className="mt-1 text-xs text-on-surface-variant">
              A diferença de horas aparece na tabela após salvar.
            </p>
          </div>
        </div>

        <DieselFilterFields form={form} setValue={setValue} />
        <datalist id="diesel-filter-fleet-options">
          {equipmentOptions.map((equipment) => (
            <option key={equipment.value} value={equipment.value}>
              {equipment.label}
            </option>
          ))}
        </datalist>
        <Button type="submit" className="mt-4 gap-2 font-black" isLoading={actions.isSaving}>
          <Icon name="save" />
          Cadastrar troca
        </Button>
      </form>

      <section className="mb-6 rounded-xl border border-border-low bg-surface-container p-4 shadow-industrial">
        <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest">Filtros</h2>
            <p className="mt-1 text-xs text-on-surface-variant">
              Use frota, obra, data ou responsável para reduzir a lista.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => setFilters(EMPTY_FILTERS)}>
            Limpar filtros
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Field
            label="Frota"
            value={filters.fleet ?? ""}
            onChange={(v) => setFilter("fleet", v)}
            placeholder="244 ou FR-244"
          />
          <Field label="Obra" value={filters.obra ?? ""} onChange={(v) => setFilter("obra", v)} />
          <Field
            label="Data"
            type="date"
            value={filters.date ?? ""}
            onChange={(v) => setFilter("date", v)}
          />
          <Field
            label="Responsável"
            value={filters.responsible ?? ""}
            onChange={(v) => setFilter("responsible", v)}
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-border-low bg-surface-container shadow-industrial">
        <div className="flex flex-col gap-3 border-b border-border-low bg-gradient-to-r from-[#ffd700] via-[#9fbe28] to-[#1f7a3a] px-4 py-3 text-black sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest">Planilha de trocas</h2>
            <p className="text-xs font-bold opacity-80">{visibleRows.length} registro(s) visível(is)</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={viewPdf}
              disabled={visibleRows.length === 0}
              className="bg-black/85 text-white hover:bg-black max-sm:w-full"
            >
              <Icon name="picture_as_pdf" />
              Visualizar PDF
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={viewSpreadsheet}
              disabled={visibleRows.length === 0}
              isLoading={exportingExcel}
              className="bg-black/85 text-white hover:bg-black max-sm:w-full"
            >
              <Icon name="table_view" />
              Visualizar Planilha
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-on-surface-variant">Carregando trocas...</div>
        ) : error ? (
          <div className="p-8 text-center">
            <Icon name="cloud_off" className="text-4xl text-status-error" />
            <p className="mt-3 text-sm font-black text-status-error">
              Não foi possível carregar este módulo.
            </p>
            <p className="mx-auto mt-2 max-w-lg text-xs text-on-surface-variant">
              {moduleErrorDescription(error)}
            </p>
            <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
              <Button
                type="button"
                onClick={() => void refetch()}
                isLoading={isFetching}
                className="gap-2 font-black"
              >
                <Icon name="refresh" />
                Tentar novamente
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  authActions.logout();
                  void navigate({ to: "/login", search: { redirect: "/troca-filtros-diesel" } });
                }}
                className="gap-2 font-black"
              >
                <Icon name="login" />
                Entrar novamente
              </Button>
            </div>
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="p-10 text-center">
            <Icon name="filter_alt_off" className="mb-2 text-4xl text-on-surface-variant/40" />
            <p className="text-sm font-bold text-on-surface">Nenhuma troca encontrada</p>
            <p className="mt-1 text-xs text-on-surface-variant">
              Cadastre a primeira troca ou ajuste os filtros.
            </p>
          </div>
        ) : (
          <>
          <div className="md:hidden">
            <MobileDieselFilterCards
              groupedRows={groupedRows}
              latestIds={latestIds}
              equipments={equipments}
              onEdit={editRow}
              onDelete={removeRow}
            />
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-[1120px] w-full border-collapse text-left text-sm">
              <thead className="bg-[#163f2c] text-[#ffd700]">
                <tr>
                  {[
                    "Data",
                    "Frota",
                    "Horímetro",
                    "Horas desde última troca",
                    "Filtro Primário",
                    "Filtro Secundário",
                    "Racor",
                    "Marca",
                    "Obra",
                    "Responsável",
                    "Observações",
                    "Ações",
                  ].map((heading) => (
                    <th key={heading} className="px-3 py-3 text-xs font-black uppercase tracking-widest">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupedRows.map(([fleet, fleetRows]) => (
                  <Fragment key={fleet}>
                    <tr className="bg-primary/10">
                      <td colSpan={12} className="px-3 py-2 text-xs font-black uppercase tracking-widest text-primary">
                        {formatEquipmentReference(fleet, equipments)}
                      </td>
                    </tr>
                    {fleetRows.map((row, index) => (
                      <DieselFilterRow
                        key={row.id}
                        row={row}
                        zebra={index % 2 === 1}
                        highlight={latestIds.has(row.id)}
                        equipments={equipments}
                        onEdit={editRow}
                        onDelete={removeRow}
                      />
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>

      <Dialog
        open={Boolean(editingId && editForm)}
        onOpenChange={(open) => {
          if (!open) closeEditDialog();
        }}
      >
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar troca de filtros diesel</DialogTitle>
          </DialogHeader>
          {editForm && (
            <form onSubmit={submitEdit}>
              <DieselFilterFields
                form={editForm}
                setValue={(key, value) =>
                  setEditForm((current) => (current ? { ...current, [key]: value } : current))
                }
              />
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={closeEditDialog}>
                  Cancelar
                </Button>
                <Button type="submit" className="gap-2 font-black" isLoading={actions.isSaving}>
                  <Icon name="save" />
                  Salvar edição
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function Metric({
  icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: string;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warning";
}) {
  return (
    <div className="rounded-xl border border-border-low bg-surface-container p-4 shadow-industrial">
      <Icon name={icon} className={tone === "warning" ? "text-status-warning" : "text-primary"} />
      <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
        {label}
      </p>
      <p className="mt-1 text-2xl font-black text-on-surface">{value}</p>
      {hint && <p className="mt-1 text-[10px] font-bold text-on-surface-variant">{hint}</p>}
    </div>
  );
}

function DieselFilterFields({
  form,
  setValue,
}: {
  form: FormState;
  setValue: (key: keyof FormState, value: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
      <Field
        label="Data"
        type="date"
        value={form.date}
        onChange={(value) => setValue("date", value)}
        required
      />
      <Field
        label="Frota"
        value={form.fleet}
        onChange={(value) => setValue("fleet", value)}
        list="diesel-filter-fleet-options"
        placeholder="Ex.: 244"
        required
      />
      <Field
        label="Horímetro"
        value={form.hourmeter}
        onChange={(value) => setValue("hourmeter", value)}
        placeholder="Ex.: 4652,1"
        inputMode="decimal"
        required
      />
      <Field label="Obra" value={form.obra} onChange={(value) => setValue("obra", value)} />
      <Field
        label="Responsável"
        value={form.responsible}
        onChange={(value) => setValue("responsible", value)}
      />
      <Field
        label="Filtro Primário"
        value={form.primaryFilter}
        onChange={(value) => setValue("primaryFilter", value)}
      />
      <Field
        label="Filtro Secundário"
        value={form.secondaryFilter}
        onChange={(value) => setValue("secondaryFilter", value)}
      />
      <Field label="Racor" value={form.racor} onChange={(value) => setValue("racor", value)} />
      <Field label="Marca" value={form.brand} onChange={(value) => setValue("brand", value)} />
      <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant xl:col-span-1">
        Observações
        <textarea
          value={form.notes}
          onChange={(event) => setValue("notes", event.target.value)}
          rows={2}
          className="mt-2 w-full resize-none rounded-lg border border-border-low bg-surface-highest px-3 py-2 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
        />
      </label>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  placeholder,
  list,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  list?: string;
  inputMode?: "decimal";
}) {
  return (
    <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant">
      {label}
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        list={list}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-lg border border-border-low bg-surface-highest px-3 py-2 text-sm text-on-surface outline-none placeholder:text-on-surface-variant/50 focus:ring-2 focus:ring-primary"
      />
    </label>
  );
}

function MobileDieselFilterCards({
  groupedRows,
  latestIds,
  equipments,
  onEdit,
  onDelete,
}: {
  groupedRows: Array<[string, DieselFilterChangeWithHours[]]>;
  latestIds: Set<string>;
  equipments: Parameters<typeof formatEquipmentReference>[1];
  onEdit: (row: DieselFilterChangeWithHours) => void;
  onDelete: (row: DieselFilterChangeWithHours) => void;
}) {
  return (
    <div className="space-y-4 p-3">
      {groupedRows.map(([fleet, fleetRows]) => (
        <section key={fleet} className="min-w-0 space-y-3">
          <div className="rounded-lg border border-primary/20 bg-primary/10 px-3 py-2">
            <p className="break-words text-[11px] font-black uppercase tracking-widest text-primary">
              {formatEquipmentReference(fleet, equipments)}
            </p>
          </div>

          {fleetRows.map((row) => {
            const isLatest = latestIds.has(row.id);
            const toneClass =
              isLatest && row.intervalStatus === "critical"
                ? "border-status-error/50 bg-status-error/10"
                : isLatest && row.intervalStatus === "attention"
                  ? "border-status-warning/50 bg-status-warning/10"
                  : "border-border-low bg-surface-highest/70";

            return (
              <article
                key={row.id}
                className={`w-full min-w-0 rounded-xl border p-3 shadow-industrial ${toneClass}`}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                      Frota
                    </p>
                    <h3 className="mt-1 break-words text-lg font-black leading-tight text-on-surface">
                      {formatEquipmentReference(row.fleet, equipments)}
                    </h3>
                  </div>
                  <span className="shrink-0 rounded-full bg-black/30 px-2 py-1 text-[10px] font-black text-primary">
                    {formatBrDate(row.date)}
                  </span>
                </div>

                <div className="mb-3 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
                  <MobileHighlight label="Horímetro" value={formatNumber(row.hourmeter)} />
                  <MobileHighlight
                    label="Horas desde última troca"
                    value={row.hoursSinceLastChangeLabel}
                    tone="primary"
                  />
                </div>

                <dl className="grid grid-cols-1 gap-2 text-sm">
                  <MobileInfo label="Filtro Primário" value={row.primaryFilter} />
                  <MobileInfo label="Filtro Secundário" value={row.secondaryFilter} />
                  <MobileInfo label="Racor" value={row.racor} />
                  <MobileInfo label="Marca" value={row.brand} />
                  <MobileInfo label="Obra" value={row.obra} />
                  <MobileInfo label="Responsável" value={row.responsible} />
                  <MobileInfo label="Observações" value={row.notes} />
                </dl>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" onClick={() => onEdit(row)}>
                    Editar
                  </Button>
                  <Button type="button" variant="destructive" onClick={() => onDelete(row)}>
                    Excluir
                  </Button>
                </div>
              </article>
            );
          })}
        </section>
      ))}
    </div>
  );
}

function MobileHighlight({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "primary";
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border-low bg-surface-container p-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
        {label}
      </p>
      <p
        className={`mt-1 break-words text-xl font-black leading-tight ${
          tone === "primary" ? "text-primary" : "text-on-surface"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function MobileInfo({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0 rounded-lg border border-border-low bg-surface-container/70 px-3 py-2">
      <dt className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
        {label}
      </dt>
      <dd className="mt-1 break-words font-bold text-on-surface">{value || "-"}</dd>
    </div>
  );
}

function DieselFilterRow({
  row,
  zebra,
  highlight,
  equipments,
  onEdit,
  onDelete,
}: {
  row: DieselFilterChangeWithHours;
  zebra: boolean;
  highlight: boolean;
  equipments: Parameters<typeof formatEquipmentReference>[1];
  onEdit: (row: DieselFilterChangeWithHours) => void;
  onDelete: (row: DieselFilterChangeWithHours) => void;
}) {
  const alertClass =
    highlight && row.intervalStatus === "critical"
      ? "bg-status-error/15"
      : highlight && row.intervalStatus === "attention"
        ? "bg-status-warning/15"
        : zebra
          ? "bg-surface-highest/60"
          : "bg-surface-container";
  const badge =
    highlight && row.intervalStatus === "critical"
      ? "Crítico"
      : highlight && row.intervalStatus === "attention"
        ? "Atenção"
        : "";

  return (
    <tr className={`border-t border-border-low transition-colors hover:bg-primary/5 ${alertClass}`}>
      <td className="px-3 py-3 font-bold">{formatBrDate(row.date)}</td>
      <td className="px-3 py-3 font-bold">{formatEquipmentReference(row.fleet, equipments)}</td>
      <td className="px-3 py-3 font-mono">{formatNumber(row.hourmeter)}</td>
      <td className="px-3 py-3">
        <span className="font-black text-primary">{row.hoursSinceLastChangeLabel}</span>
        {badge && (
          <span className="ml-2 rounded-full border border-current px-2 py-0.5 text-[10px] font-black uppercase tracking-widest">
            {badge}
          </span>
        )}
      </td>
      <td className="px-3 py-3">{row.primaryFilter || "-"}</td>
      <td className="px-3 py-3">{row.secondaryFilter || "-"}</td>
      <td className="px-3 py-3">{row.racor || "-"}</td>
      <td className="px-3 py-3">{row.brand || "-"}</td>
      <td className="px-3 py-3">{row.obra || "-"}</td>
      <td className="px-3 py-3">{row.responsible || "-"}</td>
      <td className="max-w-[220px] truncate px-3 py-3" title={row.notes || ""}>
        {row.notes || "-"}
      </td>
      <td className="px-3 py-3">
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onEdit(row)}>
            Editar
          </Button>
          <Button type="button" variant="destructive" size="sm" onClick={() => onDelete(row)}>
            Excluir
          </Button>
        </div>
      </td>
    </tr>
  );
}
