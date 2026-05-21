ALTER TABLE blueprints ADD COLUMN snapshot_url TEXT;
ALTER TABLE blueprints ADD COLUMN rating_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS ratings (
  blueprint_id TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (blueprint_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ratings_blueprint_id ON ratings(blueprint_id);
CREATE INDEX IF NOT EXISTS idx_blueprints_rating_count ON blueprints(rating_count);
