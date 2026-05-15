import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AppLayout, Icon } from "@/components/AppLayout";
import { AttachmentUpload, type AttachedFile } from "@/components/AttachmentUpload";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getUrgencyLevel } from "@/lib/urgency";
import { inventoryActions, useInventoryStore } from "@/lib/inventory-store";
import type { InventoryItem, StockMovement } from "@/lib/inventory-types";
import { useAuthStore } from "@/lib/auth-store";
import {
  getMaintenanceAlerts,
  getStepDelay,
  maintenanceActions,
  useMaintenanceStore,
  type MaintenanceDraft,
  type MaintenanceRecord,
  type MaintenanceStep,
  type MaintenanceStatus,
} from "@/lib/maintenance-store";
import {
  ASSIGNMENT_OPTIONS,
  EQUIPMENT_OPTIONS,
  MAINTENANCE_TYPE_OPTIONS,
} from "@/lib/operational-options";

export const Route = createFileRoute("/manutencao")({ component: Manutencao });

type MaintenanceType = {
  name: string;
  icon: string;
  description: string;
  color: string;
};

const TYPE_META: Record<string, Omit<MaintenanceType, "name">> = {
  Preventiva: {
    icon: "shield",
    description: "Manutenções programadas",
    color: "bg-status-success/10 text-status-success",
  },
  Corretiva: {
    icon: "build_circle",
    description: "Reparos emergenciais",
    color: "bg-status-error/10 text-status-error",
  },
  Inspeção: {
    icon: "fact_check",
    description: "Checklists técnicos",
    color: "bg-status-info/10 text-status-info",
  },
  "Troca de óleo": {
    icon: "oil_barrel",
    description: "Lubrificantes e filtros",
    color: "bg-primary/10 text-primary",
  },
  Hidráulica: {
    icon: "water_drop",
    description: "Bombas e cilindros",
    color: "bg-status-warning/10 text-status-warning",
  },
  Mecânica: {
    icon: "settings",
    description: "Motor e transmissão",
    color: "bg-surface-high text-on-surface",
  },
};

const TYPES: MaintenanceType[] = MAINTENANCE_TYPE_OPTIONS.map((name) => ({
  name,
  ...TYPE_META[name],
}));

const EMPTY_MAINTENANCE: MaintenanceDraft = {
  equipment: "Escavadeira CAT 320",
  type: "Preventiva",
  technician: "Todos",
  responsible: "Todos",
  status: "Aberta",
  deadline: "",
  description: "",
  notes: "",
};

function Manutencao() {
  const records = useMaintenanceStore((snapshot) => snapshot.records);
  const inventoryItems = useInventoryStore((snapshot) => snapshot.items);
  const movements = useInventoryStore((snapshot) => snapshot.movements);
  const user = useAuthStore((snapshot) => snapshot.user);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MaintenanceDraft>(EMPTY_MAINTENANCE);
  const [consumption, setConsumption] = useState({
    itemId: "",
    quantity: 1,
    responsible: "",
    equipment: "",
    maintenanceId: "",
    note: "",
  });

  const filteredRecords = useMemo(
    () =>
      selectedType
        ? records.filter((record) => record.type.toLowerCase().includes(selectedType.toLowerCase()))
        : records,
    [records, selectedType],
  );

  const selectedRecord = records.find((record) => record.id === selectedRecordId) || null;
  const selectedInventoryItem = inventoryItems.find((item) => item.id === consumption.itemId);
  const selectedRecordMovements = selectedRecord
    ? movements.filter(
        (movement) =>
          movement.maintenanceId === selectedRecord.id ||
          (movement.equipment &&
            movement.equipment.toLowerCase() === selectedRecord.equipment.toLowerCase()),
      )
    : [];
  const maintenanceAlerts = getMaintenanceAlerts(records);

  const typeCounts = useMemo(
    () =>
      TYPES.reduce<Record<string, number>>((acc, type) => {
        acc[type.name] = records.filter((record) => record.type === type.name).length;
        return acc;
      }, {}),
    [records],
  );

  const totalMaintenance = records.length;
  const completedCount = records.filter((record) => record.status === "Concluída").length;
  const activeCount = records.filter(
    (record) => record.status === "Aberta" || record.status === "Em andamento",
  ).length;
  const overdueCount = records.filter(
    (record) =>
      record.status === "Atrasada" ||
      (record.deadline &&
        record.status !== "Concluída" &&
        getUrgencyLevel(record.deadline).isOverdue),
  ).length;

  const openCreateMaintenance = () => {
    setDraft({
      ...EMPTY_MAINTENANCE,
      technician: user?.name || "Todos",
      responsible: user?.name || "Todos",
    });
    setShowMaintenanceModal(true);
  };

  const saveMaintenance = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!draft.equipment.trim()) {
      toast.error("Equipamento obrigatório", {
        description: "Informe qual equipamento receberá a manutenção.",
      });
      return;
    }

    const record = maintenanceActions.createRecord(draft);
    setShowMaintenanceModal(false);
    setSelectedRecordId(record.id);
    setConsumption((current) => ({
      ...current,
      equipment: record.equipment,
      maintenanceId: record.id,
    }));
    toast.success("Manutenção registrada", { description: record.equipment });
  };

  const openRecord = (record: MaintenanceRecord) => {
    setSelectedRecordId(record.id);
    setConsumption((current) => ({
      ...current,
      equipment: record.equipment,
      maintenanceId: record.id,
    }));
  };

  const consumeInventoryItem = () => {
    if (!selectedInventoryItem) {
      toast.error("Selecione uma peça", { description: "Cadastre ou escolha um item do estoque." });
      return;
    }

    const movement = inventoryActions.applyMovement({
      type: "uso em manutenção",
      itemId: selectedInventoryItem.id,
      quantity: consumption.quantity,
      responsible: consumption.responsible,
      note: consumption.note,
      equipment: consumption.equipment,
      maintenanceId: consumption.maintenanceId,
      toLocationId: "",
    });

    if (!movement) return;

    maintenanceActions.addCost(
      consumption.maintenanceId,
      movement.costImpact,
      `${movement.itemName} consumido em manutenção`,
    );

    toast.success("Peça consumida na manutenção", {
      description: `${movement.itemName}: ${movement.previousStock} -> ${movement.nextStock}`,
    });
    setConsumption((current) => ({ ...current, quantity: 1, note: "" }));
  };

  return (
    <AppLayout>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-on-surface uppercase">
            Centro de Manutenção
          </h1>
          <p className="text-sm text-on-surface-variant mt-1 font-medium">
            Gestão de preventivas, corretivas e inspeções técnicas
          </p>
        </div>
        <Button onClick={openCreateMaintenance} className="font-black gap-2 shadow-industrial">
          <Icon name="add" />
          Registrar Manutenção
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <Metric label="Total" value={totalMaintenance} tone="primary" />
        <Metric label="Concluídas" value={completedCount} tone="success" />
        <Metric label="Em andamento" value={activeCount} tone="primary" />
        <Metric label="Atrasadas" value={overdueCount} tone="error" />
      </div>

      {maintenanceAlerts.length > 0 && (
        <div className="bg-status-error/10 border border-status-error/30 rounded-lg p-4 mb-8">
          <h2 className="text-sm font-black uppercase tracking-widest text-status-error mb-3">
            Gargalos no processo
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {maintenanceAlerts.map((alert) => (
              <button
                key={alert.id}
                type="button"
                onClick={() => setSelectedRecordId(alert.recordId)}
                className="text-left bg-surface-container border border-border-low rounded p-3"
              >
                <p className="font-bold text-on-surface text-sm">{alert.title}</p>
                <p className="text-xs text-on-surface-variant mt-1">{alert.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-surface-container border border-border-low rounded-lg p-5 mb-8 shadow-industrial">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-black text-on-surface uppercase flex items-center gap-2">
              <Icon name="inventory_2" className="text-primary" />
              Consumo de peças
            </h2>
            <p className="text-xs text-on-surface-variant mt-1">
              Selecione uma manutenção clicando no equipamento e consuma peças diretamente do
              estoque.
            </p>
          </div>
          {selectedInventoryItem && (
            <div className="text-right">
              <p className="text-xs text-on-surface-variant">Custo estimado</p>
              <p className="font-black text-primary">
                {(selectedInventoryItem.cost * consumption.quantity).toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
              </p>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <select
            value={consumption.itemId}
            onChange={(event) =>
              setConsumption((current) => ({ ...current, itemId: event.target.value }))
            }
            className="px-3 py-2 bg-surface-highest border border-border-low rounded-lg text-sm"
          >
            <option value="">Peça do estoque</option>
            {inventoryItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.currentStock} {item.unit}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="0"
            step="0.01"
            value={consumption.quantity}
            onChange={(event) =>
              setConsumption((current) => ({ ...current, quantity: Number(event.target.value) }))
            }
            className="px-3 py-2 bg-surface-highest border border-border-low rounded-lg text-sm"
            placeholder="Quantidade"
          />
          <select
            value={consumption.equipment}
            onChange={(event) =>
              setConsumption((current) => ({ ...current, equipment: event.target.value }))
            }
            className="px-3 py-2 bg-surface-highest border border-border-low rounded-lg text-sm"
          >
            <option value="">Equipamento</option>
            {EQUIPMENT_OPTIONS.map((equipment) => (
              <option key={equipment} value={equipment}>
                {equipment}
              </option>
            ))}
          </select>
          <input
            value={consumption.maintenanceId}
            onChange={(event) =>
              setConsumption((current) => ({ ...current, maintenanceId: event.target.value }))
            }
            className="px-3 py-2 bg-surface-highest border border-border-low rounded-lg text-sm"
            placeholder="OS/manutenção"
          />
          <select
            value={consumption.responsible}
            onChange={(event) =>
              setConsumption((current) => ({ ...current, responsible: event.target.value }))
            }
            className="px-3 py-2 bg-surface-highest border border-border-low rounded-lg text-sm"
          >
            <option value="">Responsável</option>
            {ASSIGNMENT_OPTIONS.map((responsible) => (
              <option key={responsible} value={responsible}>
                {responsible}
              </option>
            ))}
          </select>
          <Button type="button" onClick={consumeInventoryItem} className="font-black gap-2">
            <Icon name="remove_shopping_cart" />
            Consumir
          </Button>
        </div>
        <input
          value={consumption.note}
          onChange={(event) =>
            setConsumption((current) => ({ ...current, note: event.target.value }))
          }
          className="mt-3 w-full px-3 py-2 bg-surface-highest border border-border-low rounded-lg text-sm"
          placeholder="Observação do consumo"
        />
      </div>

      <div className="mb-8">
        <h2 className="text-lg font-black text-on-surface uppercase mb-4 flex items-center gap-2">
          <Icon name="category" className="text-primary" />
          Tipos de Manutenção
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {TYPES.map((type) => (
            <button
              key={type.name}
              type="button"
              onClick={() => setSelectedType(selectedType === type.name ? null : type.name)}
              className={`p-4 rounded-lg border transition-all ${
                selectedType === type.name
                  ? `${type.color} border-current shadow-md scale-105`
                  : "bg-surface-container border-border-low hover:border-primary/50"
              }`}
            >
              <Icon name={type.icon} className="text-3xl mb-2 block" />
              <h3 className="text-xs font-black uppercase leading-tight">{type.name}</h3>
              <p className="text-2xl font-black mt-1">{typeCounts[type.name] || 0}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-surface-container border border-border-low shadow-industrial rounded-lg overflow-hidden">
        <div className="p-6 border-b border-border-low bg-surface-low flex justify-between items-center gap-4">
          <div>
            <h2 className="text-lg font-black text-on-surface uppercase">
              Registro de Intervenções
            </h2>
            <p className="text-xs text-on-surface-variant font-medium mt-1 uppercase tracking-widest">
              {selectedType ? `Filtrando por: ${selectedType}` : "Histórico real de manutenções"}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`p-2 rounded transition-colors ${viewMode === "list" ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-high"}`}
              aria-label="Lista"
            >
              <Icon name="view_list" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`p-2 rounded transition-colors ${viewMode === "grid" ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-high"}`}
              aria-label="Grade"
            >
              <Icon name="grid_3x3" />
            </button>
            {selectedType && (
              <button
                type="button"
                onClick={() => setSelectedType(null)}
                className="px-3 py-2 text-xs font-bold text-on-surface-variant hover:bg-surface-high rounded transition-colors"
              >
                Limpar filtro
              </button>
            )}
          </div>
        </div>

        {filteredRecords.length > 0 ? (
          viewMode === "list" ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-surface-lowest border-b border-border-low">
                  <tr>
                    {["Equipamento", "Tipo", "Prazo Técnico", "Técnico", "Status"].map((header) => (
                      <th
                        key={header}
                        className="px-6 py-4 text-[10px] uppercase tracking-[0.2em] text-on-surface-variant font-black"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-low">
                  {filteredRecords.map((record) => (
                    <MaintenanceTableRow key={record.id} record={record} onOpen={openRecord} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
              {filteredRecords.map((record) => (
                <MaintenanceCard key={record.id} record={record} onOpen={openRecord} />
              ))}
            </div>
          )
        ) : (
          <div className="text-center py-12">
            <Icon name="build" className="text-5xl text-on-surface-variant/30 mx-auto mb-3" />
            <p className="text-on-surface-variant">Nenhuma manutenção cadastrada</p>
            <Button
              type="button"
              onClick={openCreateMaintenance}
              variant="outline"
              className="mt-4 gap-2"
            >
              <Icon name="add" />
              Registrar primeira manutenção
            </Button>
          </div>
        )}
      </div>

      <MaintenanceFormDialog
        open={showMaintenanceModal}
        onOpenChange={setShowMaintenanceModal}
        draft={draft}
        onDraftChange={setDraft}
        onSubmit={saveMaintenance}
      />

      <MaintenanceDetailsDialog
        record={selectedRecord}
        movements={selectedRecordMovements}
        inventoryItems={inventoryItems}
        onOpenChange={(open) => {
          if (!open) setSelectedRecordId(null);
        }}
      />
    </AppLayout>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "primary" | "success" | "error";
}) {
  return (
    <div
      className={`border rounded-lg p-4 ${
        tone === "success"
          ? "bg-status-success/10 border-status-success/30"
          : tone === "error"
            ? "bg-status-error/10 border-status-error/30"
            : "bg-surface-container border-border-low"
      }`}
    >
      <p
        className={`text-[10px] font-black uppercase tracking-widest mb-2 ${
          tone === "success"
            ? "text-status-success"
            : tone === "error"
              ? "text-status-error"
              : "text-on-surface-variant"
        }`}
      >
        {label}
      </p>
      <p
        className={`text-3xl font-black ${
          tone === "success"
            ? "text-status-success"
            : tone === "error"
              ? "text-status-error"
              : "text-primary"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function MaintenanceTableRow({
  record,
  onOpen,
}: {
  record: MaintenanceRecord;
  onOpen: (record: MaintenanceRecord) => void;
}) {
  const urgency = record.deadline ? getUrgencyLevel(record.deadline) : null;

  return (
    <tr
      onClick={() => onOpen(record)}
      className="hover:bg-surface-high transition-colors group cursor-pointer"
    >
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-surface-highest flex items-center justify-center rounded border border-border-low group-hover:border-primary transition-colors">
            <Icon name="construction" className="text-primary text-base" />
          </div>
          <span className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors">
            {record.equipment}
          </span>
        </div>
      </td>
      <td className="px-6 py-4 text-sm font-medium text-on-surface">{record.type}</td>
      <td className="px-6 py-4">
        <div className="flex flex-col">
          <span className="text-sm font-bold text-on-surface">
            {record.deadline || "Sem prazo"}
          </span>
          {urgency && (
            <span
              className={`text-[10px] font-black uppercase tracking-wider ${urgency.colorClass}`}
            >
              {urgency.timeRemaining}
            </span>
          )}
        </div>
      </td>
      <td className="px-6 py-4 text-sm font-bold text-on-surface-variant">
        {record.technician || "Sem técnico"}
      </td>
      <td className="px-6 py-4">
        <StatusBadge status={record.status} />
      </td>
    </tr>
  );
}

function MaintenanceCard({
  record,
  onOpen,
}: {
  record: MaintenanceRecord;
  onOpen: (record: MaintenanceRecord) => void;
}) {
  const urgency = record.deadline ? getUrgencyLevel(record.deadline) : null;

  return (
    <button
      type="button"
      onClick={() => onOpen(record)}
      className="border border-border-low rounded-lg p-4 text-left hover:border-primary/50 hover:shadow-md transition-industrial group bg-surface-highest/50"
    >
      <div className="flex items-start justify-between mb-3">
        <Icon name="build" className="text-primary text-2xl" />
        <StatusBadge status={record.status} />
      </div>
      <h3 className="font-bold text-on-surface group-hover:text-primary transition-colors mb-1">
        {record.equipment}
      </h3>
      <p className="text-xs text-on-surface-variant mb-3">{record.type}</p>
      <dl className="space-y-2 text-xs text-on-surface-variant mb-3 pb-3 border-b border-border-low">
        <div className="flex justify-between">
          <dt>Técnico:</dt>
          <dd className="font-bold text-on-surface">{record.technician || "Sem técnico"}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Criado em:</dt>
          <dd className="font-bold text-on-surface">{record.createdAt}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Prazo:</dt>
          <dd className={`font-bold ${urgency?.colorClass || ""}`}>
            {urgency?.timeRemaining || "Sem prazo"}
          </dd>
        </div>
      </dl>
      <div className="text-xs font-black text-primary uppercase tracking-widest flex items-center gap-1">
        <Icon name="arrow_forward" />
        Abrir manutenção
      </div>
    </button>
  );
}

function StatusBadge({ status }: { status: MaintenanceStatus }) {
  return (
    <span
      className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded border ${
        status === "Concluída"
          ? "bg-status-success/10 text-status-success border-status-success/30"
          : status === "Em andamento" || status === "Aberta"
            ? "bg-primary/10 text-primary border-primary/30"
            : "bg-status-error/10 text-status-error border-status-error/30"
      }`}
    >
      {status}
    </span>
  );
}

function MaintenanceFormDialog({
  open,
  onOpenChange,
  draft,
  onDraftChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: MaintenanceDraft;
  onDraftChange: (draft: MaintenanceDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const setValue = <K extends keyof MaintenanceDraft>(key: K, value: MaintenanceDraft[K]) =>
    onDraftChange({ ...draft, [key]: value });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black uppercase">Registrar Manutenção</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SelectField
              label="Equipamento"
              value={draft.equipment}
              options={EQUIPMENT_OPTIONS}
              onChange={(value) => setValue("equipment", value)}
            />
            <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant">
              Tipo
              <select
                value={draft.type}
                onChange={(event) => setValue("type", event.target.value)}
                className="mt-2 w-full px-3 py-2 bg-surface-highest border border-border-low rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
              >
                {MAINTENANCE_TYPE_OPTIONS.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <SelectField
              label="Técnico"
              value={draft.technician}
              options={ASSIGNMENT_OPTIONS}
              onChange={(value) => setValue("technician", value)}
            />
            <SelectField
              label="Responsável"
              value={draft.responsible}
              options={ASSIGNMENT_OPTIONS}
              onChange={(value) => setValue("responsible", value)}
            />
            <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant">
              Status
              <select
                value={draft.status}
                onChange={(event) => setValue("status", event.target.value as MaintenanceStatus)}
                className="mt-2 w-full px-3 py-2 bg-surface-highest border border-border-low rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
              >
                {(["Aberta", "Em andamento", "Concluída", "Atrasada"] as MaintenanceStatus[]).map(
                  (status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ),
                )}
              </select>
            </label>
            <Field
              label="Prazo"
              type="date"
              value={draft.deadline}
              onChange={(value) => setValue("deadline", value)}
            />
          </div>
          <TextArea
            label="Descrição"
            value={draft.description}
            onChange={(value) => setValue("description", value)}
          />
          <TextArea
            label="Observações"
            value={draft.notes}
            onChange={(value) => setValue("notes", value)}
          />
          <Button type="submit" className="w-full font-black gap-2">
            <Icon name="save" />
            Salvar manutenção
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MaintenanceDetailsDialog({
  record,
  movements,
  inventoryItems,
  onOpenChange,
}: {
  record: MaintenanceRecord | null;
  movements: StockMovement[];
  inventoryItems: InventoryItem[];
  onOpenChange: (open: boolean) => void;
}) {
  const user = useAuthStore((snapshot) => snapshot.user);
  const totalCost = movements.reduce((sum, movement) => sum + movement.costImpact, 0);
  const [stepNotes, setStepNotes] = useState<Record<string, string>>({});
  const [completionComments, setCompletionComments] = useState<Record<string, string>>({});
  const [stepAttachments, setStepAttachments] = useState<Record<string, AttachedFile[]>>({});
  const [waitingPart, setWaitingPart] = useState("");

  return (
    <Dialog open={Boolean(record)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {record && (
          <>
            <DialogHeader>
              <DialogTitle className="text-2xl font-black uppercase">
                {record.equipment}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Info label="OS" value={record.id} />
                <Info label="Tipo" value={record.type} />
                <Info label="Status" value={record.status} />
                <Info
                  label="Responsável"
                  value={record.responsible || user?.name || "Sem responsável"}
                />
                <Info label="Prazo" value={record.deadline || "Sem prazo"} />
                <Info
                  label="Custo em peças"
                  value={totalCost.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant mb-3">
                  Pipeline da manutenção
                </p>
                <div className="space-y-3">
                  {record.steps.map((step, index) => (
                    <MaintenanceStepCard
                      key={step.id}
                      index={index}
                      recordId={record.id}
                      step={step}
                      active={record.currentStepId === step.id}
                      note={stepNotes[step.id] || ""}
                      comment={completionComments[step.id] || ""}
                      attachments={stepAttachments[step.id] || []}
                      onNoteChange={(value) =>
                        setStepNotes((current) => ({ ...current, [step.id]: value }))
                      }
                      onCommentChange={(value) =>
                        setCompletionComments((current) => ({ ...current, [step.id]: value }))
                      }
                      onAttachmentsChange={(files) =>
                        setStepAttachments((current) => ({ ...current, [step.id]: files }))
                      }
                    />
                  ))}
                </div>
              </div>
              <div className="bg-surface-highest border border-border-low rounded-lg p-4">
                <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant mb-3">
                  Peças aguardadas
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    value={waitingPart}
                    onChange={(event) => setWaitingPart(event.target.value)}
                    className="flex-1 px-3 py-2 bg-surface-container border border-border-low rounded text-sm"
                  >
                    <option value="">Selecionar peça do estoque</option>
                    {inventoryItems.map((item) => (
                      <option key={item.id} value={item.name}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      maintenanceActions.addWaitingPart(record.id, waitingPart);
                      setWaitingPart("");
                    }}
                  >
                    Registrar
                  </Button>
                </div>
                {record.waitingParts.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {record.waitingParts.map((part) => (
                      <span
                        key={part}
                        className="px-2 py-1 rounded bg-status-warning/10 text-status-warning text-xs font-bold"
                      >
                        {part}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant mb-2">
                  Descrição
                </p>
                <p className="bg-surface-highest border border-border-low rounded-lg p-3 text-sm">
                  {record.description || "Sem descrição"}
                </p>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant mb-2">
                  Timeline real
                </p>
                {record.timeline.length > 0 ? (
                  <div className="space-y-2">
                    {record.timeline.map((event) => (
                      <div
                        key={event.id}
                        className="border border-border-low rounded-lg p-3 bg-surface-highest text-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="font-bold">{event.action}</span>
                          <span className="text-[10px] text-on-surface-variant">
                            {new Date(event.timestamp).toLocaleString("pt-BR")}
                          </span>
                        </div>
                        <p className="text-xs text-on-surface-variant mt-1">
                          por {event.user}
                          {event.note ? ` · ${event.note}` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-on-surface-variant">Nenhum evento registrado.</p>
                )}
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant mb-2">
                  Peças consumidas
                </p>
                {movements.length > 0 ? (
                  <div className="space-y-2">
                    {movements.map((movement) => (
                      <div
                        key={movement.id}
                        className="border border-border-low rounded-lg p-3 bg-surface-highest flex justify-between gap-3 text-sm"
                      >
                        <span>{movement.itemName}</span>
                        <strong>
                          {movement.quantity} ·{" "}
                          {movement.costImpact.toLocaleString("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          })}
                        </strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-on-surface-variant">
                    Nenhuma peça consumida nesta manutenção.
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MaintenanceStepCard({
  index,
  recordId,
  step,
  active,
  note,
  comment,
  attachments,
  onNoteChange,
  onCommentChange,
  onAttachmentsChange,
}: {
  index: number;
  recordId: string;
  step: MaintenanceStep;
  active: boolean;
  note: string;
  comment: string;
  attachments: AttachedFile[];
  onNoteChange: (value: string) => void;
  onCommentChange: (value: string) => void;
  onAttachmentsChange: (files: AttachedFile[]) => void;
}) {
  const delayedHours = getStepDelay(step);
  const isDelayed = delayedHours > 0;

  return (
    <article
      className={`border rounded-lg p-4 ${
        active ? "border-primary bg-primary/10" : "border-border-low bg-surface-highest"
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <p className="font-black text-on-surface">
            {index + 1}. {step.label}
          </p>
          <p className="text-xs text-on-surface-variant mt-1">
            SLA: {step.slaHours}h · Status: {step.status.replace("_", " ")}
            {step.durationMinutes > 0 ? ` · Duração: ${step.durationMinutes} min` : ""}
          </p>
          {isDelayed && (
            <p className="text-xs font-bold text-status-error mt-1">
              Gargalo: {delayedHours.toFixed(1)}h acima do SLA
            </p>
          )}
        </div>
        <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
          SLA h
          <input
            type="number"
            min="1"
            value={step.slaHours}
            onChange={(event) =>
              maintenanceActions.updateStepSla(recordId, step.id, Number(event.target.value))
            }
            className="mt-1 w-20 px-2 py-1 bg-surface-container border border-border-low rounded text-sm"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
        <textarea
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          placeholder="Observação para iniciar etapa"
          rows={2}
          className="px-3 py-2 bg-surface-container border border-border-low rounded text-sm resize-none"
        />
        <textarea
          value={comment}
          onChange={(event) => onCommentChange(event.target.value)}
          placeholder="Comentário ao concluir etapa"
          rows={2}
          className="px-3 py-2 bg-surface-container border border-border-low rounded text-sm resize-none"
        />
      </div>

      <div className="mt-3">
        <AttachmentUpload
          files={attachments}
          onFilesChange={onAttachmentsChange}
          maxFiles={4}
          maxSize={20}
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mt-3">
        <Button
          type="button"
          variant="outline"
          disabled={step.status === "concluida"}
          onClick={() => maintenanceActions.startStep(recordId, step.id, note)}
          className="gap-2"
        >
          <Icon name="play_arrow" />
          Iniciar etapa
        </Button>
        <Button
          type="button"
          disabled={step.status === "concluida" || !comment.trim()}
          onClick={() => maintenanceActions.completeStep(recordId, step.id, comment, attachments)}
          className="gap-2"
        >
          <Icon name="check" />
          Concluir etapa
        </Button>
      </div>
    </article>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant">
      {label}
      <input
        type={type}
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full px-3 py-2 bg-surface-highest border border-border-low rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full px-3 py-2 bg-surface-highest border border-border-low rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant block">
      {label}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className="mt-2 w-full px-3 py-2 bg-surface-highest border border-border-low rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary resize-none"
      />
    </label>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-highest border border-border-low rounded-lg p-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
        {label}
      </p>
      <p className="font-bold text-on-surface mt-1">{value}</p>
    </div>
  );
}
