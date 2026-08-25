ALTER TABLE breaks ADD COLUMN target_duration_seconds INTEGER
    CHECK (target_duration_seconds IS NULL OR target_duration_seconds > 0);

CREATE UNIQUE INDEX idx_one_running_automatic_break ON breaks((1))
    WHERE ended_at IS NULL AND target_duration_seconds IS NOT NULL;

INSERT INTO app_settings (key, value_json, updated_at)
VALUES ('focus.breakDuration', '5', 0)
ON CONFLICT(key) DO NOTHING;
