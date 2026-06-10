import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AppLayout, Icon } from "@/components/AppLayout";
import { AttachmentUpload, type AttachedFile } from "@/components/AttachmentUpload";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useActiveTabScroll } from "@/hooks/useActiveTabScroll";
import { useInventoryActions, useInventoryStore } from "@/lib/inventory-store";
import type { InventoryItem, StockMovement } from "@/lib/inventory-types";
import { useAuthStore } from "@/lib/auth-store";
import { isAdminUser } from "@/lib/auth-users";
import {
  exportMaintenanceAsCsv,
  exportMaintenanceAsPdf,
  exportOpenMaintenanceAsExcel,
  exportOpenMaintenanceAsPdf,
} from "@/lib/maintenance-export";
import {
  getMaintenanceExternalCost,
  getMaintenanceTotalCost,
  useMaintenanceActions,
  useMaintenanceStore,
  type MaintenanceCostDraft,
  type MaintenanceCostEntry,
  type MaintenanceDraft,
  type MaintenanceRecord,
  type MaintenanceStep,
  type MaintenanceStatus,
} from "@/lib/maintenance-store";
import {
  ASSIGNMENT_OPTIONS,
  MAINTENANCE_TYPE_OPTIONS,
  buildEquipmentOptions,
  formatEquipmentReference,
  type EquipmentOption,
} from "@/lib/operational-options";
import { daysSinceBrDate } from "@/lib/urgency";
import { useEquipmentStore } from "@/lib/equipment-store";
import { formatBrDate, formatBrDateTime } from "@/lib/utils";
import { EquipmentsInMaintenancePanel } from "@/components/EquipmentsInMaintenancePanel";

export const Route = createFileRoute("/manutencao")({ component: Manutencao });

type MaintenanceType = {
  name: string;
  icon: string;
  description: string;
  color: string;
};

type MaintenanceStatusFilter = "all" | "open" | "completed";

const STATUS_FILTERS: Array<{
  value: MaintenanceStatusFilter;
  label: string;
}> = [
  { value: "all", label: "Todas" },
  { value: "open", label: "Em aberto" },
  { value: "completed", label: "Concluídas" },
];

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
  equipment: "",
  type: "Preventiva",
  status: "Aberta",
  item: "",
  serviceDescription: "",
  notes: "",
  supplierName: "",
  materialDescription: "",
  cost: 0,
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  return "Tente novamente.";
}

function Manutencao() {
  const statusTabsRef = useActiveTabScroll<HTMLDivElement>();
  const inventoryActions = useInventoryActions();
  const maintenanceActions = useMaintenanceActions();
  const records = useMaintenanceStore((snapshot) => snapshot.records);
  const equipments = useEquipmentStore((snapshot) => snapshot.equipments);
  const inventoryItems = useInventoryStore((snapshot) => snapshot.items);
  const movements = useInventoryStore((snapshot) => snapshot.movements);
  const user = useAuthStore((snapshot) => snapshot.user);
  const canDeleteMaintenance = isAdminUser(user);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<MaintenanceStatusFilter>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MaintenanceRecord | null>(null);
  const [deletingMaintenance, setDeletingMaintenance] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [draft, setDraft] = useState<MaintenanceDraft>(EMPTY_MAINTENANCE);
  const [consumption, setConsumption] = useState({
    itemId: "",
    quantity: 1,
    responsible: "",
    equipment: "",
    maintenanceId: "",
    note: "",
  });
  const equipmentOptions = useMemo(() => buildEquipmentOptions(equipments), [equipments]);
  const formatEquipment = (value: string | undefined) =>
    formatEquipmentReference(value, equipments) || "Sem equipamento";

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const matchesType =
        !selectedType || record.type.toLowerCase().includes(selectedType.toLowerCase());
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "open" && record.status !== "Concluída") ||
        (statusFilter === "completed" && record.status === "Concluída");

      return matchesType && matchesStatus;
    });
  }, [records, selectedType, statusFilter]);
  const visibleOpenRecords = useMemo(
    () => filteredRecords.filter((record) => record.status !== "Concluída"),
    [filteredRecords],
  );
  const exportFilterDescription = `Tipo: ${selectedType || "Todos"} · Status da tela: ${
    STATUS_FILTERS.find((filter) => filter.value === statusFilter)?.label || "Todas"
  }`;

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

  const exportReportOptions = {
    formatEquipment,
    filterDescription: exportFilterDescription,
  };

  const exportOpenMaintenancePdf = () => {
    exportOpenMaintenanceAsPdf(visibleOpenRecords, exportReportOptions);
  };

  const exportOpenMaintenanceExcel = async () => {
    setExportingExcel(true);
    try {
      await exportOpenMaintenanceAsExcel(visibleOpenRecords, exportReportOptions);
      toast.success("Excel exportado", {
        description: `${visibleOpenRecords.length} manutenções abertas incluídas.`,
      });
    } catch (error) {
      toast.error("Não foi possível exportar o Excel", {
        description: getErrorMessage(error),
      });
    } finally {
      setExportingExcel(false);
    }
  };

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

  const saveMaintenance = async (event: FormEvent<HTMLFormElement>) => {
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

    const record = await maintenanceActions.createRecord(draft);
    setShowMaintenanceModal(false);
    setSelectedRecordId(record.id);
    setConsumption((current) => ({
      ...current,
      equipment: record.equipment,
      maintenanceId: record.id,
    }));
    toast.success("Manutenção registrada", { description: formatEquipment(record.equipment) });
  };

  const openRecord = (record: MaintenanceRecord) => {
    setSelectedRecordId(record.id);
    setConsumption((current) => ({
      ...current,
      equipment: record.equipment,
      maintenanceId: record.id,
    }));
  };

  const requestDeleteMaintenance = (record: MaintenanceRecord) => {
    if (!canDeleteMaintenance) {
      toast.error("Apenas administradores podem excluir manutenção.");
      return;
    }
    setDeleteTarget(record);
  };

  const confirmDeleteMaintenance = async () => {
    if (!deleteTarget) return;

    setDeletingMaintenance(true);
    try {
      await maintenanceActions.removeRecord(deleteTarget.id);
      toast.success("Manutenção excluída", {
        description: `${formatEquipment(deleteTarget.equipment)} · ${deleteTarget.id}`,
      });
      if (selectedRecordId === deleteTarget.id) setSelectedRecordId(null);
      setConsumption((current) =>
        current.maintenanceId === deleteTarget.id
          ? { ...current, maintenanceId: "", equipment: "" }
          : current,
      );
      setDeleteTarget(null);
    } catch (error) {
      toast.error("Erro ao excluir manutenção", { description: getErrorMessage(error) });
    } finally {
      setDeletingMaintenance(false);
    }
  };

  const consumeInventoryItem = async () => {
    if (!selectedInventoryItem) {
      toast.error("Selecione uma peça", { description: "Cadastre ou escolha um item do estoque." });
      return;
    }

    const movement = (await inventoryActions.applyMovement({
      type: "uso em manutenção",
      itemId: selectedInventoryItem.id,
      quantity: consumption.quantity,
      responsible: consumption.responsible,
      note: consumption.note,
      equipment: consumption.equipment,
      maintenanceId: consumption.maintenanceId,
      toLocationId: "",
    })) as StockMovement | null;

    if (!movement) return;

    await maintenanceActions.addCost(
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
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={exportOpenMaintenancePdf}
            disabled={visibleOpenRecords.length === 0}
            className="font-black gap-2"
            title={
              visibleOpenRecords.length === 0
                ? "Nenhuma manutenção aberta visível nos filtros atuais"
                : "Exportar manutenções abertas visíveis em PDF"
            }
          >
            <Icon name="picture_as_pdf" />
            Exportar PDF
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={exportOpenMaintenanceExcel}
            disabled={visibleOpenRecords.length === 0}
            isLoading={exportingExcel}
            className="font-black gap-2"
            title={
              visibleOpenRecords.length === 0
                ? "Nenhuma manutenção aberta visível nos filtros atuais"
                : "Exportar manutenções abertas visíveis em Excel"
            }
          >
            <Icon name="table_view" />
            Exportar Excel
          </Button>
          <Button onClick={openCreateMaintenance} className="font-black gap-2 shadow-industrial">
            <Icon name="add" />
            Registrar Manutenção
          </Button>
        </div>
      </div>

      <EquipmentsInMaintenancePanel
        records={records}
        onRecordClick={(id) => setSelectedRecordId(id)}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 mb-6 sm:mb-8">
        <Metric label="Total" value={totalMaintenance} tone="primary" />
        <Metric label="Concluídas" value={completedCount} tone="success" />
        <Metric label="Em andamento" value={activeCount} tone="primary" />
      </div>

      <div className="bg-surface-container border border-border-low rounded-lg p-4 sm:p-5 mb-6 sm:mb-8 shadow-industrial">
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
            {equipmentOptions.map((equipment) => (
              <option key={equipment.value} value={equipment.value}>
                {equipment.label}
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

      <div className="mb-6 sm:mb-8">
        <h2 className="text-base sm:text-lg font-black text-on-surface uppercase mb-3 sm:mb-4 flex items-center gap-2">
          <Icon name="category" className="text-primary" />
          Tipos de Manutenção
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
          {TYPES.map((type) => (
            <button
              key={type.name}
              type="button"
              onClick={() => setSelectedType(selectedType === type.name ? null : type.name)}
              className={`p-3 sm:p-4 rounded-lg border transition-all ${
                selectedType === type.name
                  ? `${type.color} border-current shadow-md scale-105`
                  : "bg-surface-container border-border-low hover:border-primary/50"
              }`}
            >
              <Icon name={type.icon} className="text-2xl sm:text-3xl mb-1 sm:mb-2 block" />
              <h3 className="text-[11px] sm:text-xs font-black uppercase leading-tight">
                {type.name}
              </h3>
              <p className="text-xl sm:text-2xl font-black mt-0.5 sm:mt-1">
                {typeCounts[type.name] || 0}
              </p>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-surface-container border border-border-low shadow-industrial rounded-lg overflow-hidden">
        <div className="p-3 sm:p-6 border-b border-border-low bg-surface-low flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black text-on-surface uppercase">
              Registro de Intervenções
            </h2>
            <p className="text-xs text-on-surface-variant font-medium mt-1 uppercase tracking-widest">
              {selectedType ? `Filtrando por: ${selectedType}` : "Histórico real de manutenções"}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div
              ref={statusTabsRef}
              className="flex gap-2 overflow-x-auto pb-1 sm:pb-0 scroll-smooth overscroll-x-contain"
              aria-label="Filtrar intervenções por status"
            >
              {STATUS_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setStatusFilter(filter.value)}
                  data-active={statusFilter === filter.value}
                  className={`whitespace-nowrap rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-colors ${
                    statusFilter === filter.value
                      ? "bg-primary text-on-primary shadow-industrial border-b-2 border-primary"
                      : "border border-border-low bg-surface-container text-on-surface hover:border-primary/50"
                  }`}
                  aria-pressed={statusFilter === filter.value}
                >
                  {filter.label}
                </button>
              ))}
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
        </div>

        {filteredRecords.length > 0 ? (
          viewMode === "list" ? (
            <>
              <div className="grid gap-3 p-3 md:hidden">
                {filteredRecords.map((record) => (
                  <MaintenanceCard
                    key={record.id}
                    record={record}
                    onOpen={openRecord}
                    onRequestDelete={requestDeleteMaintenance}
                    canDelete={canDeleteMaintenance}
                    formatEquipment={formatEquipment}
                  />
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left">
                <thead className="bg-surface-lowest border-b border-border-low">
                  <tr>
                    {[
                      "Equipamento",
                      "Tipo",
                      "Item",
                      "Aberto por",
                      "Custo",
                      "Status",
                      canDeleteMaintenance ? "Ações" : null,
                    ]
                      .filter((header): header is string => Boolean(header))
                      .map((header) => (
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
                    <MaintenanceTableRow
                      key={record.id}
                      record={record}
                      onOpen={openRecord}
                      onRequestDelete={requestDeleteMaintenance}
                      canDelete={canDeleteMaintenance}
                      formatEquipment={formatEquipment}
                    />
                  ))}
                </tbody>
              </table>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 p-3 sm:p-6">
              {filteredRecords.map((record) => (
                <MaintenanceCard
                  key={record.id}
                  record={record}
                  onOpen={openRecord}
                  onRequestDelete={requestDeleteMaintenance}
                  canDelete={canDeleteMaintenance}
                  formatEquipment={formatEquipment}
                />
              ))}
            </div>
          )
        ) : (
          <div className="text-center py-12">
            <Icon name="build" className="text-5xl text-on-surface-variant/30 mx-auto mb-3" />
            <p className="text-on-surface-variant">
              {records.length > 0
                ? "Nenhuma manutenção encontrada com os filtros selecionados"
                : "Nenhuma manutenção cadastrada"}
            </p>
            {records.length === 0 && (
              <Button
                type="button"
                onClick={openCreateMaintenance}
                variant="outline"
                className="mt-4 gap-2"
              >
                <Icon name="add" />
                Registrar primeira manutenção
              </Button>
            )}
          </div>
        )}
      </div>

      <MaintenanceFormDialog
        open={showMaintenanceModal}
        onOpenChange={setShowMaintenanceModal}
        draft={draft}
        equipmentOptions={equipmentOptions}
        onDraftChange={setDraft}
        onSubmit={saveMaintenance}
      />

      <MaintenanceDetailsDialog
        record={selectedRecord}
        equipmentLabel={formatEquipment(selectedRecord?.equipment)}
        movements={selectedRecordMovements}
        inventoryItems={inventoryItems}
        actions={maintenanceActions}
        canDelete={canDeleteMaintenance}
        onRequestDelete={requestDeleteMaintenance}
        onOpenChange={(open) => {
          if (!open) setSelectedRecordId(null);
        }}
      />

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deletingMaintenance) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir manutenção?</AlertDialogTitle>
            <AlertDialogDescription>
              O registro <strong>{deleteTarget?.id}</strong> será removido da manutenção. Tarefas,
              equipamentos, estoque e configurações do sistema não serão apagados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingMaintenance}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deletingMaintenance}
              onClick={(event) => {
                event.preventDefault();
                void confirmDeleteMaintenance();
              }}
              className="bg-status-error text-white hover:bg-status-error/90"
            >
              {deletingMaintenance ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
      className={`border rounded-lg p-3 sm:p-4 ${
        tone === "success"
          ? "bg-status-success/10 border-status-success/30"
          : tone === "error"
            ? "bg-status-error/10 border-status-error/30"
            : "bg-surface-container border-border-low"
      }`}
    >
      <p
        className={`text-[9px] sm:text-[10px] font-black uppercase tracking-widest mb-1 sm:mb-2 ${
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
        className={`text-2xl sm:text-3xl font-black leading-tight ${
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
  onRequestDelete,
  canDelete,
  formatEquipment,
}: {
  record: MaintenanceRecord;
  onOpen: (record: MaintenanceRecord) => void;
  onRequestDelete: (record: MaintenanceRecord) => void;
  canDelete: boolean;
  formatEquipment: (value: string | undefined) => string;
}) {
  const totalCost = getMaintenanceTotalCost(record);

  return (
    <tr
      role="button"
      tabIndex={0}
      aria-label={`Abrir manutenção: ${formatEquipment(record.equipment)}`}
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
            {formatEquipment(record.equipment)}
          </span>
        </div>
      </td>
      <td className="px-6 py-4 text-sm font-medium text-on-surface">{record.type}</td>
      <td className="px-6 py-4 text-sm font-bold text-on-surface">{record.item || "—"}</td>
      <td className="px-6 py-4 text-sm font-bold text-on-surface-variant">
        {record.submittedBy || "—"}
      </td>
      <td className="px-6 py-4 text-sm font-black text-primary whitespace-nowrap">
        {totalCost.toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        })}
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
      {canDelete && (
        <td className="px-6 py-4">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-status-error/40 text-status-error hover:bg-status-error/10"
            onClick={(event) => {
              event.stopPropagation();
              onRequestDelete(record);
            }}
          >
            <Icon name="delete" />
            Excluir
          </Button>
        </td>
      )}
    </tr>
  );
}

function MaintenanceCard({
  record,
  onOpen,
  onRequestDelete,
  canDelete,
  formatEquipment,
}: {
  record: MaintenanceRecord;
  onOpen: (record: MaintenanceRecord) => void;
  onRequestDelete: (record: MaintenanceRecord) => void;
  canDelete: boolean;
  formatEquipment: (value: string | undefined) => string;
}) {
  const totalCost = getMaintenanceTotalCost(record);

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onOpen(record)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(record);
        }
      }}
      className="border border-border-low rounded-lg p-3 sm:p-4 text-left hover:border-primary/50 hover:shadow-md transition-industrial group bg-surface-highest/50"
    >
      <div className="flex items-start justify-between gap-2 mb-2 sm:mb-3">
        <Icon name="build" className="text-primary text-xl sm:text-2xl" />
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
      <h3 className="text-sm sm:text-base font-bold text-on-surface group-hover:text-primary transition-colors mb-1 leading-tight break-words">
        {formatEquipment(record.equipment)}
      </h3>
      <p className="text-xs text-on-surface-variant mb-1 sm:mb-3">{record.type}</p>
      <p className="mb-3 text-xs font-bold text-on-surface sm:hidden line-clamp-2">
        {record.item || "Sem item informado"}
      </p>
      <div className="mb-3 flex items-center justify-between rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
        <span className="font-black uppercase tracking-wider text-on-surface-variant">Custo</span>
        <span className="font-black text-primary">
          {totalCost.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          })}
        </span>
      </div>
      <dl className="hidden sm:block space-y-2 text-xs text-on-surface-variant mb-3 pb-3 border-b border-border-low">
        <div className="flex justify-between">
          <dt>Aberto por:</dt>
          <dd className="font-bold text-on-surface">{record.submittedBy || "—"}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Criado em:</dt>
          <dd className="font-bold text-on-surface">{formatBrDate(record.createdAt)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Item / Componente:</dt>
          <dd className="font-bold text-on-surface text-right truncate">{record.item || "—"}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-low pt-2 sm:border-t-0 sm:pt-0">
        <div className="text-[11px] sm:text-xs font-black text-primary uppercase tracking-widest flex items-center gap-1">
          <Icon name="arrow_forward" />
          Abrir manutenção
        </div>
        {canDelete && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-status-error/40 text-status-error hover:bg-status-error/10"
            onClick={(event) => {
              event.stopPropagation();
              onRequestDelete(record);
            }}
          >
            <Icon name="delete" />
            Excluir
          </Button>
        )}
      </div>
    </article>
  );
}

function StatusBadge({ status }: { status: MaintenanceStatus }) {
  return (
    <span
      className={`px-2 sm:px-3 py-0.5 sm:py-1 text-[9px] sm:text-[10px] font-black uppercase tracking-widest rounded border ${
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
  equipmentOptions,
  onDraftChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: MaintenanceDraft;
  equipmentOptions: EquipmentOption[];
  onDraftChange: (draft: MaintenanceDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const user = useAuthStore((snapshot) => snapshot.user);
  const setValue = <K extends keyof MaintenanceDraft>(key: K, value: MaintenanceDraft[K]) =>
    onDraftChange({ ...draft, [key]: value });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-0.75rem)] max-w-2xl max-h-[90vh] overflow-y-auto p-3 sm:p-6">
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
              options={equipmentOptions}
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
          </div>
          <label className="flex items-start gap-3 rounded-lg border border-status-success/30 bg-status-success/10 p-4 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.status === "Concluída"}
              onChange={(event) =>
                setValue("status", event.target.checked ? "Concluída" : "Aberta")
              }
              className="mt-1 h-4 w-4 accent-primary"
            />
            <span>
              <span className="block text-sm font-black uppercase tracking-wider text-status-success">
                Já registrar manutenção concluída
              </span>
              <span className="mt-1 block text-xs text-on-surface-variant">
                Use quando o serviço já foi executado e deve entrar diretamente no histórico.
              </span>
            </span>
          </label>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4 border-t border-border-low">
            <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant block">
              Fornecedor
              <input
                type="text"
                value={draft.supplierName}
                onChange={(event) => setValue("supplierName", event.target.value)}
                placeholder="Ex: Oficina Diesel Sul"
                className="mt-2 w-full px-3 py-2 bg-surface-highest border border-border-low rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
              />
            </label>
            <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant block">
              Peça / serviço
              <input
                type="text"
                value={draft.materialDescription}
                onChange={(event) => setValue("materialDescription", event.target.value)}
                placeholder="Ex: Bomba hidráulica + mangueiras"
                className="mt-2 w-full px-3 py-2 bg-surface-highest border border-border-low rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
              />
            </label>
            <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant block">
              Valor (R$)
              <input
                type="number"
                step="0.01"
                min="0"
                value={draft.cost}
                onChange={(event) => setValue("cost", Number.parseFloat(event.target.value) || 0)}
                className="mt-2 w-full px-3 py-2 bg-surface-highest border border-border-low rounded-lg text-sm font-mono text-on-surface outline-none focus:ring-2 focus:ring-primary"
              />
            </label>
          </div>
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
  record: incomingRecord,
  equipmentLabel,
  movements,
  inventoryItems,
  actions,
  canDelete,
  onRequestDelete,
  onOpenChange,
}: {
  record: MaintenanceRecord | null;
  equipmentLabel: string;
  movements: StockMovement[];
  inventoryItems: InventoryItem[];
  actions: ReturnType<typeof useMaintenanceActions>;
  canDelete: boolean;
  onRequestDelete: (record: MaintenanceRecord) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [record, setRecord] = useState<MaintenanceRecord | null>(incomingRecord);
  const movementCost = movements.reduce((sum, movement) => sum + movement.costImpact, 0);
  const inventoryCost = record ? Math.max(record.totalCost, movementCost) : movementCost;
  const supplierCost = record ? getMaintenanceExternalCost(record) : 0;
  const totalCost = inventoryCost + supplierCost;
  const [stepNotes, setStepNotes] = useState<Record<string, string>>({});
  const [completionComments, setCompletionComments] = useState<Record<string, string>>({});
  const [stepAttachments, setStepAttachments] = useState<Record<string, AttachedFile[]>>({});
  const [waitingPart, setWaitingPart] = useState("");
  const [costDraft, setCostDraft] = useState<MaintenanceCostDraft>({
    supplierName: "",
    partName: "",
    amount: 0,
  });
  const [savingCost, setSavingCost] = useState(false);
  const [removeCostTarget, setRemoveCostTarget] = useState<MaintenanceCostEntry | null>(null);
  const [removingCost, setRemovingCost] = useState(false);
  const [completionNote, setCompletionNote] = useState("");
  const [completingRecord, setCompletingRecord] = useState(false);
  const activeStepIndex = record ? getActiveStepIndex(record.steps) : -1;

  useEffect(() => {
    setRecord(incomingRecord);
  }, [incomingRecord]);

  useEffect(() => {
    setWaitingPart("");
    setCostDraft({ supplierName: "", partName: "", amount: 0 });
    setRemoveCostTarget(null);
    setCompletionNote("");
  }, [record?.id]);

  const registerSupplierCost = async () => {
    if (!record) return;
    if (!costDraft.supplierName.trim() || !costDraft.partName.trim() || costDraft.amount <= 0) {
      toast.error("Informe fornecedor, peça e valor.");
      return;
    }

    setSavingCost(true);
    try {
      const updatedRecord = await actions.addExternalCost(record.id, costDraft);
      if (updatedRecord) setRecord(updatedRecord);
      setCostDraft({ supplierName: "", partName: "", amount: 0 });
      toast.success("Custo da manutenção registrado.");
    } catch {
      toast.error("Não foi possível registrar o custo.");
    } finally {
      setSavingCost(false);
    }
  };

  const removeSupplierCost = async () => {
    if (!record || !removeCostTarget) return;

    setRemovingCost(true);
    try {
      const updatedRecord = await actions.removeExternalCost(record.id, removeCostTarget.id);
      if (updatedRecord) setRecord(updatedRecord);
      setRemoveCostTarget(null);
      toast.success("Peça removida do custo da manutenção.");
    } catch {
      toast.error("Não foi possível remover a peça.");
    } finally {
      setRemovingCost(false);
    }
  };

  const finishExistingMaintenance = async () => {
    if (!record) return;
    setCompletingRecord(true);
    try {
      const updatedRecord = await actions.completeRecord(record.id, completionNote);
      if (updatedRecord) setRecord(updatedRecord);
      setCompletionNote("");
      toast.success("Manutenção registrada como concluída.");
    } catch {
      toast.error("Não foi possível concluir a manutenção.");
    } finally {
      setCompletingRecord(false);
    }
  };

  const startStep = async (recordId: string, stepId: string, note?: string) => {
    const updatedRecord = await actions.startStep(recordId, stepId, note);
    if (updatedRecord) setRecord(updatedRecord);
    return updatedRecord;
  };

  const completeStep = async (
    recordId: string,
    stepId: string,
    comment?: string,
    attachments?: AttachedFile[],
  ) => {
    const updatedRecord = await actions.completeStep(recordId, stepId, comment, attachments);
    if (updatedRecord) setRecord(updatedRecord);
    return updatedRecord;
  };

  return (
    <Dialog open={Boolean(record)} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-0.75rem)] max-w-2xl max-h-[90vh] overflow-y-auto p-3 sm:p-6">
        {record && (
          <>
            <DialogHeader className="space-y-2 pr-8 sm:space-y-3 sm:pr-7">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <DialogTitle className="text-lg sm:text-2xl font-black uppercase leading-tight break-words">
                  {equipmentLabel}
                </DialogTitle>
                <div className="flex flex-wrap gap-1 self-start sm:shrink-0 sm:gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 w-9 p-0"
                    onClick={() => exportMaintenanceAsPdf(record, movements)}
                    aria-label="Exportar PDF"
                  >
                    <Icon name="picture_as_pdf" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 w-9 p-0"
                    onClick={() => exportMaintenanceAsCsv(record, movements)}
                    aria-label="Exportar CSV"
                  >
                    <Icon name="table_view" />
                  </Button>
                  {canDelete && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 px-2 sm:px-3 border-status-error/40 text-status-error hover:bg-status-error/10"
                      onClick={() => onRequestDelete(record)}
                      aria-label="Excluir manutenção"
                    >
                      <Icon name="delete" />
                      <span className="hidden sm:inline">Excluir</span>
                    </Button>
                  )}
                </div>
              </div>
            </DialogHeader>
            <div className="space-y-4 sm:space-y-5">
              <div className="grid grid-cols-3 sm:grid-cols-2 gap-2 sm:gap-3">
                <Info label="OS" value={record.id} valueClassName="break-all" />
                <Info label="Tipo" value={record.type} />
                <Info label="Status" value={record.status} />
                <Info
                  label="Aberto por"
                  value={record.submittedBy || "—"}
                  className="col-span-3 sm:col-span-1"
                />
                <Info
                  label="Peças do estoque"
                  value={inventoryCost.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                />
                <Info
                  label="Fornecedor / serviços"
                  value={supplierCost.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                />
                <Info
                  label="Custo total"
                  value={totalCost.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                  valueClassName="text-primary"
                />
              </div>
              <div className="bg-surface-highest border border-border-low rounded-lg p-3 sm:p-4">
                <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                  Item / Componente
                </p>
                <p className="text-sm font-bold text-on-surface mt-1 break-words">
                  {record.item || "—"}
                </p>
              </div>
              <div className="bg-surface-highest border border-border-low rounded-lg p-3 sm:p-4">
                <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                  Serviço a executar
                </p>
                <p className="text-sm text-on-surface mt-1 whitespace-pre-wrap break-words">
                  {record.serviceDescription || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant mb-3">
                  Pipeline da manutenção
                </p>
                {record.status !== "Concluída" && !completingRecord && (
                  <div className="mb-4 rounded-lg border border-status-success/30 bg-status-success/10 p-4">
                    <p className="text-sm font-black uppercase tracking-wider text-status-success">
                      Serviço já realizado?
                    </p>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      Finalize a ordem diretamente quando a manutenção já estiver concluída.
                    </p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <input
                        value={completionNote}
                        onChange={(event) => setCompletionNote(event.target.value)}
                        placeholder="Observação da conclusão (opcional)"
                        className="flex-1 rounded border border-border-low bg-surface-container px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                      />
                      <Button
                        type="button"
                        onClick={finishExistingMaintenance}
                        isLoading={completingRecord}
                        className="gap-2"
                      >
                        <Icon name="check_circle" />
                        Registrar como concluída
                      </Button>
                    </div>
                  </div>
                )}
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
                      onStartStep={startStep}
                      onCompleteStep={completeStep}
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
                    onClick={async () => {
                      const updatedRecord = await actions.addWaitingPart(record.id, waitingPart);
                      if (updatedRecord) setRecord(updatedRecord);
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
              <section className="bg-surface-highest border border-border-low rounded-lg p-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-on-surface-variant mb-3 flex items-center gap-2">
                  <Icon name="receipt_long" className="text-primary text-base" />
                  Custos da manutenção
                </h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    value={costDraft.supplierName}
                    onChange={(event) =>
                      setCostDraft((current) => ({
                        ...current,
                        supplierName: event.target.value,
                      }))
                    }
                    placeholder="Fornecedor"
                    className="min-w-0 px-3 py-2 bg-surface-container border border-border-low rounded text-sm"
                  />
                  <input
                    value={costDraft.partName}
                    onChange={(event) =>
                      setCostDraft((current) => ({ ...current, partName: event.target.value }))
                    }
                    placeholder="Peça / serviço"
                    className="min-w-0 px-3 py-2 bg-surface-container border border-border-low rounded text-sm"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={costDraft.amount || ""}
                    onChange={(event) =>
                      setCostDraft((current) => ({
                        ...current,
                        amount: Number.parseFloat(event.target.value) || 0,
                      }))
                    }
                    placeholder="Valor (R$)"
                    className="min-w-0 px-3 py-2 bg-surface-container border border-border-low rounded text-sm font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={registerSupplierCost}
                    isLoading={savingCost}
                    className="w-full"
                  >
                    Registrar custo
                  </Button>
                </div>
                {record.costEntries.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    {record.costEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="grid gap-1 rounded border border-border-low bg-surface-container p-3 text-sm sm:grid-cols-[1fr_1fr_auto] sm:items-center sm:gap-3"
                      >
                        <div>
                          <p className="font-bold text-on-surface">
                            {entry.partName || "Material"}
                          </p>
                          <p className="text-xs text-on-surface-variant">
                            {entry.supplierName || "Fornecedor não informado"}
                          </p>
                        </div>
                        <p className="text-xs text-on-surface-variant">
                          {formatBrDateTime(entry.createdAt)}
                          {entry.createdBy ? ` por ${entry.createdBy}` : ""}
                        </p>
                        <div className="flex items-center justify-between gap-2 sm:justify-end">
                          <strong className="font-mono text-primary">
                            {entry.amount.toLocaleString("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            })}
                          </strong>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 shrink-0 p-0 border-status-error/40 text-status-error hover:bg-status-error/10"
                            onClick={() => setRemoveCostTarget(entry)}
                            aria-label={`Remover ${entry.partName || "peça"}`}
                            title="Remover peça"
                          >
                            <Icon name="delete" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-on-surface-variant">
                    Nenhum custo de fornecedor registrado nesta manutenção.
                  </p>
                )}
              </section>
              <AlertDialog
                open={Boolean(removeCostTarget)}
                onOpenChange={(open) => {
                  if (!open && !removingCost) setRemoveCostTarget(null);
                }}
              >
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remover peça?</AlertDialogTitle>
                    <AlertDialogDescription>
                      O lançamento de {removeCostTarget?.partName || "peça / serviço"} no valor de{" "}
                      {removeCostTarget?.amount.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}{" "}
                      será removido do custo desta manutenção.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={removingCost}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        void removeSupplierCost();
                      }}
                      disabled={removingCost}
                      className="bg-status-error text-white hover:bg-status-error/90"
                    >
                      {removingCost ? "Removendo..." : "Remover"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
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
  onStartStep,
  onCompleteStep,
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
  onStartStep: (recordId: string, stepId: string, note?: string) => Promise<unknown>;
  onCompleteStep: (
    recordId: string,
    stepId: string,
    comment?: string,
    attachments?: AttachedFile[],
  ) => Promise<unknown>;
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
            onClick={() => void onStartStep(recordId, step.id, note)}
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
            onClick={async () => {
              await onCompleteStep(recordId, step.id, comment, attachments);
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
  options: readonly EquipmentOption[];
  onChange: (value: string) => void;
}) {
  const hasValue = !value || options.some((option) => option.value === value);

  return (
    <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full px-3 py-2 bg-surface-highest border border-border-low rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
      >
        <option value="">Selecione</option>
        {!hasValue && <option value={value}>{value}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
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

function Info({
  label,
  value,
  className = "",
  valueClassName = "",
}: {
  label: string;
  value: string;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div
      className={`bg-surface-highest border border-border-low rounded-lg p-2.5 sm:p-3 ${className}`}
    >
      <p className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-on-surface-variant leading-tight">
        {label}
      </p>
      <p className={`text-sm sm:text-base font-bold text-on-surface mt-1 leading-tight ${valueClassName}`}>
        {value}
      </p>
    </div>
  );
}
