import { primaryKey, sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  role: text("role", { enum: ["admin", "operacional", "manutencao", "estoque"] }).notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: text("created_at").notNull(),
});

export const equipment = sqliteTable("equipment", {
  id: text("id").primaryKey(), // ex: "FR-001"
  model: text("model").notNull(),
  icon: text("icon").notNull(),
  hours: integer("hours").notNull().default(0),
  status: text("status", { enum: ["Operação", "Manutenção", "Parado"] }).notNull(),
  tone: text("tone", { enum: ["success", "warning", "error"] }).notNull(),
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
  kind: text("kind", { enum: ["task", "request"] })
    .notNull()
    .default("task"),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  equipment: text("equipment").notNull().default(""),
  assignedTo: text("assigned_to", { mode: "json" }).$type<string[]>().notNull(),
  responsibleIds: text("responsible_ids", { mode: "json" }).$type<string[]>().notNull().default([]),
  sector: text("sector").notNull(),
  priority: text("priority", { enum: ["Baixa", "Média", "Alta", "Urgente"] }).notNull(),
  deadline: text("deadline"),
  status: text("status", {
    enum: [
      "Não visualizado",
      "Visualizado",
      "Em andamento",
      "Aguardando peças",
      "Aguardando aprovação",
      "Concluído",
      "Atrasado",
    ],
  }).notNull(),
  createdBy: text("created_by").notNull().default(""),
  createdByUserId: text("created_by_user_id").notNull().default(""),
  attachments: text("attachments", { mode: "json" }).$type<unknown[]>().notNull().default([]),
  viewedBy: text("viewed_by", { mode: "json" })
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  viewed: integer("viewed", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  completedAt: text("completed_at").notNull().default(""),
  completedBy: text("completed_by").notNull().default(""),
});

export const taskRecipients = sqliteTable(
  "task_recipients",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    userName: text("user_name").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.taskId, table.userId] }),
    userIdx: index("idx_task_recipients_user_id").on(table.userId),
  }),
);

export const taskViews = sqliteTable(
  "task_views",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    userName: text("user_name").notNull(),
    viewedAt: text("viewed_at").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.taskId, table.userId] }),
    userIdx: index("idx_task_views_user_id").on(table.userId),
  }),
);

export const taskNotificationReads = sqliteTable(
  "task_notification_reads",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    userName: text("user_name").notNull(),
    readAt: text("read_at").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.taskId, table.userId] }),
    userIdx: index("idx_task_notification_reads_user_id").on(table.userId),
  }),
);

export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    expirationTime: integer("expiration_time"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    userIdx: index("idx_push_subscriptions_user_id").on(table.userId),
  }),
);

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
  type: text("type", {
    enum: ["Preventiva", "Corretiva", "Inspeção", "Troca de óleo", "Hidráulica", "Mecânica"],
  }).notNull(),
  status: text("status", {
    enum: ["Aberta", "Em andamento", "Concluída", "Atrasada"],
  }).notNull(),
  item: text("item").notNull().default(""),
  serviceDescription: text("service_description").notNull().default(""),
  submittedBy: text("submitted_by").notNull().default(""),
  notes: text("notes").notNull().default(""),
  supplierName: text("supplier_name").notNull().default(""),
  materialDescription: text("material_description").notNull().default(""),
  cost: real("cost").notNull().default(0),
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
  status: text("status", {
    enum: ["pendente", "em_andamento", "concluida"],
  }).notNull(),
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

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export const productionAnalyses = sqliteTable("production_analyses", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  obra: text("obra").notNull().default(""),
  material: text("material").notNull().default(""),
  tipoAnalise: text("tipo_analise").notNull().default("operacional"),
  dateStart: text("date_start").notNull(),
  dateEnd: text("date_end").notNull(),
  swellFactor: real("swell_factor").notNull().default(0.3),
  metrics: text("metrics", { mode: "json" }).$type<JsonObject>().notNull().default({}),
  aggregateMetrics: text("aggregate_metrics", { mode: "json" })
    .$type<JsonObject[]>()
    .notNull()
    .default([]),
  machineMetrics: text("machine_metrics", { mode: "json" })
    .$type<JsonObject[]>()
    .notNull()
    .default([]),
  charts: text("charts", { mode: "json" }).$type<JsonObject>().notNull().default({}),
  audit: text("audit", { mode: "json" }).$type<JsonObject[]>().notNull().default([]),
  context: text("context", { mode: "json" }).$type<JsonObject>().notNull().default({}),
  createdAt: text("created_at").notNull(),
  createdBy: text("created_by").notNull().default(""),
});

export const trips = sqliteTable(
  "trips",
  {
    id: text("id").primaryKey(),
    analysisId: text("analysis_id").notNull().default("legacy"),
    datetime: text("datetime").notNull(),
    operator: text("operator").notNull().default(""),
    operation: text("operation").notNull(),
    owner: text("owner").notNull().default(""),
    plate: text("plate").notNull().default(""),
    vehicleId: text("vehicle_id").notNull().default(""),
    prefix: text("prefix").notNull().default(""),
    driver: text("driver").notNull().default(""),
    obra: text("obra").notNull().default(""),
    origin: text("origin").notNull().default(""),
    destination: text("destination").notNull().default(""),
    km: real("km").notNull().default(0),
    material: text("material").notNull().default(""),
    weight: real("weight").notNull().default(0),
    cubicMLoose: real("cubic_m_loose").notNull().default(0),
    swellFactorApplied: real("swell_factor_applied").notNull().default(0.3),
    cubicMCompacted: real("cubic_m_compacted").notNull().default(0),
    unitPrice: real("unit_price").notNull().default(0),
    total: real("total").notNull().default(0),
    status: text("status"),
    importBatchId: text("import_batch_id").notNull(),
    importedAt: text("imported_at").notNull(),
  },
  (table) => ({
    idxTripsAnalysisDate: index("idx_trips_analysis_date").on(
      table.analysisId,
      table.datetime,
    ),
  }),
);

export const fueling = sqliteTable(
  "fueling",
  {
    id: text("id").primaryKey(),
    analysisId: text("analysis_id").notNull().default("legacy"),
    datetime: text("datetime").notNull(),
    owner: text("owner").notNull().default(""),
    plate: text("plate").notNull().default(""),
    vehicleId: text("vehicle_id").notNull().default(""),
    prefix: text("prefix").notNull().default(""),
    vehicleType: text("vehicle_type").notNull().default(""),
    kmPrevious: real("km_previous").notNull().default(0),
    kmCurrent: real("km_current").notNull().default(0),
    liters: real("liters").notNull().default(0),
    unitPrice: real("unit_price").notNull().default(0),
    total: real("total").notNull().default(0),
    consumption: real("consumption").notNull().default(0),
    standardConsumption: real("standard_consumption").notNull().default(0),
    operator: text("operator").notNull().default(""),
    obra: text("obra").notNull().default(""),
    status: text("status"),
    importBatchId: text("import_batch_id").notNull(),
    importedAt: text("imported_at").notNull(),
  },
  (table) => ({
    idxFuelingAnalysisDate: index("idx_fueling_analysis_date").on(
      table.analysisId,
      table.datetime,
    ),
  }),
);

export const equipmentDailyParts = sqliteTable(
  "equipment_daily_parts",
  {
    id: text("id").primaryKey(),
    analysisId: text("analysis_id").notNull().default("legacy"),
    fleet: text("fleet").notNull().default(""),
    fleetLabel: text("fleet_label").notNull().default(""),
    date: text("date").notNull(),
    obra: text("obra").notNull().default(""),
    hours: real("hours").notNull().default(0),
    sourceSheet: text("source_sheet").notNull().default(""),
    status: text("status").notNull().default("OK"),
    usedInAnalysis: integer("used_in_analysis", { mode: "boolean" }).notNull().default(true),
    importedAt: text("imported_at").notNull(),
  },
  (table) => ({
    idxEquipmentDailyPartsAnalysisDate: index("idx_equipment_daily_parts_analysis_date").on(
      table.analysisId,
      table.date,
    ),
    idxEquipmentDailyPartsFleetAnalysisDate: index(
      "idx_equipment_daily_parts_fleet_analysis_date",
    ).on(table.fleet, table.analysisId, table.date),
  }),
);

export const swellFactors = sqliteTable(
  "swell_factors",
  {
    obra: text("obra").notNull(),
    material: text("material").notNull(),
    factor: real("factor").notNull().default(0.3),
    updatedAt: text("updated_at").notNull(),
    updatedBy: text("updated_by").notNull().default(""),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.obra, table.material] }),
  }),
);

export type DbTrip = typeof trips.$inferSelect;
export type DbFueling = typeof fueling.$inferSelect;
export type DbEquipmentDailyPart = typeof equipmentDailyParts.$inferSelect;
export type DbSwellFactor = typeof swellFactors.$inferSelect;
export type DbProductionAnalysis = typeof productionAnalyses.$inferSelect;

export const reminders = sqliteTable("reminders", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  kind: text("kind", { enum: ["reminder", "event"] })
    .notNull()
    .default("reminder"),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  date: text("date").notNull(),
  time: text("time"),
  endTime: text("end_time"),
  location: text("location").notNull().default(""),
  color: text("color", { enum: ["blue", "purple", "green"] })
    .notNull()
    .default("blue"),
  priority: text("priority", { enum: ["baixa", "média", "alta", "urgente"] })
    .notNull()
    .default("média"),
  status: text("status", { enum: ["pendente", "agendado", "em andamento", "concluído"] })
    .notNull()
    .default("pendente"),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export type DbReminder = typeof reminders.$inferSelect;
export type DbReminderInsert = typeof reminders.$inferInsert;

export const fuelAttribution = sqliteTable(
  "fuel_attribution",
  {
    id: text("id").primaryKey(),
    fleet: text("fleet").notNull(),
    fleetLabel: text("fleet_label").notNull().default(""),
    date: text("date").notNull(),
    obra: text("obra").notNull().default(""),
    hoursWorked: real("hours_worked").notNull(),
    litersAttributed: real("liters_attributed").notNull(),
    costAttributed: real("cost_attributed").notNull(),
    sourceFuelingId: text("source_fueling_id"),
    calculatedAt: text("calculated_at").notNull(),
  },
  (table) => ({
    idxFleetDate: index("idx_fuelattr_fleet_date").on(table.fleet, table.date),
    idxDate: index("idx_fuelattr_date").on(table.date),
    idxObra: index("idx_fuelattr_obra").on(table.obra),
    idxSourceFueling: index("idx_fuelattr_source_fueling").on(table.sourceFuelingId),
  }),
);

export type DbFuelAttribution = typeof fuelAttribution.$inferSelect;
export type DbFuelAttributionInsert = typeof fuelAttribution.$inferInsert;
