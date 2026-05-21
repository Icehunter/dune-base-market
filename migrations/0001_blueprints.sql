CREATE TABLE IF NOT EXISTS blueprints (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL,
  username       TEXT NOT NULL,
  title          TEXT NOT NULL,
  is_public      INTEGER NOT NULL DEFAULT 1,
  r2_key         TEXT NOT NULL,
  piece_count    INTEGER,
  file_size      INTEGER,
  tags           TEXT,
  download_count INTEGER NOT NULL DEFAULT 0,
  blueprint_data TEXT,
  created_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_blueprints_user_id   ON blueprints(user_id);
CREATE INDEX IF NOT EXISTS idx_blueprints_is_public  ON blueprints(is_public);
CREATE INDEX IF NOT EXISTS idx_blueprints_created_at ON blueprints(created_at);
CREATE INDEX IF NOT EXISTS idx_blueprints_download_count ON blueprints(download_count);
