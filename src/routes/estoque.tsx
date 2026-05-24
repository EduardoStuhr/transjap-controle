import { createFileRoute } from "@tanstack/react-router";
import { memo, useCallback, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AppLayout, Icon } from "@/components/AppLayout";
import { InventoryLabels } from "@/components/InventoryLabels";
import { SmartScanner } from "@/components/SmartScanner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getInventoryAlerts, useInventoryActions, useInventoryStore } from "@/lib/inventory-store";
import {
  INVENTORY_CATEGORIES,
  STOCK_UNITS,
  type InventoryCategory,
  type InventoryDraft,
  type InventoryItem,
  type LocationDraft,
  type LocationKind,
  type MovementDraft,
  type StockMovement,
  type StockLocation,
  type StockMovementType,
  type StockUnit,
  type UserRole,
} from "@/lib/inventory-types";
import { useEquipmentStore } from "@/lib/equipment-store";
import { buildEquipmentOptions, type EquipmentOption } from "@/lib/operational-options";

export const Route = createFileRoute("/estoque")({ component: Estoque });

const LOCATION_KINDS: LocationKind[] = [
  "Corredor",
  "Estante",
  "Prateleira",
  "Gaveta",
  "Bin",
  "Caixa",
  "Kit",
];

const MOVEMENT_TYPES: StockMovementType[] = [
  "entrada",
  "saída",
  "transferência",
  "ajuste",
  "perda",
  "uso em manutenção",
];

const USER_ROLES: UserRole[] = [
  "administrador",
  "gestor",
  "almoxarifado",
  "mecânico",
  "operador",
  "visualização",
];

const EMPTY_ITEM: InventoryDraft = {
  name: "",
  category: "Peças",
  subcategory: "",
  manufacturer: "",
  internalCode: "",
  sku: "",
  barcode: "",
  technicalDescription: "",
  unit: "un",
  locationId: "",
  physicalLocation: "",
  minStock: 0,
  currentStock: 0,
  cost: 0,
  supplier: "",
  images: [],
  notes: "",
  critical: false,
  validityDate: "",
};

const EMPTY_LOCATION: LocationDraft = {
  name: "",
  kind: "Gaveta",
  parentId: "",
  code: "",
  description: "",
};

const EMPTY_MOVEMENT: MovementDraft = {
  type: "entrada",
  itemId: "",
  quantity: 1,
  responsible: "",
  note: "",
  equipment: "",
  maintenanceId: "",
  toLocationId: "",
};

function Estoque() {
  const inventoryActions = useInventoryActions();
  const items = useInventoryStore((snapshot) => snapshot.items);
  const equipments = useEquipmentStore((snapshot) => snapshot.equipments);
  const locations = useInventoryStore((snapshot) => snapshot.locations);
  const movements = useInventoryStore((snapshot) => snapshot.movements);
  const offlineQueue = useInventoryStore((snapshot) => snapshot.offlineQueue);
  const currentRole = useInventoryStore((snapshot) => snapshot.currentRole);
  const snapshot = useInventoryStore((state) => state);
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  const alerts = useMemo(() => getInventoryAlerts(snapshot), [snapshot]);
  const [search, setSearch] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [continuousScan, setContinuousScan] = useState(true);
  const [itemDraft, setItemDraft] = useState<InventoryDraft>(EMPTY_ITEM);
  const [locationDraft, setLocationDraft] = useState<LocationDraft>(EMPTY_LOCATION);
  const [movementDraft, setMovementDraft] = useState<MovementDraft>(EMPTY_MOVEMENT);
  const equipmentOptions = useMemo(() => buildEquipmentOptions(equipments), [equipments]);

  const filteredItems = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter((item) => {
      const location = locations.find((candidate) => candidate.id === item.locationId);
      const matchesSearch =
        !needle ||
        [
          item.name,
          item.internalCode,
          item.sku,
          item.barcode,
          item.qrCode,
          item.category,
          item.subcategory,
          item.manufacturer,
          item.supplier,
          item.physicalLocation,
          location?.name || "",
          location?.code || "",
        ].some((field) => field.toLowerCase().includes(needle));
      const matchesLocation = !selectedLocationId || item.locationId === selectedLocationId;
      return matchesSearch && matchesLocation;
    });
  }, [items, locations, search, selectedLocationId]);

  const dashboard = useMemo(() => {
    const stockValue = items.reduce((sum, item) => sum + item.currentStock * item.cost, 0);
    const critical = alerts.filter((alert) => alert.tone === "error").length;
    const usedByEquipment = movements
      .filter((movement) => movement.equipment)
      .reduce<Record<string, number>>((acc, movement) => {
        acc[movement.equipment] = (acc[movement.equipment] || 0) + movement.costImpact;
        return acc;
      }, {});
    const mostUsed = movements
      .filter((movement) => movement.type === "saída" || movement.type === "uso em manutenção")
      .reduce<Record<string, number>>((acc, movement) => {
        acc[movement.itemName] = (acc[movement.itemName] || 0) + movement.quantity;
        return acc;
      }, {});

    return {
      stockValue,
      critical,
      recent: movements.slice(0, 8),
      usedByEquipment: Object.entries(usedByEquipment).slice(0, 5),
      mostUsed: Object.entries(mostUsed)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
    };
  }, [alerts, items, movements]);

  const selectedItem = items.find((item) => item.id === selectedItemId) || null;
  const selectedLocation = locations.find((location) => location.id === selectedLocationId) || null;
  const canWrite = currentRole !== "visualização";

  const handleScan = useCallback(
    (value: string) => {
      const result = inventoryActions.resolveScan(value);
      if (!result) {
        toast.error("Código não encontrado", { description: value });
        return;
      }

      if (result.type === "item") {
        setSelectedItemId(result.item.id);
        setMovementDraft((draft) => ({ ...draft, itemId: result.item.id }));
        toast.success("Peça encontrada", { description: result.item.name });
        return;
      }

      setSelectedLocationId(result.location.id);
      toast.success("Localização aberta", { description: result.location.name });
    },
    [inventoryActions],
  );

  const saveItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canWrite) return;
    if (!itemDraft.name.trim()) {
      toast.error("Nome obrigatório", { description: "Informe o nome da peça ou material." });
      return;
    }
    await inventoryActions.saveItem(itemDraft);
    setItemDraft(EMPTY_ITEM);
    toast.success("Item salvo", {
      description: "Cadastro disponível para leitura e movimentação.",
    });
  };

  const saveLocation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canWrite) return;
    if (!locationDraft.name.trim()) {
      toast.error("Nome obrigatório", { description: "Informe a localização física." });
      return;
    }
    await inventoryActions.saveLocation(locationDraft);
    setLocationDraft(EMPTY_LOCATION);
    toast.success("Localização salva", { description: "Etiqueta QR disponível para impressão." });
  };

  const applyMovement = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canWrite) return;
    const movement = (await inventoryActions.applyMovement(movementDraft)) as StockMovement | null;
    if (!movement) {
      toast.error("Selecione uma peça", { description: "Leia ou escolha um item do estoque." });
      return;
    }
    setSelectedItemId(movement.itemId);
    setMovementDraft((draft) => ({
      ...EMPTY_MOVEMENT,
      type: draft.type,
      responsible: draft.responsible,
      itemId: movement.itemId,
    }));
    toast.success("Movimentação registrada", {
      description: `${movement.itemName}: ${movement.previousStock} → ${movement.nextStock}`,
    });
  };

  const quickMove = async (type: StockMovementType, quantity: number) => {
    if (!selectedItem) {
      toast.error("Selecione uma peça", { description: "Leia um código ou toque em um item." });
      return;
    }

    const movement = (await inventoryActions.applyMovement({
      ...movementDraft,
      type,
      itemId: selectedItem.id,
      quantity,
    })) as StockMovement | null;
    if (movement) {
      toast.success("Movimento rápido", {
        description: `${movement.itemName}: ${movement.nextStock}`,
      });
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-6">
        <div>
          <span className="text-[10px] font-black text-primary uppercase tracking-[0.3em] block mb-2">
            Plataforma operacional
          </span>
          <h1 className="text-2xl md:text-4xl font-black tracking-tight text-on-surface uppercase">
            Estoque inteligente
          </h1>
          <p className="text-sm text-on-surface-variant mt-2 max-w-3xl">
            Controle mobile-first de peças, ferramentas, insumos, localizações, leituras,
            movimentações, alertas e consumo em manutenção.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <label className="bg-surface-container border border-border-low rounded-lg p-2 flex items-center gap-2">
            <Icon name="admin_panel_settings" className="text-primary" />
            <select
              value={currentRole}
              onChange={(event) => inventoryActions.setRole(event.target.value as UserRole)}
              className="bg-transparent text-xs font-bold outline-none"
            >
              {USER_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-2 bg-surface-container border border-border-low rounded-lg p-2">
            <Icon name={online ? "cloud_done" : "cloud_off"} className="text-primary" />
            <span className="text-xs font-bold text-on-surface-variant">
              {online ? "Online" : "Offline"} · {offlineQueue.length} pendente(s)
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Metric icon="inventory_2" label="Itens" value={items.length.toString()} />
        <Metric icon="location_on" label="Localizações" value={locations.length.toString()} />
        <Metric icon="warning" label="Alertas" value={alerts.length.toString()} tone="warning" />
        <Metric
          icon="payments"
          label="Valor em estoque"
          value={dashboard.stockValue.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          })}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-5">
        <div className="space-y-5">
          <SmartScanner active continuous={continuousScan} onScan={handleScan} />

          <Tabs defaultValue="movimentar" className="w-full">
            <TabsList className="grid grid-cols-3 lg:grid-cols-6 w-full">
              <TabsTrigger value="movimentar">Mover</TabsTrigger>
              <TabsTrigger value="itens">Itens</TabsTrigger>
              <TabsTrigger value="cadastro">Cadastro</TabsTrigger>
              <TabsTrigger value="locais">Locais</TabsTrigger>
              <TabsTrigger value="historico">Histórico</TabsTrigger>
              <TabsTrigger value="etiquetas">Etiquetas</TabsTrigger>
            </TabsList>

            <TabsContent value="movimentar" className="mt-5 space-y-5">
              <section className="bg-surface-container border border-border-low rounded-lg p-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-widest">
                      Movimentação rápida
                    </h2>
                    <p className="text-xs text-on-surface-variant mt-1">
                      Leitura contínua, incremento/decremento, transferência, ajuste e uso em
                      manutenção.
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs font-bold text-on-surface-variant">
                    <input
                      type="checkbox"
                      checked={continuousScan}
                      onChange={(event) => setContinuousScan(event.target.checked)}
                    />
                    leitura contínua
                  </label>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                  <Button
                    type="button"
                    onClick={() => quickMove("entrada", 1)}
                    disabled={!canWrite}
                    className="gap-2"
                  >
                    <Icon name="add" /> +1
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => quickMove("saída", 1)}
                    disabled={!canWrite}
                    className="gap-2"
                  >
                    <Icon name="remove" /> -1
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => quickMove("entrada", 10)}
                    disabled={!canWrite}
                    className="gap-2"
                  >
                    <Icon name="inventory" /> +10
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => quickMove("perda", 1)}
                    disabled={!canWrite}
                    className="gap-2"
                  >
                    <Icon name="report" /> perda
                  </Button>
                </div>

                <MovementForm
                  draft={movementDraft}
                  items={items}
                  locations={locations}
                  equipmentOptions={equipmentOptions}
                  onChange={setMovementDraft}
                  onSubmit={applyMovement}
                  disabled={!canWrite}
                />
              </section>
            </TabsContent>

            <TabsContent value="itens" className="mt-5">
              <section className="bg-surface-container border border-border-low rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_240px] gap-3 mb-4">
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar por nome, código, QR, localização, categoria, fabricante ou equipamento"
                    className="px-4 py-3 bg-surface-highest border border-border-low rounded-lg text-on-surface placeholder:text-on-surface-variant/50 focus:ring-2 focus:ring-primary outline-none"
                  />
                  <select
                    value={selectedLocationId}
                    onChange={(event) => setSelectedLocationId(event.target.value)}
                    className="px-4 py-3 bg-surface-highest border border-border-low rounded-lg"
                  >
                    <option value="">Todas as localizações</option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                </div>
                <VirtualInventoryList
                  items={filteredItems}
                  selectedItemId={selectedItemId}
                  onSelect={(item) => {
                    setSelectedItemId(item.id);
                    setMovementDraft((draft) => ({ ...draft, itemId: item.id }));
                  }}
                />
              </section>
            </TabsContent>

            <TabsContent value="cadastro" className="mt-5">
              <ItemForm
                draft={itemDraft}
                locations={locations}
                onChange={setItemDraft}
                onSubmit={saveItem}
              />
            </TabsContent>

            <TabsContent value="locais" className="mt-5 space-y-5">
              <LocationForm
                draft={locationDraft}
                locations={locations}
                onChange={setLocationDraft}
                onSubmit={saveLocation}
              />
              <LocationList
                locations={locations}
                selectedLocationId={selectedLocationId}
                onSelect={setSelectedLocationId}
              />
            </TabsContent>

            <TabsContent value="historico" className="mt-5">
              <HistoryList movements={movements} />
            </TabsContent>

            <TabsContent value="etiquetas" className="mt-5">
              <InventoryLabels items={items} locations={locations} />
            </TabsContent>
          </Tabs>
        </div>

        <aside className="space-y-5">
          <SelectionPanel
            item={selectedItem}
            location={selectedLocation}
            locationItems={items.filter((item) => item.locationId === selectedLocationId)}
          />
          <AlertsPanel alerts={alerts} onSelectItem={setSelectedItemId} />
          <DashboardPanel
            recent={dashboard.recent}
            mostUsed={dashboard.mostUsed}
            usedByEquipment={dashboard.usedByEquipment}
          />
        </aside>
      </div>
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
  value: string;
  tone?: "default" | "warning";
}) {
  return (
    <div className="bg-surface-container border border-border-low rounded-lg p-4">
      <Icon name={icon} className={tone === "warning" ? "text-status-warning" : "text-primary"} />
      <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-black mt-3">
        {label}
      </p>
      <p className="text-2xl font-black text-on-surface mt-1">{value}</p>
    </div>
  );
}

function ItemForm({
  draft,
  locations,
  onChange,
  onSubmit,
}: {
  draft: InventoryDraft;
  locations: StockLocation[];
  onChange: (draft: InventoryDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const setValue = <K extends keyof InventoryDraft>(key: K, value: InventoryDraft[K]) =>
    onChange({ ...draft, [key]: value });

  return (
    <form
      onSubmit={onSubmit}
      className="bg-surface-container border border-border-low rounded-lg p-4"
    >
      <h2 className="text-sm font-black uppercase tracking-widest mb-4">Cadastro de peça</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <TextField
          label="Nome da peça"
          value={draft.name}
          onChange={(value) => setValue("name", value)}
          required
        />
        <SelectField
          label="Categoria"
          value={draft.category}
          onChange={(value) => setValue("category", value as InventoryCategory)}
          options={INVENTORY_CATEGORIES}
        />
        <TextField
          label="Subcategoria"
          value={draft.subcategory}
          onChange={(value) => setValue("subcategory", value)}
        />
        <TextField
          label="Fabricante"
          value={draft.manufacturer}
          onChange={(value) => setValue("manufacturer", value)}
        />
        <TextField
          label="Código interno"
          value={draft.internalCode}
          onChange={(value) => setValue("internalCode", value)}
        />
        <TextField label="SKU" value={draft.sku} onChange={(value) => setValue("sku", value)} />
        <TextField
          label="Código de barras"
          value={draft.barcode}
          onChange={(value) => setValue("barcode", value)}
        />
        <SelectField
          label="Unidade"
          value={draft.unit}
          onChange={(value) => setValue("unit", value as StockUnit)}
          options={STOCK_UNITS}
        />
        <SelectField
          label="Localização física"
          value={draft.locationId}
          onChange={(value) => setValue("locationId", value)}
          options={["", ...locations.map((location) => location.id)]}
          labels={Object.fromEntries(locations.map((location) => [location.id, location.name]))}
        />
        <TextField
          label="Fornecedor"
          value={draft.supplier}
          onChange={(value) => setValue("supplier", value)}
        />
        <NumberField
          label="Estoque mínimo"
          value={draft.minStock}
          onChange={(value) => setValue("minStock", value)}
        />
        <NumberField
          label="Estoque atual"
          value={draft.currentStock}
          onChange={(value) => setValue("currentStock", value)}
        />
        <NumberField
          label="Custo"
          value={draft.cost}
          onChange={(value) => setValue("cost", value)}
        />
        <TextField
          label="Validade"
          type="date"
          value={draft.validityDate}
          onChange={(value) => setValue("validityDate", value)}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
        <TextAreaField
          label="Descrição técnica"
          value={draft.technicalDescription}
          onChange={(value) => setValue("technicalDescription", value)}
        />
        <TextAreaField
          label="Observações"
          value={draft.notes}
          onChange={(value) => setValue("notes", value)}
        />
      </div>
      <label className="flex items-center gap-2 text-sm font-bold text-on-surface-variant mt-4">
        <input
          type="checkbox"
          checked={draft.critical}
          onChange={(event) => setValue("critical", event.target.checked)}
        />
        Peça crítica
      </label>
      <Button type="submit" className="mt-5 font-black gap-2">
        <Icon name="save" />
        Salvar item
      </Button>
    </form>
  );
}

function LocationForm({
  draft,
  locations,
  onChange,
  onSubmit,
}: {
  draft: LocationDraft;
  locations: StockLocation[];
  onChange: (draft: LocationDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const setValue = <K extends keyof LocationDraft>(key: K, value: LocationDraft[K]) =>
    onChange({ ...draft, [key]: value });

  return (
    <form
      onSubmit={onSubmit}
      className="bg-surface-container border border-border-low rounded-lg p-4"
    >
      <h2 className="text-sm font-black uppercase tracking-widest mb-4">Localização inteligente</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <TextField
          label="Nome"
          value={draft.name}
          onChange={(value) => setValue("name", value)}
          required
        />
        <SelectField
          label="Tipo"
          value={draft.kind}
          onChange={(value) => setValue("kind", value as LocationKind)}
          options={LOCATION_KINDS}
        />
        <TextField
          label="Código"
          value={draft.code}
          onChange={(value) => setValue("code", value)}
        />
        <SelectField
          label="Localização superior"
          value={draft.parentId}
          onChange={(value) => setValue("parentId", value)}
          options={["", ...locations.map((location) => location.id)]}
          labels={Object.fromEntries(locations.map((location) => [location.id, location.name]))}
        />
      </div>
      <div className="mt-3">
        <TextAreaField
          label="Descrição"
          value={draft.description}
          onChange={(value) => setValue("description", value)}
        />
      </div>
      <Button type="submit" className="mt-5 font-black gap-2">
        <Icon name="qr_code_2" />
        Salvar localização
      </Button>
    </form>
  );
}

function MovementForm({
  draft,
  items,
  locations,
  equipmentOptions,
  onChange,
  onSubmit,
  disabled = false,
}: {
  draft: MovementDraft;
  items: InventoryItem[];
  locations: StockLocation[];
  equipmentOptions: EquipmentOption[];
  onChange: (draft: MovementDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  disabled?: boolean;
}) {
  const setValue = <K extends keyof MovementDraft>(key: K, value: MovementDraft[K]) =>
    onChange({ ...draft, [key]: value });

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <SelectField
        label="Peça"
        value={draft.itemId}
        onChange={(value) => setValue("itemId", value)}
        options={["", ...items.map((item) => item.id)]}
        labels={Object.fromEntries(items.map((item) => [item.id, item.name]))}
      />
      <SelectField
        label="Tipo"
        value={draft.type}
        onChange={(value) => setValue("type", value as StockMovementType)}
        options={MOVEMENT_TYPES}
      />
      <NumberField
        label="Quantidade"
        value={draft.quantity}
        onChange={(value) => setValue("quantity", value)}
      />
      <SelectField
        label="Transferir para"
        value={draft.toLocationId}
        onChange={(value) => setValue("toLocationId", value)}
        options={["", ...locations.map((location) => location.id)]}
        labels={Object.fromEntries(locations.map((location) => [location.id, location.name]))}
      />
      <TextField
        label="Responsável"
        value={draft.responsible}
        onChange={(value) => setValue("responsible", value)}
      />
      <SelectField
        label="Equipamento relacionado"
        value={draft.equipment}
        onChange={(value) => setValue("equipment", value)}
        options={["", ...equipmentOptions.map((equipment) => equipment.value)]}
        labels={Object.fromEntries(
          equipmentOptions.map((equipment) => [equipment.value, equipment.label]),
        )}
      />
      <TextField
        label="Manutenção"
        value={draft.maintenanceId}
        onChange={(value) => setValue("maintenanceId", value)}
      />
      <TextField
        label="Observação"
        value={draft.note}
        onChange={(value) => setValue("note", value)}
      />
      <Button type="submit" disabled={disabled} className="md:col-span-2 font-black gap-2">
        <Icon name="sync_alt" />
        Registrar movimentação
      </Button>
    </form>
  );
}

function VirtualInventoryList({
  items,
  selectedItemId,
  onSelect,
}: {
  items: InventoryItem[];
  selectedItemId: string;
  onSelect: (item: InventoryItem) => void;
}) {
  const rowHeight = 112;
  const height = Math.min(640, Math.max(240, items.length * rowHeight));
  const [scrollTop, setScrollTop] = useState(0);
  const range = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - 4);
    const end = Math.min(items.length, Math.ceil((scrollTop + height) / rowHeight) + 4);
    return { start, end };
  }, [height, items.length, scrollTop]);
  const visible = items.slice(range.start, range.end);

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-on-surface-variant">
        <Icon name="inventory_2" className="text-5xl opacity-30 mb-2" />
        <p>Nenhum item cadastrado</p>
      </div>
    );
  }

  return (
    <div
      className="relative overflow-y-auto"
      style={{ height }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div style={{ height: items.length * rowHeight, position: "relative" }}>
        {visible.map((item, index) => (
          <div
            key={item.id}
            className="absolute left-0 right-0"
            style={{ top: (range.start + index) * rowHeight, height: rowHeight }}
          >
            <InventoryItemRow
              item={item}
              selected={item.id === selectedItemId}
              onSelect={onSelect}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

const InventoryItemRow = memo(function InventoryItemRow({
  item,
  selected,
  onSelect,
}: {
  item: InventoryItem;
  selected: boolean;
  onSelect: (item: InventoryItem) => void;
}) {
  const low = item.currentStock <= item.minStock;

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={`w-full h-[104px] text-left rounded-lg border p-4 mb-2 transition-industrial ${
        selected
          ? "border-primary bg-primary/10"
          : "border-border-low bg-surface-highest hover:border-primary/50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-black text-on-surface truncate">{item.name}</p>
          <p className="text-xs text-on-surface-variant truncate">
            {item.category} · {item.subcategory || "Sem subcategoria"} ·{" "}
            {item.physicalLocation || "Sem local"}
          </p>
          <p className="font-mono text-[10px] text-on-surface-variant mt-2 truncate">
            {item.internalCode || item.sku || item.qrCode}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-2xl font-black ${low ? "text-status-error" : "text-on-surface"}`}>
            {item.currentStock}
          </p>
          <p className="text-[10px] uppercase tracking-widest text-on-surface-variant">
            {item.unit}
          </p>
        </div>
      </div>
    </button>
  );
});

function LocationList({
  locations,
  selectedLocationId,
  onSelect,
}: {
  locations: StockLocation[];
  selectedLocationId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="bg-surface-container border border-border-low rounded-lg p-4">
      <h2 className="text-sm font-black uppercase tracking-widest mb-4">Mapa físico</h2>
      {locations.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {locations.map((location) => (
            <button
              key={location.id}
              type="button"
              onClick={() => onSelect(location.id)}
              className={`text-left border rounded-lg p-4 ${
                selectedLocationId === location.id
                  ? "border-primary bg-primary/10"
                  : "border-border-low bg-surface-highest"
              }`}
            >
              <p className="font-black">{location.name}</p>
              <p className="text-xs text-on-surface-variant mt-1">
                {location.kind} · {location.code}
              </p>
              <p className="font-mono text-[10px] mt-2 break-all">{location.qrCode}</p>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-on-surface-variant">Nenhuma localização cadastrada</p>
      )}
    </section>
  );
}

function HistoryList({ movements }: { movements: StockMovement[] }) {
  return (
    <section className="bg-surface-container border border-border-low rounded-lg p-4">
      <h2 className="text-sm font-black uppercase tracking-widest mb-4">Histórico completo</h2>
      {movements.length > 0 ? (
        <div className="space-y-3">
          {movements.map((movement) => (
            <article
              key={movement.id}
              className="border border-border-low rounded-lg p-4 bg-surface-highest"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-on-surface">{movement.itemName}</p>
                  <p className="text-xs text-on-surface-variant mt-1">
                    {movement.type} · {new Date(movement.timestamp).toLocaleString("pt-BR")}
                  </p>
                </div>
                <span className="text-xs font-black text-primary">
                  {movement.previousStock} → {movement.nextStock}
                </span>
              </div>
              <dl className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3 text-xs text-on-surface-variant">
                <div>Responsável: {movement.responsible}</div>
                <div>Equipamento: {movement.equipment || "—"}</div>
                <div>
                  Custo:{" "}
                  {movement.costImpact.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </div>
              </dl>
              {movement.note && <p className="text-sm mt-3">{movement.note}</p>}
            </article>
          ))}
        </div>
      ) : (
        <p className="text-sm text-on-surface-variant">Nenhuma movimentação registrada</p>
      )}
    </section>
  );
}

function SelectionPanel({
  item,
  location,
  locationItems,
}: {
  item: InventoryItem | null;
  location: StockLocation | null;
  locationItems: InventoryItem[];
}) {
  return (
    <section className="bg-surface-container border border-border-low rounded-lg p-4 shadow-industrial">
      <h2 className="text-sm font-black uppercase tracking-widest mb-4">Contexto aberto</h2>
      {item ? (
        <div className="border border-border-low rounded-lg p-3 bg-surface-highest mb-3">
          <p className="font-black">{item.name}</p>
          <p className="text-xs text-on-surface-variant mt-1">
            {item.currentStock} {item.unit} em estoque
          </p>
          <p className="font-mono text-[10px] mt-2 break-all">{item.qrCode}</p>
        </div>
      ) : (
        <p className="text-sm text-on-surface-variant mb-3">Nenhuma peça selecionada</p>
      )}
      {location ? (
        <div className="border border-border-low rounded-lg p-3 bg-surface-highest">
          <p className="font-black">{location.name}</p>
          <p className="text-xs text-on-surface-variant mt-1">
            {locationItems.length} item(ns) vinculados
          </p>
          <div className="mt-3 space-y-2">
            {locationItems.slice(0, 5).map((locationItem) => (
              <p key={locationItem.id} className="text-xs flex justify-between gap-2">
                <span className="truncate">{locationItem.name}</span>
                <strong>{locationItem.currentStock}</strong>
              </p>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-on-surface-variant">Nenhuma localização aberta</p>
      )}
    </section>
  );
}

function AlertsPanel({
  alerts,
  onSelectItem,
}: {
  alerts: ReturnType<typeof getInventoryAlerts>;
  onSelectItem: (id: string) => void;
}) {
  return (
    <section className="bg-surface-container border border-border-low rounded-lg p-4 shadow-industrial">
      <h2 className="text-sm font-black uppercase tracking-widest mb-4">Alertas</h2>
      {alerts.length > 0 ? (
        <div className="space-y-2">
          {alerts.slice(0, 8).map((alert) => (
            <button
              key={alert.id}
              type="button"
              onClick={() => alert.itemId && onSelectItem(alert.itemId)}
              className={`w-full text-left rounded-lg p-3 border ${
                alert.tone === "error"
                  ? "border-status-error/30 bg-status-error/10"
                  : alert.tone === "warning"
                    ? "border-status-warning/30 bg-status-warning/10"
                    : "border-status-info/30 bg-status-info/10"
              }`}
            >
              <p className="text-sm font-black">{alert.title}</p>
              <p className="text-xs text-on-surface-variant mt-1">{alert.description}</p>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-on-surface-variant">Nenhum alerta ativo</p>
      )}
    </section>
  );
}

function DashboardPanel({
  recent,
  mostUsed,
  usedByEquipment,
}: {
  recent: StockMovement[];
  mostUsed: [string, number][];
  usedByEquipment: [string, number][];
}) {
  return (
    <section className="bg-surface-container border border-border-low rounded-lg p-4 shadow-industrial">
      <h2 className="text-sm font-black uppercase tracking-widest mb-4">Painel</h2>
      <div className="space-y-4">
        <MiniRank
          title="Peças mais usadas"
          rows={mostUsed.map(([label, value]) => [label, value.toString()])}
        />
        <MiniRank
          title="Custo por equipamento"
          rows={usedByEquipment.map(([label, value]) => [
            label,
            value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
          ])}
        />
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant mb-2">
            Movimentações recentes
          </p>
          {recent.length > 0 ? (
            <div className="space-y-2">
              {recent.slice(0, 5).map((movement) => (
                <p key={movement.id} className="text-xs flex justify-between gap-2">
                  <span className="truncate">{movement.itemName}</span>
                  <strong>{movement.type}</strong>
                </p>
              ))}
            </div>
          ) : (
            <p className="text-xs text-on-surface-variant">Sem dados ainda</p>
          )}
        </div>
      </div>
    </section>
  );
}

function MiniRank({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant mb-2">
        {title}
      </p>
      {rows.length > 0 ? (
        <div className="space-y-2">
          {rows.map(([label, value]) => (
            <p key={label} className="text-xs flex justify-between gap-2">
              <span className="truncate">{label}</span>
              <strong>{value}</strong>
            </p>
          ))}
        </div>
      ) : (
        <p className="text-xs text-on-surface-variant">Sem dados ainda</p>
      )}
    </div>
  );
}

function TextField({
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

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant">
      {label}
      <input
        type="number"
        min="0"
        step="0.01"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full px-3 py-2 bg-surface-highest border border-border-low rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  labels = {},
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  labels?: Record<string, string>;
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
          <option key={option || "empty"} value={option}>
            {option ? labels[option] || option : "—"}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant">
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
