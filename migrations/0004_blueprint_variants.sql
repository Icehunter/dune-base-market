-- Per-blueprint named variants. Each variant captures a piece-override set
-- (and optionally a different cover snapshot) for the same underlying geometry.
-- The blueprint row itself remains the canonical "Original" view; entries here
-- are extras. Switching, renaming, and downloading variants is owner-managed.
-- Forking copies a variant into a fresh blueprint owned by another user.
CREATE TABLE blueprint_variants (
  id              TEXT PRIMARY KEY,
  blueprint_id    TEXT NOT NULL,
  name            TEXT NOT NULL,
  piece_overrides TEXT,
  snapshot_url    TEXT,
  download_count  INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY (blueprint_id) REFERENCES blueprints(id) ON DELETE CASCADE
);

CREATE INDEX idx_blueprint_variants_blueprint ON blueprint_variants(blueprint_id);
