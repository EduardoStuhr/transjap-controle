import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AppLayout, Icon } from "@/components/AppLayout";
import { AttachmentUpload, type AttachedFile } from "@/components/AttachmentUpload";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { inventoryActions, useInventoryStore } from "@/lib/inventory-store";
import type { InventoryItem, StockMovement } from "@/lib/inventory-types";
import { useAuthStore } from "@/lib/auth-store";
import { exportMaintenanceAsCsv, exportMaintenanceAsPdf } from "@/lib/maintenance-export";
import {
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
import { daysSinceBrDate } from "@/lib/urgency";

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
  status: "Aberta",
  item: "",
  serviceDescription: "",
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
  const averageStepMinutes = useMemo(() => {
    const completedSteps = records.flatMap((record) =>
      record.steps.filter((step) => step.durationMinutes > 0),
    );
    if (completedSteps.length === 0) return 0;
    const total = completedSteps.reduce((sum, step) => sum + step.durationMinutes, 0);
    return Math.round(total / completedSteps.length);
  }, [records]);

  const openCreateMaintenance = () => {
    setDraft({ ...EMPTY_MAINTENANCE });
    setShowMaintenanceModal(true);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const prefill = window.sessionStorage.getItem("transjap:prefill:equipment");
    if (!prefill) return;
    window.sessionStorage.removeItem("transjap:prefill:equipment");
    setDraft((current) => ({ ...current, equipment: prefill }));
    setShowMaintenanceModal(true);
  }, []);

  const saveMaintenance = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!draft.equipment.trim()) {
      toast.error("Equipamento obrigatório", {
        description: "Informe qual equipamento receberá a manutenção.",
      });
      return;
    }

    if (!draft.item.trim()) {
      toast.error("Item obrigatório", {
        description: "Informe qual componente ou peça será afetado.",
      });
      return;
    }

    if (!draft.serviceDescription.trim()) {
      toast.error("Serviço obrigatório", {
        description: "Descreva o que será feito ou o que quebrou.",
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
        <Metric label="Tempo médio (min)" value={averageStepMinutes} tone="primary" />
      </div>

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
                    {["Equipamento", "Tipo", "Item", "Aberto por", "Status"].map((header) => (
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
  return (
    <tr
      role="button"
      tabIndex={0}
      aria-label={`Abrir manutenção: ${record.equipment}`}
      onClick={() => onOpen(record)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(record);
        }
      }}
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
      <td className="px-6 py-4 text-sm font-bold text-on-surface">{record.item || "—"}</td>
      <td className="px-6 py-4 text-sm font-bold text-on-surface-variant">
        {record.submittedBy || "—"}
      </td>
      <td className="px-6 py-4">
        <div className="flex flex-col gap-1">
          <StatusBadge status={record.status} />
          {(() => {
            if (!record.createdAt || record.status === "Concluída") return null;
            const days = daysSinceBrDate(record.createdAt);
            if (days < 3) return null;
            const tone = days > 14 ? "text-status-warning" : "text-on-surface-variant";
            return (
              <span className={`text-xs font-medium ${tone}`}>
                <Icon name="schedule" className="inline text-sm mr-1" />
                Aberta há {days} dias
              </span>
            );
          })()}
        </div>
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
  return (
    <button
      type="button"
      onClick={() => onOpen(record)}
      className="border border-border-low rounded-lg p-4 text-left hover:border-primary/50 hover:shadow-md transition-industrial group bg-surface-highest/50"
    >
      <div className="flex items-start justify-between mb-3">
        <Icon name="build" className="text-primary text-2xl" />
        <div className="flex flex-col items-end gap-1">
          <StatusBadge status={record.status} />
          {(() => {
            if (!record.createdAt || record.status === "Concluída") return null;
            const days = daysSinceBrDate(record.createdAt);
            if (days < 3) return null;
            const tone = days > 14 ? "text-status-warning" : "text-on-surface-variant";
            return (
              <span className={`text-xs font-medium ${tone}`}>
                <Icon name="schedule" className="inline text-sm mr-1" />
                Aberta há {days} dias
              </span>
            );
          })()}
        </div>
      </div>
      <h3 className="font-bold text-on-surface group-hover:text-primary transition-colors mb-1">
        {record.equipment}
      </h3>
      <p className="text-xs text-on-surface-variant mb-3">{record.type}</p>
      <dl className="space-y-2 text-xs text-on-surface-variant mb-3 pb-3 border-b border-border-low">
        <div className="flex justify-between">
          <dt>Aberto por:</dt>
          <dd className="font-bold text-on-surface">{record.submittedBy || "—"}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Criado em:</dt>
          <dd className="font-bold text-on-surface">{record.createdAt}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Item / Componente:</dt>
          <dd className="font-bold text-on-surface text-right truncate">{record.item || "—"}</dd>
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
  const user = useAuthStore((snapshot) => snapshot.user);
  const setValue = <K extends keyof MaintenanceDraft>(key: K, value: MaintenanceDraft[K]) =>
    onDraftChange({ ...draft, [key]: value });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black uppercase">Registrar Manutenção</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg border border-border-low bg-surface-highest px-3 py-2 text-sm">
            <Icon name="person" className="text-primary text-base" />
            <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
              Aberto por:
            </span>
            <span className="font-bold text-on-surface">{user?.name || "Usuário"}</span>
          </div>
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
            <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant sm:col-span-2">
              Item / Componente afetado
              <input
                type="text"
                value={draft.item}
                onChange={(event) => setValue("item", event.target.value)}
                placeholder="Ex: Bomba hidráulica, Filtro de ar"
                className="mt-2 w-full px-3 py-2 bg-surface-highest border border-border-low rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
              />
            </label>
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
          </div>
          <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant block">
            O que será feito / O que quebrou
            <textarea
              value={draft.serviceDescription}
              onChange={(event) => setValue("serviceDescription", event.target.value)}
              rows={4}
              placeholder="Descreva o problema e o reparo necessário"
              className="mt-2 w-full px-3 py-2 bg-surface-highest border border-border-low rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </label>
          <TextArea
            label="Observações adicionais"
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
  const totalCost = movements.reduce((sum, movement) => sum + movement.costImpact, 0);
  const [stepNotes, setStepNotes] = useState<Record<string, string>>({});
  const [completionComments, setCompletionComments] = useState<Record<string, string>>({});
  const [stepAttachments, setStepAttachments] = useState<Record<string, AttachedFile[]>>({});
  const [waitingPart, setWaitingPart] = useState("");
  const activeStepIndex = record ? getActiveStepIndex(record.steps) : -1;

  return (
    <Dialog open={Boolean(record)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {record && (
          <>
            <DialogHeader>
              <div className="flex items-start justify-between gap-3">
                <DialogTitle className="text-2xl font-black uppercase">
                  {record.equipment}
                </DialogTitle>
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => exportMaintenanceAsPdf(record, movements)}
                    aria-label="Exportar PDF"
                  >
                    <Icon name="picture_as_pdf" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => exportMaintenanceAsCsv(record, movements)}
                    aria-label="Exportar CSV"
                  >
                    <Icon name="table_view" />
                  </Button>
                </div>
              </div>
            </DialogHeader>
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Info label="OS" value={record.id} />
                <Info label="Tipo" value={record.type} />
                <Info label="Status" value={record.status} />
                <Info label="Aberto por" value={record.submittedBy || "—"} />
                <Info
                  label="Custo em peças"
                  value={totalCost.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                />
              </div>
              <div className="bg-surface-highest border border-border-low rounded-lg p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                  Item / Componente
                </p>
                <p className="text-sm font-bold text-on-surface mt-1">{record.item || "—"}</p>
              </div>
              <div className="bg-surface-highest border border-border-low rounded-lg p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                  Serviço a executar
                </p>
                <p className="text-sm text-on-surface mt-1 whitespace-pre-wrap">
                  {record.serviceDescription || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant mb-3">
                  Pipeline da manutenção
                </p>
                <MaintenanceProgressSummary record={record} activeStepIndex={activeStepIndex} />
                <div className="space-y-3">
                  {record.steps.map((step, index) => (
                    <MaintenanceStepCard
                      key={step.id}
                      index={index}
                      recordId={record.id}
                      step={step}
                      active={index === activeStepIndex && step.status !== "concluida"}
                      blocked={index > activeStepIndex && step.status === "pendente"}
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
              {record.description && (
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant mb-2">
                    Notas iniciais
                  </p>
                  <p className="bg-surface-highest border border-border-low rounded-lg p-3 text-sm">
                    {record.description}
                  </p>
                </div>
              )}
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

function getActiveStepIndex(steps: MaintenanceStep[]) {
  const nextIndex = steps.findIndex((step) => step.status !== "concluida");
  return nextIndex >= 0 ? nextIndex : Math.max(steps.length - 1, 0);
}

function getStepMeta(step: MaintenanceStep, active: boolean, blocked: boolean) {
  if (step.status === "concluida") {
    return {
      label: "Concluída",
      shortLabel: "Feita",
      icon: "check",
      badgeClass: "bg-status-success/10 text-status-success border-status-success/30",
      dotClass: "bg-status-success/20 text-status-success border-status-success/30",
      cardClass: "border-status-success/30 bg-status-success/10",
    };
  }

  if (blocked) {
    return {
      label: "Aguardando etapa anterior",
      shortLabel: "Aguarda",
      icon: "lock",
      badgeClass: "bg-surface-container text-on-surface-variant border-border-low",
      dotClass: "bg-surface-container text-on-surface-variant border-border-low",
      cardClass: "border-border-low bg-surface-highest/60",
    };
  }

  if (active && step.status === "em_andamento") {
    return {
      label: "Em andamento",
      shortLabel: "Agora",
      icon: "play_arrow",
      badgeClass: "bg-primary/10 text-primary border-primary/30",
      dotClass: "bg-primary/20 text-primary border-primary/40",
      cardClass: "border-primary bg-primary/10",
    };
  }

  if (active) {
    return {
      label: "Pronta para iniciar",
      shortLabel: "Próxima",
      icon: "flag",
      badgeClass: "bg-status-warning/10 text-status-warning border-status-warning/30",
      dotClass: "bg-status-warning/20 text-status-warning border-status-warning/30",
      cardClass: "border-status-warning/30 bg-status-warning/10",
    };
  }

  return {
    label: "Pendente",
    shortLabel: "Pendente",
    icon: "radio_button_unchecked",
    badgeClass: "bg-surface-container text-on-surface-variant border-border-low",
    dotClass: "bg-surface-container text-on-surface-variant border-border-low",
    cardClass: "border-border-low bg-surface-highest",
  };
}

function formatStepDate(value: string) {
  if (!value) return "Não registrado";

  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatStepDuration(minutes: number) {
  if (!minutes) return "Menos de 1 min";
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}min` : `${hours}h`;
}

function MaintenanceProgressSummary({
  record,
  activeStepIndex,
}: {
  record: MaintenanceRecord;
  activeStepIndex: number;
}) {
  const totalSteps = record.steps.length || 1;
  const completedSteps = record.steps.filter((step) => step.status === "concluida").length;
  const progress = Math.round((completedSteps / totalSteps) * 100);
  const activeStep = record.steps[activeStepIndex];
  const done = completedSteps === totalSteps;

  return (
    <div className="bg-surface-highest border border-border-low rounded-lg p-4 mb-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
            Status do fluxo
          </p>
          <h3 className="text-lg font-black text-on-surface mt-1">
            {done ? "Manutenção concluída" : activeStep?.label || "Sem etapa ativa"}
          </h3>
          <p className="text-xs text-on-surface-variant mt-1">
            {completedSteps} de {totalSteps} etapas concluídas
            {!done && activeStep ? ` · ${getStepMeta(activeStep, true, false).label}` : ""}
          </p>
        </div>
        <div className="rounded-lg border border-border-low bg-surface-container px-4 py-3 text-right">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
            Progresso
          </p>
          <p className="text-2xl font-black text-primary">{progress}%</p>
        </div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-container">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        {record.steps.map((step, index) => (
          <MaintenanceProgressNode
            key={step.id}
            step={step}
            index={index}
            active={index === activeStepIndex && step.status !== "concluida"}
            blocked={index > activeStepIndex && step.status === "pendente"}
          />
        ))}
      </div>
    </div>
  );
}

function MaintenanceProgressNode({
  step,
  index,
  active,
  blocked,
}: {
  step: MaintenanceStep;
  index: number;
  active: boolean;
  blocked: boolean;
}) {
  const meta = getStepMeta(step, active, blocked);

  return (
    <div className={`rounded-lg border p-3 min-h-28 ${meta.cardClass}`}>
      <div className="flex items-center justify-between gap-2">
        <span
          className={`h-7 w-7 shrink-0 rounded-full border flex items-center justify-center ${meta.dotClass}`}
        >
          <Icon name={meta.icon} className="text-sm" />
        </span>
        <span
          className={`border rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${meta.badgeClass}`}
        >
          {meta.shortLabel}
        </span>
      </div>
      <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
        Etapa {index + 1}
      </p>
      <p className="mt-1 text-xs font-bold leading-snug text-on-surface break-words">
        {step.label}
      </p>
      {step.durationMinutes > 0 && (
        <p className="mt-2 text-[11px] text-on-surface-variant">
          Duração: {formatStepDuration(step.durationMinutes)}
        </p>
      )}
    </div>
  );
}

function MaintenanceStepCard({
  index,
  recordId,
  step,
  active,
  blocked,
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
  blocked: boolean;
  note: string;
  comment: string;
  attachments: AttachedFile[];
  onNoteChange: (value: string) => void;
  onCommentChange: (value: string) => void;
  onAttachmentsChange: (files: AttachedFile[]) => void;
}) {
  const meta = getStepMeta(step, active, blocked);
  const canStart = active && step.status === "pendente";
  const canComplete = active && step.status === "em_andamento";
  const isCompleted = step.status === "concluida";

  return (
    <article className={`border rounded-lg p-4 transition-colors ${meta.cardClass}`}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <span
            className={`h-10 w-10 shrink-0 rounded-lg border flex items-center justify-center ${meta.dotClass}`}
          >
            <Icon name={meta.icon} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-black text-on-surface break-words">
                ETAPA {index + 1} — {step.label}
              </p>
              <span
                className={`border rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${meta.badgeClass}`}
              >
                {meta.label}
              </span>
            </div>
            {step.durationMinutes > 0 && (
              <p className="text-xs text-on-surface-variant mt-1">
                Duração: {formatStepDuration(step.durationMinutes)}
              </p>
            )}
          </div>
        </div>
      </div>

      {canStart && (
        <div className="mt-4 space-y-3">
          <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant">
            Observação de abertura
            <textarea
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder="Ex.: equipamento recebido, sintoma percebido ou prioridade"
              rows={2}
              className="mt-2 w-full px-3 py-2 bg-surface-container border border-border-low rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </label>
          <Button
            type="button"
            variant="outline"
            onClick={() => maintenanceActions.startStep(recordId, step.id, note)}
            className="w-full sm:w-auto gap-2"
          >
            <Icon name="play_arrow" />
            Iniciar etapa
          </Button>
        </div>
      )}

      {canComplete && (
        <div className="mt-4 space-y-3">
          {step.startNote && (
            <p className="rounded-lg bg-surface-container px-3 py-2 text-sm text-on-surface-variant">
              <span className="font-bold text-on-surface">Abertura:</span> {step.startNote}
            </p>
          )}
          <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant">
            Comentário de conclusão
            <textarea
              value={comment}
              onChange={(event) => onCommentChange(event.target.value)}
              placeholder="Resumo do que foi feito nesta etapa"
              rows={3}
              className="mt-2 w-full px-3 py-2 bg-surface-container border border-border-low rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </label>
          <AttachmentUpload
            files={attachments}
            onFilesChange={onAttachmentsChange}
            maxFiles={4}
            maxSize={20}
          />
          <Button
            type="button"
            disabled={!canComplete}
            onClick={() => {
              maintenanceActions.completeStep(recordId, step.id, comment, attachments);
              onCommentChange("");
              onAttachmentsChange([]);
            }}
            className="w-full sm:w-auto gap-2"
          >
            <Icon name="check" />
            Concluir etapa
          </Button>
        </div>
      )}

      {isCompleted && (
        <div className="mt-4 space-y-2 text-sm text-on-surface-variant">
          <p>
            <span className="font-bold text-on-surface">Início:</span>{" "}
            {formatStepDate(step.startedAt)}
            {step.startedBy ? ` por ${step.startedBy}` : ""}
          </p>
          <p>
            <span className="font-bold text-on-surface">Conclusão:</span>{" "}
            {formatStepDate(step.completedAt)}
            {step.completedBy ? ` por ${step.completedBy}` : ""}
          </p>
          {step.startNote && (
            <p>
              <span className="font-bold text-on-surface">Abertura:</span> {step.startNote}
            </p>
          )}
          {step.completionComment && (
            <p>
              <span className="font-bold text-on-surface">Conclusão:</span> {step.completionComment}
            </p>
          )}
          {step.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {step.attachments.map((file) => (
                <span
                  key={file.id}
                  className="inline-flex items-center gap-1 rounded-full bg-surface-container px-2 py-1 text-xs font-bold text-on-surface"
                >
                  <Icon name="attach_file" className="text-sm" />
                  {file.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {blocked && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-surface-container px-3 py-2 text-sm text-on-surface-variant">
          <Icon name="lock" className="text-base" />
          <span>Aguardando a etapa atual terminar.</span>
        </div>
      )}
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
