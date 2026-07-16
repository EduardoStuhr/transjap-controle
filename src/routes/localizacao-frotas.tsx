import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppLayout, Icon } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  useEquipmentActions,
  useEquipmentStore,
  type Equipment,
  type EquipmentStatus,
} from "@/lib/equipment-store";
import { AVAILABLE_FLEET_LOCATIONS } from "@/lib/fleet-location-defaults";
import { formatFleetCode } from "@/lib/operational-options";

export const Route = createFileRoute("/localizacao-frotas")({
  component: LocalizacaoFrotas,
});

type EditForm = {
  obraAtual: string;
  status: EquipmentStatus;
};

const EMPTY_LOCATION_LABEL = "Sem obra definida";
const EMPTY_LOCATION_FILTER = "__empty";
const ALL_FILTER = "__all";
const STATUS_OPTIONS: EquipmentStatus[] = ["Operação", "Manutenção", "Parado"];

function fleetSortValue(id: string) {
  const match = id.match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

function compareEquipment(a: Equipment, b: Equipment) {
  const locationDiff = displayLocation(a).localeCompare(displayLocation(b), "pt-BR");
  if (locationDiff) return locationDiff;
  const fleetDiff = fleetSortValue(a.id) - fleetSortValue(b.id);
  return fleetDiff || a.id.localeCompare(b.id, "pt-BR");
}

function displayLocation(equipment: Pick<Equipment, "location">) {
  return equipment.location.trim() || EMPTY_LOCATION_LABEL;
}

function statusClass(status: EquipmentStatus) {
  if (status === "Operação")
    return "border-status-success/30 bg-status-success/10 text-status-success";
  if (status === "Manutenção")
    return "border-status-warning/30 bg-status-warning/10 text-status-warning";
  return "border-status-error/30 bg-status-error/10 text-status-error";
}

function matchesSearch(equipment: Equipment, searchTerm: string) {
  const needle = searchTerm.trim().toLocaleLowerCase("pt-BR");
  if (!needle) return true;

  return [equipment.id, formatFleetCode(equipment.id), equipment.model, equipment.location].some(
    (value) => value.toLocaleLowerCase("pt-BR").includes(needle),
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  return "Tente novamente.";
}

function LocalizacaoFrotas() {
  const equipments = useEquipmentStore((snapshot) => snapshot.equipments);
  const { updateLocation } = useEquipmentActions();
  const [searchTerm, setSearchTerm] = useState("");
  const [locationFilter, setLocationFilter] = useState(ALL_FILTER);
  const [statusFilter, setStatusFilter] = useState<typeof ALL_FILTER | EquipmentStatus>(ALL_FILTER);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    obraAtual: AVAILABLE_FLEET_LOCATIONS[0],
    status: "Operação",
  });
  const [savingKey, setSavingKey] = useState("");

  const sortedEquipments = useMemo(() => [...equipments].sort(compareEquipment), [equipments]);
  const editingEquipment = useMemo(
    () => sortedEquipments.find((equipment) => equipment.id === editingId) ?? null,
    [editingId, sortedEquipments],
  );

  const locationOptions = useMemo(() => {
    const values = new Set<string>(AVAILABLE_FLEET_LOCATIONS);
    sortedEquipments.forEach((equipment) => {
      const location = equipment.location.trim();
      if (location) values.add(location);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [sortedEquipments]);

  const summary = useMemo(() => {
    const located = sortedEquipments.filter((equipment) => equipment.location.trim()).length;
    const workCounts = new Map<string, number>();
    sortedEquipments.forEach((equipment) => {
      const key = displayLocation(equipment);
      workCounts.set(key, (workCounts.get(key) ?? 0) + 1);
    });

    return {
      total: sortedEquipments.length,
      operating: sortedEquipments.filter((equipment) => equipment.status === "Operação").length,
      missing: sortedEquipments.length - located,
      workCounts: Array.from(workCounts.entries()).sort(([a], [b]) => {
        if (a === EMPTY_LOCATION_LABEL) return 1;
        if (b === EMPTY_LOCATION_LABEL) return -1;
        return a.localeCompare(b, "pt-BR");
      }),
    };
  }, [sortedEquipments]);

  const filteredEquipments = useMemo(
    () =>
      sortedEquipments.filter((equipment) => {
        const location = equipment.location.trim();
        const locationMatches =
          locationFilter === ALL_FILTER ||
          (locationFilter === EMPTY_LOCATION_FILTER ? !location : location === locationFilter);
        const statusMatches = statusFilter === ALL_FILTER || equipment.status === statusFilter;
        return locationMatches && statusMatches && matchesSearch(equipment, searchTerm);
      }),
    [locationFilter, searchTerm, sortedEquipments, statusFilter],
  );

  const groupedByLocation = useMemo(() => {
    const groups = new Map<string, Equipment[]>();
    filteredEquipments.forEach((equipment) => {
      const key = displayLocation(equipment);
      groups.set(key, [...(groups.get(key) ?? []), equipment]);
    });

    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === EMPTY_LOCATION_LABEL) return 1;
      if (b === EMPTY_LOCATION_LABEL) return -1;
      return a.localeCompare(b, "pt-BR");
    });
  }, [filteredEquipments]);

  const openEditor = (equipment: Equipment) => {
    setEditingId(equipment.id);
    setEditForm({
      obraAtual: equipment.location.trim() || AVAILABLE_FLEET_LOCATIONS[0],
      status: equipment.status,
    });
  };

  const saveFleet = async (
    equipment: Equipment,
    nextLocation = equipment.location,
    nextStatus = equipment.status,
  ) => {
    const obraAtual = nextLocation.trim();
    if (!obraAtual) {
      toast.error("Obra obrigatória", { description: "Selecione uma obra para a frota." });
      return;
    }

    const key = `${equipment.id}:${obraAtual}:${nextStatus}`;
    setSavingKey(key);
    try {
      await updateLocation(equipment.id, obraAtual, nextStatus);
      toast.success("Localização atualizada", {
        description: `${formatFleetCode(equipment.id)} - ${obraAtual}`,
      });
      setEditForm({ obraAtual, status: nextStatus });
    } catch (error) {
      toast.error("Não foi possível salvar", { description: getErrorMessage(error) });
    } finally {
      setSavingKey("");
    }
  };

  const saveEditor = async () => {
    if (!editingEquipment) return;
    await saveFleet(editingEquipment, editForm.obraAtual, editForm.status);
    setEditingId(null);
  };

  return (
    <AppLayout>
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-primary">
            Controle operacional
          </p>
          <h1 className="text-2xl font-black uppercase tracking-tight text-on-surface md:text-4xl">
            Localização das Máquinas/Frotas
          </h1>
          <p className="mt-2 text-sm font-medium text-on-surface-variant">
            Acompanhe a obra atual de cada frota e atualize mudanças de campo sem sair da tela.
          </p>
        </div>
      </div>

      <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon="precision_manufacturing" label="Total de frotas" value={summary.total} />
        <Metric icon="domain" label="Quantidade por obra" value={summary.workCounts.length} />
        <Metric icon="check_circle" label="Em operação" value={summary.operating} tone="success" />
        <Metric
          icon="location_off"
          label="Sem obra definida"
          value={summary.missing}
          tone={summary.missing > 0 ? "warning" : "default"}
        />
      </section>

      <section className="mb-6 rounded-lg border border-border-low bg-surface-container p-4 shadow-industrial">
        <div className="mb-3 flex items-center gap-2">
          <Icon name="map" className="text-primary" />
          <h2 className="text-xs font-black uppercase tracking-widest text-on-surface">
            Distribuição por obra
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {summary.workCounts.map(([location, count]) => (
            <button
              type="button"
              key={location}
              onClick={() =>
                setLocationFilter(
                  location === EMPTY_LOCATION_LABEL ? EMPTY_LOCATION_FILTER : location,
                )
              }
              className="flex min-h-16 items-center justify-between gap-3 rounded-lg border border-border-low bg-surface-highest px-3 py-2 text-left transition-industrial hover:border-primary/50"
            >
              <span className="break-words text-xs font-black uppercase tracking-widest text-on-surface">
                {location}
              </span>
              <span className="shrink-0 text-2xl font-black text-primary">{count}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="mb-6 rounded-lg border border-border-low bg-surface-container p-4 shadow-industrial">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(180px,260px)_minmax(170px,220px)_auto] lg:items-end">
          <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant">
            Buscar
            <div className="relative mt-2">
              <Icon
                name="search"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
              />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Frota, modelo ou obra"
                className="w-full rounded-lg border border-border-low bg-surface-highest py-2 pl-10 pr-3 text-sm text-on-surface outline-none placeholder:text-on-surface-variant/50 focus:ring-2 focus:ring-primary"
              />
            </div>
          </label>

          <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant">
            Obra
            <select
              value={locationFilter}
              onChange={(event) => setLocationFilter(event.target.value)}
              className="mt-2 h-10 w-full rounded-lg border border-border-low bg-surface-highest px-3 text-sm font-medium text-on-surface outline-none focus:ring-2 focus:ring-primary"
            >
              <option value={ALL_FILTER}>Todas</option>
              {locationOptions.map((location) => (
                <option key={location} value={location}>
                  {location}
                </option>
              ))}
              <option value={EMPTY_LOCATION_FILTER}>{EMPTY_LOCATION_LABEL}</option>
            </select>
          </label>

          <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant">
            Status
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as typeof ALL_FILTER | EquipmentStatus)
              }
              className="mt-2 h-10 w-full rounded-lg border border-border-low bg-surface-highest px-3 text-sm font-medium text-on-surface outline-none focus:ring-2 focus:ring-primary"
            >
              <option value={ALL_FILTER}>Todos</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSearchTerm("");
              setLocationFilter(ALL_FILTER);
              setStatusFilter(ALL_FILTER);
            }}
          >
            <Icon name="filter_alt_off" />
            Limpar
          </Button>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-border-low bg-surface-container shadow-industrial">
        <div className="flex flex-col gap-2 border-b border-border-low bg-surface-highest px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-on-surface">
              Frotas por obra
            </h2>
            <p className="mt-1 text-xs font-medium text-on-surface-variant">
              {filteredEquipments.length} frota(s) visível(is)
            </p>
          </div>
        </div>

        {filteredEquipments.length === 0 ? (
          <div className="p-10 text-center">
            <Icon name="location_off" className="mb-2 text-4xl text-on-surface-variant/40" />
            <p className="text-sm font-bold text-on-surface">Nenhuma frota encontrada</p>
          </div>
        ) : (
          <div className="divide-y divide-border-low">
            {groupedByLocation.map(([location, group]) => (
              <WorksiteGroup
                key={location}
                location={location}
                equipments={group}
                locationOptions={locationOptions}
                savingKey={savingKey}
                onEdit={openEditor}
                onQuickSave={saveFleet}
              />
            ))}
          </div>
        )}
      </section>

      <Sheet open={!!editingId} onOpenChange={(open) => !open && setEditingId(null)}>
        <SheetContent className="w-full overflow-y-auto border-border-low bg-surface-container sm:max-w-md">
          <SheetHeader className="pr-10">
            <SheetTitle className="text-xl font-black uppercase text-on-surface">
              Editar obra
            </SheetTitle>
            <SheetDescription className="text-on-surface-variant">
              Atualize a localização operacional da frota selecionada.
            </SheetDescription>
          </SheetHeader>

          {editingEquipment && (
            <div className="mt-6 space-y-5">
              <div className="rounded-lg border border-border-low bg-surface-highest p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                  Frota
                </p>
                <h3 className="mt-1 text-3xl font-black text-primary">
                  {formatFleetCode(editingEquipment.id)}
                </h3>
                <p className="mt-2 break-words text-sm font-bold text-on-surface">
                  {editingEquipment.model}
                </p>
              </div>

              <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant">
                Obra atual
                <select
                  value={editForm.obraAtual}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, obraAtual: event.target.value }))
                  }
                  className="mt-2 h-11 w-full rounded-lg border border-border-low bg-surface-highest px-3 text-sm font-medium text-on-surface outline-none focus:ring-2 focus:ring-primary"
                >
                  {locationOptions.map((location) => (
                    <option key={location} value={location}>
                      {location}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant">
                Status
                <select
                  value={editForm.status}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      status: event.target.value as EquipmentStatus,
                    }))
                  }
                  className="mt-2 h-11 w-full rounded-lg border border-border-low bg-surface-highest px-3 text-sm font-medium text-on-surface outline-none focus:ring-2 focus:ring-primary"
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <SheetFooter className="mt-8 gap-2">
            <Button type="button" variant="outline" onClick={() => setEditingId(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="font-black"
              isLoading={!!savingKey}
              onClick={saveEditor}
            >
              <Icon name="save" />
              Salvar
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}

function Metric({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: string;
  label: string;
  value: number;
  tone?: "default" | "success" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "text-status-success"
      : tone === "warning"
        ? "text-status-warning"
        : "text-primary";

  return (
    <div className="rounded-lg border border-border-low bg-surface-container p-4 shadow-industrial">
      <Icon name={icon} className={toneClass} />
      <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
        {label}
      </p>
      <p className="mt-1 text-3xl font-black text-on-surface">{value}</p>
    </div>
  );
}

function WorksiteGroup({
  location,
  equipments,
  locationOptions,
  savingKey,
  onEdit,
  onQuickSave,
}: {
  location: string;
  equipments: Equipment[];
  locationOptions: string[];
  savingKey: string;
  onEdit: (equipment: Equipment) => void;
  onQuickSave: (equipment: Equipment, nextLocation?: string, nextStatus?: EquipmentStatus) => void;
}) {
  return (
    <section>
      <div className="flex flex-col gap-1 bg-primary/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="break-words text-xs font-black uppercase tracking-widest text-primary">
          {location}
        </h3>
        <span className="text-xs font-black uppercase tracking-widest text-on-surface-variant">
          {equipments.length} máquina(s)
        </span>
      </div>

      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead className="bg-surface-highest text-on-surface-variant">
            <tr>
              {["Frota", "Modelo", "Obra atual", "Status", "Ações"].map((heading) => (
                <th
                  key={heading}
                  className="px-4 py-3 text-xs font-black uppercase tracking-widest"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {equipments.map((equipment, index) => (
              <EquipmentRow
                key={equipment.id}
                equipment={equipment}
                locationOptions={locationOptions}
                savingKey={savingKey}
                striped={index % 2 === 1}
                onEdit={onEdit}
                onQuickSave={onQuickSave}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 gap-3 p-3 lg:hidden">
        {equipments.map((equipment) => (
          <EquipmentCard
            key={equipment.id}
            equipment={equipment}
            locationOptions={locationOptions}
            savingKey={savingKey}
            onEdit={onEdit}
            onQuickSave={onQuickSave}
          />
        ))}
      </div>
    </section>
  );
}

function EquipmentRow({
  equipment,
  locationOptions,
  savingKey,
  striped,
  onEdit,
  onQuickSave,
}: {
  equipment: Equipment;
  locationOptions: string[];
  savingKey: string;
  striped: boolean;
  onEdit: (equipment: Equipment) => void;
  onQuickSave: (equipment: Equipment, nextLocation?: string, nextStatus?: EquipmentStatus) => void;
}) {
  const isSaving = savingKey.startsWith(`${equipment.id}:`);

  return (
    <tr
      className={`border-t border-border-low transition-colors hover:bg-primary/5 ${
        striped ? "bg-surface-highest/40" : "bg-surface-container"
      }`}
    >
      <td className="px-4 py-3 font-black text-primary">{formatFleetCode(equipment.id)}</td>
      <td className="max-w-[340px] px-4 py-3 font-bold text-on-surface">
        <span className="line-clamp-2">{equipment.model}</span>
      </td>
      <td className="px-4 py-3">
        <select
          value={equipment.location.trim() || AVAILABLE_FLEET_LOCATIONS[0]}
          disabled={isSaving}
          onChange={(event) => onQuickSave(equipment, event.target.value, equipment.status)}
          className="h-9 w-full min-w-44 rounded-md border border-border-low bg-surface-highest px-2 text-xs font-bold text-on-surface outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
        >
          {locationOptions.map((location) => (
            <option key={location} value={location}>
              {location}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3">
        <select
          value={equipment.status}
          disabled={isSaving}
          onChange={(event) =>
            onQuickSave(equipment, equipment.location, event.target.value as EquipmentStatus)
          }
          className={`h-9 rounded-md border px-2 text-xs font-black uppercase tracking-wider outline-none focus:ring-2 focus:ring-primary disabled:opacity-60 ${statusClass(
            equipment.status,
          )}`}
        >
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3">
        <Button type="button" variant="outline" size="sm" onClick={() => onEdit(equipment)}>
          <Icon name="edit_location_alt" />
          Editar
        </Button>
      </td>
    </tr>
  );
}

function EquipmentCard({
  equipment,
  locationOptions,
  savingKey,
  onEdit,
  onQuickSave,
}: {
  equipment: Equipment;
  locationOptions: string[];
  savingKey: string;
  onEdit: (equipment: Equipment) => void;
  onQuickSave: (equipment: Equipment, nextLocation?: string, nextStatus?: EquipmentStatus) => void;
}) {
  const isSaving = savingKey.startsWith(`${equipment.id}:`);

  return (
    <article className="rounded-lg border border-border-low bg-surface-highest p-3 shadow-industrial">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
            Frota
          </p>
          <h4 className="mt-1 text-2xl font-black text-primary">{formatFleetCode(equipment.id)}</h4>
        </div>
        <span
          className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-black uppercase tracking-widest ${statusClass(
            equipment.status,
          )}`}
        >
          {equipment.status}
        </span>
      </div>

      <p className="break-words text-sm font-bold text-on-surface">{equipment.model}</p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
          Obra atual
          <select
            value={equipment.location.trim() || AVAILABLE_FLEET_LOCATIONS[0]}
            disabled={isSaving}
            onChange={(event) => onQuickSave(equipment, event.target.value, equipment.status)}
            className="mt-2 h-10 w-full rounded-md border border-border-low bg-surface-container px-2 text-xs font-bold text-on-surface outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
          >
            {locationOptions.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </select>
        </label>

        <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
          Status
          <select
            value={equipment.status}
            disabled={isSaving}
            onChange={(event) =>
              onQuickSave(equipment, equipment.location, event.target.value as EquipmentStatus)
            }
            className="mt-2 h-10 w-full rounded-md border border-border-low bg-surface-container px-2 text-xs font-bold text-on-surface outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Button
        type="button"
        variant="outline"
        className="mt-4 w-full"
        onClick={() => onEdit(equipment)}
      >
        <Icon name="edit_location_alt" />
        Editar obra
      </Button>
    </article>
  );
}
