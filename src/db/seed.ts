import { getDb } from "./client";
import { equipment } from "./schema";
import type { DbEquipmentInsert } from "./schema";

const SEED_ROWS: Omit<DbEquipmentInsert, "createdAt" | "updatedAt">[] = [
  {
    id: "FR-001",
    model: "Escavadeira CAT 320",
    icon: "snowmobile",
    hours: 8420,
    status: "Operação",
    tone: "success",
    location: "Obra Norte",
    lastMaintenance: "12/05/2026",
    seriesNumber: "CAT320-2019-001",
    acquisitionDate: "01/03/2019",
    manufacturer: "Caterpillar",
  },
  {
    id: "FR-002",
    model: "Caminhão Volvo FH-540",
    icon: "local_shipping",
    hours: 12345,
    status: "Manutenção",
    tone: "warning",
    location: "Oficina",
    lastMaintenance: "10/05/2026",
    seriesNumber: "VOLVO-FH540-2018-002",
    acquisitionDate: "15/08/2018",
    manufacturer: "Volvo",
  },
  {
    id: "FR-003",
    model: "Trator Komatsu D61",
    icon: "agriculture",
    hours: 5210,
    status: "Operação",
    tone: "success",
    location: "Obra Sul",
    lastMaintenance: "08/05/2026",
    seriesNumber: "KOMATSU-D61-2020-003",
    acquisitionDate: "22/11/2020",
    manufacturer: "Komatsu",
  },
  {
    id: "FR-004",
    model: "Pá Carregadeira CAT 950",
    icon: "construction",
    hours: 9876,
    status: "Parado",
    tone: "error",
    location: "Pátio",
    lastMaintenance: "05/05/2026",
    seriesNumber: "CAT950-2017-004",
    acquisitionDate: "10/07/2017",
    manufacturer: "Caterpillar",
  },
  {
    id: "FR-005",
    model: "Empilhadeira Hyster H80",
    icon: "forklift",
    hours: 3210,
    status: "Operação",
    tone: "success",
    location: "Almoxarifado",
    lastMaintenance: "04/05/2026",
    seriesNumber: "HYSTER-H80-2021-005",
    acquisitionDate: "14/02/2021",
    manufacturer: "Hyster",
  },
];

export async function seedEquipmentIfEmpty(d1: D1Database): Promise<void> {
  const db = getDb(d1);
  const existing = await db.select().from(equipment).limit(1).all();
  if (existing.length > 0) return;

  const now = new Date().toISOString();
  for (const row of SEED_ROWS) {
    await db.insert(equipment).values({ ...row, createdAt: now, updatedAt: now });
  }
}
