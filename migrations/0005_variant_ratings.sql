-- Per-variant ratings. A user can rate the blueprint (variant_id NULL) AND
-- each variant separately. The primary key changes to include variant_id so
-- both ratings coexist without conflict.
ALTER TABLE blueprint_variants ADD COLUMN rating_count INTEGER NOT NULL DEFAULT 0;

-- SQLite can't alter a primary key in place; rebuild the table.
CREATE TABLE ratings_new (
  blueprint_id TEXT NOT NULL,
  variant_id   TEXT,                -- NULL = rating on the blueprint Original
  user_id      TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (blueprint_id, variant_id, user_id)
);
INSERT INTO ratings_new (blueprint_id, variant_id, user_id, created_at)
  SELECT blueprint_id, NULL, user_id, created_at FROM ratings;
DROP TABLE ratings;
ALTER TABLE ratings_new RENAME TO ratings;

CREATE INDEX IF NOT EXISTS idx_ratings_blueprint_id ON ratings(blueprint_id);
CREATE INDEX IF NOT EXISTS idx_ratings_variant_id   ON ratings(variant_id);
