import { toast } from "sonner";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppLayout, Icon } from "@/components/AppLayout";
import { useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { EquipmentDetailsPanel, type EquipmentDetail } from "@/components/EquipmentDetailsPanel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useEquipmentActions,
  useEquipmentStore,
  type Equipment,
  type EquipmentDraft,
  type EquipmentStatus,
  type EquipmentTone,
} from "@/lib/equipment-store";
import { useMaintenanceStore } from "@/lib/maintenance-store";
import {
  formatEquipmentReference,
  formatFleetCode,
  normalizeFleetId,
} from "@/lib/operational-options";
import { INITIAL_FLEET_LOCATION_OPTIONS } from "@/lib/fleet-location-defaults";

export const Route = createFileRoute("/equipamentos")({ component: Equipamentos });

const toneBg: Record<string, string> = {
  success: "bg-status-success/10 text-status-success border-status-success/30",
  warning: "bg-status-warning/10 text-status-warning border-status-warning/30",
  error: "bg-status-error/10 text-status-error border-status-error/30",
};

const STATUS_OPTIONS: EquipmentStatus[] = ["Operação", "Manutenção", "Parado"];
const DEFAULT_ICON = "construction";
const EMPTY_LOCATION_FILTER = "__empty";

const STATUS_TONE: Record<EquipmentStatus, EquipmentTone> = {
  Operação: "success",
  Manutenção: "warning",
  Parado: "error",
};

type FormState = {
  fleet: string;
  model: string;
  location: string;
  hours: string;
  status: EquipmentStatus;
};

const EMPTY_FORM: FormState = {
  fleet: "",
  model: "",
  location: "",
  hours: "",
  status: "Operação",
};

function equipmentToForm(equipment: Equipment): FormState {
  return {
    fleet: formatFleetCode(equipment.id),
    model: equipment.model,
    location: equipment.location,
    hours: String(equipment.hours),
    status: equipment.status,
  };
}

function formToDraft(form: FormState): EquipmentDraft {
  const status = form.status;
  return {
    id: normalizeFleetId(form.fleet),
    model: form.model,
    seriesNumber: "",
    location: form.location,
    hours: Number.parseInt(form.hours, 10) || 0,
    status,
    tone: STATUS_TONE[status],
    icon: DEFAULT_ICON,
    lastMaintenance: "",
    manufacturer: "",
    acquisitionDate: "",
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  return "Tente novamente.";
}

function Equipamentos() {
  const navigate = useNavigate();
  const { add, update, remove } = useEquipmentActions();
  const equipments = useEquipmentStore((snapshot) => snapshot.equipments);
  const maintenanceRecords = useMaintenanceStore((s) => s.records);
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentDetail | null>(null);
  const [showDetailsPanel, setShowDetailsPanel] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<Equipment | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const maintenancesForEquipment = useMemo(
    () =>
      deleteTarget
        ? maintenanceRecords.filter(
            (r) =>
              r.equipment === deleteTarget.id ||
              r.equipment === deleteTarget.model ||
              formatEquipmentReference(r.equipment, equipments) ===
                formatEquipmentReference(deleteTarget.id, equipments),
          )
        : [],
    [deleteTarget, equipments, maintenanceRecords],
  );

  const filtered = useMemo(
    () =>
      equipments.filter((e) => {
        const location = e.location.trim();
        const locationMatches =
          !locationFilter ||
          (locationFilter === EMPTY_LOCATION_FILTER ? !location : location === locationFilter);
        const search = searchTerm.toLowerCase();
        const searchMatches =
          e.model.toLowerCase().includes(search) ||
          e.id.toLowerCase().includes(search) ||
          formatFleetCode(e.id).toLowerCase().includes(search) ||
          e.location.toLowerCase().includes(search);

        return locationMatches && searchMatches;
      }),
    [equipments, locationFilter, searchTerm],
  );

  const locationOptions = useMemo(() => {
    const values = new Set<string>(INITIAL_FLEET_LOCATION_OPTIONS);
    equipments.forEach((equipment) => {
      const location = equipment.location.trim();
      if (location) values.add(location);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [equipments]);

  const statusCounts = useMemo(
    () => ({
      operacao: equipments.filter((e) => e.status === "Operação").length,
      manutencao: equipments.filter((e) => e.status === "Manutenção").length,
      parado: equipments.filter((e) => e.status === "Parado").length,
    }),
    [equipments],
  );

  const openEquipmentDetails = (equipment: Equipment) => {
    setSelectedEquipment(equipment);
    setShowDetailsPanel(true);
  };

  const openCreateDialog = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEditDialog = (equipment: Equipment) => {
    setEditingId(equipment.id);
    setForm(equipmentToForm(equipment));
    setShowDetailsPanel(false);
    setFormOpen(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.fleet.trim() || !form.model.trim() || !form.location.trim()) {
      toast.error("Campos obrigatórios", {
        description: "Informe frota, modelo e localização.",
      });
      return;
    }

    const draft = formToDraft(form);

    try {
      if (editingId) {
        await update(editingId, draft);
        toast.success("Equipamento atualizado", { description: form.model });
      } else {
        const created = await add(draft);
        toast.success("Equipamento cadastrado", {
          description: `${formatFleetCode(created.id)} · ${created.model}`,
        });
      }
    } catch (error) {
      console.error(error);
      toast.error("Erro ao salvar", { description: getErrorMessage(error) });
      return;
    }

    setFormOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  return (
    <AppLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-on-surface uppercase">
            Frota de Equipamentos
          </h1>
          <p className="text-sm text-on-surface-variant mt-1 font-medium">
            {equipments.length} máquinas cadastradas
          </p>
        </div>
        <Button onClick={openCreateDialog} className="font-black gap-2 shadow-industrial">
          <Icon name="add" />
          Cadastrar Equipamento
        </Button>
      </div>

      {/* Status Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-status-success/10 border border-status-success/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="check_circle" className="text-status-success text-2xl" />
            <p className="text-[10px] font-black text-status-success uppercase tracking-widest">
              Em Operação
            </p>
          </div>
          <p className="text-3xl font-black text-status-success">{statusCounts.operacao}</p>
        </div>
        <div className="bg-status-warning/10 border border-status-warning/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="build" className="text-status-warning text-2xl" />
            <p className="text-[10px] font-black text-status-warning uppercase tracking-widest">
              Manutenção
            </p>
          </div>
          <p className="text-3xl font-black text-status-warning">{statusCounts.manutencao}</p>
        </div>
        <div className="bg-status-error/10 border border-status-error/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="pause_circle" className="text-status-error text-2xl" />
            <p className="text-[10px] font-black text-status-error uppercase tracking-widest">
              Parado
            </p>
          </div>
          <p className="text-3xl font-black text-status-error">{statusCounts.parado}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-8 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(220px,320px)_auto] lg:items-end">
        <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant">
          Buscar
          <div className="relative mt-2">
            <Icon
              name="search"
              className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"
            />
            <input
              type="text"
              placeholder="Frota, modelo ou localização"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-surface-container border border-border-low rounded-lg text-on-surface focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-industrial placeholder:text-on-surface-variant/50"
            />
          </div>
        </label>

        <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant">
          Obra
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="mt-2 w-full rounded-lg border border-border-low bg-surface-container px-3 py-3 text-sm font-medium text-on-surface outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Todas</option>
            {locationOptions.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
            <option value={EMPTY_LOCATION_FILTER}>Sem localização</option>
          </select>
        </label>

        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setSearchTerm("");
            setLocationFilter("");
          }}
        >
          Limpar filtros
        </Button>
      </div>

      {/* Equipment Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((e) => (
          <button
            type="button"
            key={e.id}
            onClick={() => openEquipmentDetails(e)}
            className="text-left bg-surface-container border border-border-low p-6 rounded-lg hover:border-primary/50 hover:shadow-md transition-industrial group relative overflow-hidden"
          >
            {/* Status indicator bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

            <div className="flex justify-end mb-4">
              <span className={`px-3 py-1 text-xs font-bold rounded-full border ${toneBg[e.tone]}`}>
                {e.status}
              </span>
            </div>

            <p className="text-xs uppercase tracking-wider text-on-surface-variant font-medium mb-1">
              {formatFleetCode(e.id)}
            </p>
            <h3 className="text-lg font-black text-on-surface group-hover:text-primary transition-colors mb-4">
              {e.model}
            </h3>

            <dl className="grid grid-cols-1 min-[390px]:grid-cols-2 gap-4 text-xs mb-4 pb-4 border-b border-border-low">
              <div>
                <dt className="uppercase tracking-wider text-on-surface-variant font-black mb-1">
                  <Icon name="schedule" className="inline text-base mr-1" />
                  Horímetro
                </dt>
                <dd className="text-on-surface font-black">{e.hours.toLocaleString("pt-BR")} h</dd>
              </div>
              <div>
                <dt className="uppercase tracking-wider text-on-surface-variant font-black mb-1">
                  <Icon name="location_on" className="inline text-base mr-1" />
                  Localização
                </dt>
                <dd className="text-on-surface font-black truncate">{e.location}</dd>
              </div>
            </dl>

            <div className="flex gap-2 text-xs font-black text-primary uppercase tracking-widest">
              <Icon name="arrow_forward" />
              Ver Detalhes
            </div>
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <Icon
            name="precision_manufacturing"
            className="text-5xl text-on-surface-variant/30 mx-auto mb-3"
          />
          <p className="text-on-surface-variant">Nenhum equipamento encontrado</p>
        </div>
      )}

      {/* Details Panel */}
      <EquipmentDetailsPanel
        open={showDetailsPanel}
        onOpenChange={setShowDetailsPanel}
        equipment={selectedEquipment}
        onEdit={openEditDialog}
        onDelete={(eq) => {
          setDeleteTarget(eq);
          setDeleteConfirmText("");
        }}
        onScheduleMaintenance={(equipmentId) => {
          if (typeof window !== "undefined") {
            window.sessionStorage.setItem("transjap:prefill:equipment", equipmentId);
          }
          setShowDetailsPanel(false);
          navigate({ to: "/manutencao" });
        }}
        onCreateTask={(equipmentId) => {
          if (typeof window !== "undefined") {
            window.sessionStorage.setItem("transjap:prefill:task-equipment", equipmentId);
          }
          setShowDetailsPanel(false);
          navigate({ to: "/agenda" });
        }}
      />

      {/* Create / Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingId
                ? `Editar equipamento ${formatFleetCode(editingId)}`
                : "Cadastrar equipamento"}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? "Atualize os dados do equipamento selecionado."
                : "Preencha as informações principais da frota."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-widest text-on-surface-variant sm:col-span-2">
              Frota
              <input
                value={form.fleet}
                onChange={(e) => setForm((s) => ({ ...s, fleet: e.target.value }))}
                onBlur={(e) => {
                  const normalized = normalizeFleetId(e.target.value);
                  if (normalized) setForm((s) => ({ ...s, fleet: formatFleetCode(normalized) }));
                }}
                required
                placeholder="Ex: 16 ou FROTA-016"
                className="px-3 py-2 bg-surface-highest border border-border-low rounded-md text-on-surface text-sm font-medium outline-none focus:ring-2 focus:ring-primary"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-widest text-on-surface-variant sm:col-span-2">
              Modelo
              <input
                value={form.model}
                onChange={(e) => setForm((s) => ({ ...s, model: e.target.value }))}
                required
                className="px-3 py-2 bg-surface-highest border border-border-low rounded-md text-on-surface text-sm font-medium outline-none focus:ring-2 focus:ring-primary"
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                Localização
                <input
                  value={form.location}
                  onChange={(e) => setForm((s) => ({ ...s, location: e.target.value }))}
                  list="equipment-location-options"
                  required
                  className="px-3 py-2 bg-surface-highest border border-border-low rounded-md text-on-surface text-sm font-medium outline-none focus:ring-2 focus:ring-primary"
                />
                <datalist id="equipment-location-options">
                  {locationOptions.map((location) => (
                    <option key={location} value={location} />
                  ))}
                </datalist>
              </label>

              <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                Horímetro
                <input
                  value={form.hours}
                  onChange={(e) => setForm((s) => ({ ...s, hours: e.target.value }))}
                  type="number"
                  min={0}
                  step={1}
                  className="px-3 py-2 bg-surface-highest border border-border-low rounded-md text-on-surface text-sm font-medium outline-none focus:ring-2 focus:ring-primary"
                />
              </label>

              <div className="flex flex-col gap-1 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                Status
                <Select
                  value={form.status}
                  onValueChange={(value) =>
                    setForm((s) => ({ ...s, status: value as EquipmentStatus }))
                  }
                >
                  <SelectTrigger className="bg-surface-highest border-border-low">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="font-black">
                {editingId ? "Salvar alterações" : "Cadastrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) {
            setDeleteTarget(null);
            setDeleteConfirmText("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-status-error">Excluir equipamento</DialogTitle>
            <DialogDescription>
              Você está prestes a excluir{" "}
              <strong className="text-on-surface">{deleteTarget?.model}</strong>. Esta ação não pode
              ser desfeita.
            </DialogDescription>
          </DialogHeader>

          {maintenancesForEquipment.length > 0 && (
            <div className="rounded-lg border border-status-warning/40 bg-status-warning/10 px-4 py-3 text-sm text-status-warning">
              ⚠ Existem {maintenancesForEquipment.length} manutenção
              {maintenancesForEquipment.length > 1 ? "ões" : ""} vinculada
              {maintenancesForEquipment.length > 1 ? "s" : ""}. O histórico será mantido mas o
              equipamento sumirá da frota.
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
              Digite o nome do equipamento para confirmar
            </label>
            <input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={deleteTarget?.model}
              className="w-full px-3 py-2 bg-surface-highest border border-border-low rounded-md text-on-surface text-sm outline-none focus:ring-2 focus:ring-status-error"
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteTarget(null);
                setDeleteConfirmText("");
              }}
            >
              Cancelar
            </Button>
            <Button
              disabled={deleteConfirmText.trim() !== deleteTarget?.model}
              className="bg-status-error text-white hover:bg-status-error/90 font-black"
              onClick={async () => {
                if (!deleteTarget) return;
                try {
                  await remove(deleteTarget.id);
                  toast.success("Equipamento excluído", { description: deleteTarget.model });
                  if (selectedEquipment?.id === deleteTarget.id) {
                    setSelectedEquipment(null);
                    setShowDetailsPanel(false);
                  }
                  setDeleteTarget(null);
                  setDeleteConfirmText("");
                } catch (error) {
                  console.error(error);
                  toast.error("Erro ao excluir", { description: getErrorMessage(error) });
                }
              }}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
