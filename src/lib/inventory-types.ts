export const INVENTORY_CATEGORIES = [
  "Peças",
  "Ferramentas",
  "Insumos",
  "Filtros",
  "Parafusos",
  "Porcas",
  "Arruelas",
  "Óleo",
  "Hidráulica",
  "Materiais operacionais",
] as const;

export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number];

export const STOCK_UNITS = ["un", "cx", "kit", "l", "kg", "m", "embalagem"] as const;

export type StockUnit = (typeof STOCK_UNITS)[number];

export type LocationKind =
  | "Corredor"
  | "Estante"
  | "Prateleira"
  | "Gaveta"
  | "Bin"
  | "Caixa"
  | "Kit";

export type StockMovementType =
  | "entrada"
  | "saída"
  | "transferência"
  | "ajuste"
  | "perda"
  | "uso em manutenção";

export type UserRole =
  | "administrador"
  | "gestor"
  | "almoxarifado"
  | "mecânico"
  | "operador"
  | "visualização";

export type InventoryItem = {
  id: string;
  name: string;
  category: InventoryCategory;
  subcategory: string;
  manufacturer: string;
  internalCode: string;
  sku: string;
  barcode: string;
  qrCode: string;
  technicalDescription: string;
  unit: StockUnit;
  locationId: string;
  physicalLocation: string;
  minStock: number;
  currentStock: number;
  cost: number;
  supplier: string;
  images: string[];
  notes: string;
  critical: boolean;
  validityDate: string;
  updatedAt: string;
};

export type StockLocation = {
  id: string;
  name: string;
  kind: LocationKind;
  parentId: string;
  code: string;
  qrCode: string;
  description: string;
  updatedAt: string;
};

export type StockMovement = {
  id: string;
  type: StockMovementType;
  itemId: string;
  itemName: string;
  quantity: number;
  previousStock: number;
  nextStock: number;
  fromLocationId?: string;
  toLocationId?: string;
  responsible: string;
  timestamp: string;
  note: string;
  equipment: string;
  maintenanceId: string;
  costImpact: number;
  syncStatus: "synced" | "pending";
};

export type InventoryAlert = {
  id: string;
  title: string;
  description: string;
  tone: "warning" | "error" | "info";
  itemId?: string;
};

export type InventoryDraft = Omit<InventoryItem, "id" | "qrCode" | "updatedAt">;

export type LocationDraft = Omit<StockLocation, "id" | "qrCode" | "updatedAt">;

export type MovementDraft = {
  type: StockMovementType;
  itemId: string;
  quantity: number;
  responsible: string;
  note: string;
  equipment: string;
  maintenanceId: string;
  toLocationId: string;
};
