CREATE TABLE saved_reports_new (
    id TEXT PRIMARY KEY NOT NULL,
    period_type TEXT NOT NULL CHECK (period_type IN ('day', 'week', 'month', 'ticket')),
    period_start INTEGER CHECK (period_start >= 0),
    period_end INTEGER CHECK (period_end > period_start),
    ticket_number TEXT,
    options_json TEXT NOT NULL CHECK (json_valid(options_json)),
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
    CHECK (
        (period_type = 'ticket' AND ticket_number IS NOT NULL AND length(trim(ticket_number)) > 0
            AND period_start IS NULL AND period_end IS NULL)
        OR (period_type <> 'ticket' AND ticket_number IS NULL
            AND period_start IS NOT NULL AND period_end IS NOT NULL)
    )
);

INSERT INTO saved_reports_new (id, period_type, period_start, period_end, options_json, content, created_at, updated_at)
SELECT id, period_type, period_start, period_end, options_json, content, created_at, updated_at FROM saved_reports;

DROP TABLE saved_reports;
ALTER TABLE saved_reports_new RENAME TO saved_reports;

CREATE INDEX idx_saved_reports_period ON saved_reports(period_type, period_start);
CREATE INDEX idx_saved_reports_created_at ON saved_reports(created_at);
