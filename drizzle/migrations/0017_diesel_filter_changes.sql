CREATE TABLE IF NOT EXISTS diesel_filter_changes (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  primary_filter TEXT,
  secondary_filter TEXT,
  racor TEXT,
  brand TEXT,
  fleet TEXT NOT NULL,
  hourmeter REAL NOT NULL,
  obra TEXT,
  responsible TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_diesel_filter_changes_fleet_date
  ON diesel_filter_changes (fleet, date);

CREATE INDEX IF NOT EXISTS idx_diesel_filter_changes_date
  ON diesel_filter_changes (date);

CREATE INDEX IF NOT EXISTS idx_diesel_filter_changes_obra
  ON diesel_filter_changes (obra);

CREATE INDEX IF NOT EXISTS idx_diesel_filter_changes_responsible
  ON diesel_filter_changes (responsible);
