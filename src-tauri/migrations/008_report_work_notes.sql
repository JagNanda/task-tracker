ALTER TABLE tasks ADD COLUMN ticket_number TEXT;
ALTER TABLE task_notes ADD COLUMN report_date TEXT
    CHECK (report_date IS NULL OR date(report_date, '+0 days') IS report_date);

INSERT INTO app_settings (key, value_json, updated_at)
VALUES ('reports.dailyReminder', 'true', 0) ON CONFLICT(key) DO NOTHING;
