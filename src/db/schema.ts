import { primaryKey, sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  role: text("role").notNull(), // "administrador" | "gestor" | "operador"
  passwordHash: text("password_hash").notNull(),
  createdAt: text("created_at").notNull(),
});

export const equipment = sqliteTable("equipment", {
  id: text("id").primaryKey(), // ex: "FR-001"
  model: text("model").notNull(),
  icon: text("icon").notNull(),
  hours: integer("hours").notNull().default(0),
  status: text("status").notNull(), // "Operação" | "Manutenção" | "Parado"
  tone: text("tone").notNull(),
  location: text("location").notNull(),
  lastMaintenance: text("last_maintenance").notNull(),
  seriesNumber: text("series_number"),
  acquisitionDate: text("acquisition_date"),
  manufacturer: text("manufacturer"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  equipment: text("equipment").notNull().default(""),
  assignedTo: text("assigned_to", { mode: "json" }).$type<string[]>().notNull(),
  sector: text("sector").notNull(),
  priority: text("priority").notNull(),
  deadline: text("deadline"),
  status: text("status").notNull(),
  createdBy: text("created_by").notNull().default(""),
  attachments: text("attachments", { mode: "json" }).$type<unknown[]>().notNull().default([]),
  viewedBy: text("viewed_by", { mode: "json" })
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  viewed: integer("viewed", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const taskResponses = sqliteTable("task_responses", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  author: text("author").notNull(),
  text: text("text").notNull(),
  attachments: text("attachments", { mode: "json" }).$type<unknown[]>().notNull().default([]),
  timestamp: text("timestamp").notNull(),
});

export const taskComments = sqliteTable("task_comments", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  author: text("author").notNull(),
  text: text("text").notNull(),
  timestamp: text("timestamp").notNull(),
});

export const taskTimeline = sqliteTable("task_timeline", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  timestamp: text("timestamp").notNull(),
  action: text("action").notNull(),
  actor: text("actor").notNull(),
  status: text("status"),
});

export const inventoryItems = sqliteTable("inventory_items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sku: text("sku").notNull().unique(),
  quantity: integer("quantity").notNull().default(0),
  minQuantity: integer("min_quantity").notNull().default(0),
  unit: text("unit").notNull(),
  category: text("category").notNull(),
  location: text("location").notNull().default(""),
  unitCost: real("unit_cost").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const inventoryMovements = sqliteTable("inventory_movements", {
  id: text("id").primaryKey(),
  itemId: text("item_id")
    .notNull()
    .references(() => inventoryItems.id, { onDelete: "cascade" }),
  itemName: text("item_name").notNull(),
  type: text("type").notNull(),
  quantity: integer("quantity").notNull(),
  cost: real("cost").notNull().default(0),
  author: text("author").notNull(),
  reason: text("reason").notNull().default(""),
  timestamp: text("timestamp").notNull(),
});

export const maintenanceRecords = sqliteTable("maintenance_records", {
  id: text("id").primaryKey(),
  equipment: text("equipment").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull(),
  item: text("item").notNull().default(""),
  serviceDescription: text("service_description").notNull().default(""),
  submittedBy: text("submitted_by").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const maintenanceSteps = sqliteTable("maintenance_steps", {
  id: text("id").primaryKey(),
  recordId: text("record_id")
    .notNull()
    .references(() => maintenanceRecords.id, { onDelete: "cascade" }),
  stepIndex: integer("step_index").notNull(),
  label: text("label").notNull(),
  status: text("status").notNull(),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  durationMinutes: integer("duration_minutes").notNull().default(0),
  completedBy: text("completed_by").default(""),
  observation: text("observation").notNull().default(""),
});

export const maintenanceTimeline = sqliteTable("maintenance_timeline", {
  id: text("id").primaryKey(),
  recordId: text("record_id")
    .notNull()
    .references(() => maintenanceRecords.id, { onDelete: "cascade" }),
  timestamp: text("timestamp").notNull(),
  action: text("action").notNull(),
  actor: text("actor").notNull(),
  observation: text("observation").notNull().default(""),
});

export const storeDocuments = sqliteTable(
  "store_documents",
  {
    module: text("module").notNull(),
    id: text("id").notNull(),
    payload: text("payload").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.module, table.id] }),
  }),
);

export type DbEquipment = typeof equipment.$inferSelect;
export type DbEquipmentInsert = typeof equipment.$inferInsert;
