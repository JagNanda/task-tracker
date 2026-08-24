CREATE TABLE tasks (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    description TEXT,
    context TEXT,
    status TEXT NOT NULL DEFAULT 'todo'
        CHECK (status IN ('todo', 'in_progress', 'blocked', 'completed', 'cancelled', 'archived')),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
    completed_at INTEGER,
    cancelled_at INTEGER,
    archived_at INTEGER,
    CHECK (completed_at IS NULL OR completed_at >= created_at),
    CHECK (cancelled_at IS NULL OR cancelled_at >= created_at),
    CHECK (archived_at IS NULL OR archived_at >= created_at)
);

CREATE TABLE task_notes (
    id TEXT PRIMARY KEY NOT NULL,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    body TEXT NOT NULL CHECK (length(trim(body)) > 0),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at)
);

CREATE TABLE note_screenshots (
    id TEXT PRIMARY KEY NOT NULL,
    note_id TEXT NOT NULL REFERENCES task_notes(id) ON DELETE CASCADE,
    relative_path TEXT NOT NULL UNIQUE CHECK (relative_path NOT LIKE 'C:%' AND relative_path NOT LIKE '/%'),
    original_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp')),
    width INTEGER NOT NULL CHECK (width > 0),
    height INTEGER NOT NULL CHECK (height > 0),
    file_size INTEGER NOT NULL CHECK (file_size > 0),
    sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    created_at INTEGER NOT NULL CHECK (created_at >= 0)
);

CREATE TABLE task_reminders (
    id TEXT PRIMARY KEY NOT NULL,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    scheduled_for INTEGER NOT NULL CHECK (scheduled_for >= 0),
    original_scheduled_for INTEGER NOT NULL CHECK (original_scheduled_for >= 0),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'dismissed', 'cancelled')),
    message TEXT,
    last_fired_at INTEGER,
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at)
);

CREATE TABLE focus_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    current_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    target_duration_seconds INTEGER NOT NULL CHECK (target_duration_seconds > 0),
    status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'interrupted', 'completed', 'cancelled')),
    started_at INTEGER NOT NULL CHECK (started_at >= 0),
    ended_at INTEGER,
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
    CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE TABLE work_segments (
    id TEXT PRIMARY KEY NOT NULL,
    focus_session_id TEXT REFERENCES focus_sessions(id) ON DELETE CASCADE,
    task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    started_at INTEGER NOT NULL CHECK (started_at >= 0),
    ended_at INTEGER,
    source TEXT NOT NULL CHECK (source IN ('timer', 'manual')),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    CHECK (ended_at IS NULL OR ended_at > started_at),
    CHECK (source = 'manual' OR focus_session_id IS NOT NULL)
);

CREATE TABLE focus_session_notes (
    id TEXT PRIMARY KEY NOT NULL,
    focus_session_id TEXT NOT NULL REFERENCES focus_sessions(id) ON DELETE CASCADE,
    task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    body TEXT NOT NULL CHECK (length(trim(body)) > 0),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at)
);

CREATE TABLE interruption_presets (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
    is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
    is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at)
);

CREATE TABLE interruptions (
    id TEXT PRIMARY KEY NOT NULL,
    focus_session_id TEXT REFERENCES focus_sessions(id) ON DELETE CASCADE,
    preset_id TEXT REFERENCES interruption_presets(id) ON DELETE SET NULL,
    started_at INTEGER NOT NULL CHECK (started_at >= 0),
    ended_at INTEGER,
    note TEXT,
    source TEXT NOT NULL CHECK (source IN ('timer', 'manual')),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    CHECK (ended_at IS NULL OR ended_at > started_at),
    CHECK (source = 'manual' OR focus_session_id IS NOT NULL)
);

CREATE TABLE breaks (
    id TEXT PRIMARY KEY NOT NULL,
    focus_session_id TEXT REFERENCES focus_sessions(id) ON DELETE CASCADE,
    started_at INTEGER NOT NULL CHECK (started_at >= 0),
    ended_at INTEGER,
    note TEXT,
    source TEXT NOT NULL CHECK (source IN ('timer', 'manual')),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    CHECK (ended_at IS NULL OR ended_at > started_at),
    CHECK (source = 'manual' OR focus_session_id IS NOT NULL)
);

CREATE TABLE saved_reports (
    id TEXT PRIMARY KEY NOT NULL,
    period_type TEXT NOT NULL CHECK (period_type IN ('day', 'week', 'month')),
    period_start INTEGER NOT NULL CHECK (period_start >= 0),
    period_end INTEGER NOT NULL CHECK (period_end > period_start),
    options_json TEXT NOT NULL CHECK (json_valid(options_json)),
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at)
);

CREATE TABLE app_settings (
    key TEXT PRIMARY KEY NOT NULL CHECK (length(trim(key)) > 0),
    value_json TEXT NOT NULL CHECK (json_valid(value_json)),
    updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
);

CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_updated_at ON tasks(updated_at);
CREATE INDEX idx_task_notes_task_id ON task_notes(task_id);
CREATE INDEX idx_task_notes_created_at ON task_notes(created_at);
CREATE INDEX idx_note_screenshots_note_id ON note_screenshots(note_id);
CREATE INDEX idx_task_reminders_task_id ON task_reminders(task_id);
CREATE INDEX idx_task_reminders_status_scheduled ON task_reminders(status, scheduled_for);
CREATE INDEX idx_focus_sessions_status ON focus_sessions(status);
CREATE INDEX idx_focus_sessions_started_at ON focus_sessions(started_at);
CREATE UNIQUE INDEX idx_one_running_focus_session ON focus_sessions((1))
    WHERE status IN ('active', 'paused', 'interrupted');
CREATE INDEX idx_work_segments_session ON work_segments(focus_session_id);
CREATE INDEX idx_work_segments_task ON work_segments(task_id);
CREATE INDEX idx_work_segments_started_at ON work_segments(started_at);
CREATE UNIQUE INDEX idx_one_open_work_segment ON work_segments(focus_session_id)
    WHERE ended_at IS NULL AND focus_session_id IS NOT NULL;
CREATE INDEX idx_interruptions_session ON interruptions(focus_session_id);
CREATE INDEX idx_interruptions_started_at ON interruptions(started_at);
CREATE UNIQUE INDEX idx_one_open_interruption ON interruptions(focus_session_id)
    WHERE ended_at IS NULL AND focus_session_id IS NOT NULL;
CREATE INDEX idx_breaks_session ON breaks(focus_session_id);
CREATE INDEX idx_breaks_started_at ON breaks(started_at);
CREATE UNIQUE INDEX idx_one_open_break ON breaks(focus_session_id)
    WHERE ended_at IS NULL AND focus_session_id IS NOT NULL;
CREATE INDEX idx_session_notes_session ON focus_session_notes(focus_session_id);
CREATE INDEX idx_session_notes_task ON focus_session_notes(task_id);
CREATE INDEX idx_saved_reports_period ON saved_reports(period_type, period_start);
CREATE INDEX idx_saved_reports_created_at ON saved_reports(created_at);

CREATE TRIGGER cancel_future_reminders_after_task_terminal
AFTER UPDATE OF status ON tasks
WHEN NEW.status IN ('completed', 'cancelled', 'archived')
BEGIN
    UPDATE task_reminders
       SET status = 'cancelled', updated_at = NEW.updated_at
     WHERE task_id = NEW.id AND status = 'active';
END;

INSERT INTO interruption_presets
    (id, name, sort_order, is_enabled, is_default, created_at, updated_at)
VALUES
    ('preset_meeting', 'Meeting', 0, 1, 1, 0, 0),
    ('preset_coworker', 'Coworker', 1, 1, 1, 0, 0),
    ('preset_production_issue', 'Production Issue', 2, 1, 1, 0, 0),
    ('preset_washroom', 'Washroom', 3, 1, 1, 0, 0),
    ('preset_family_issue', 'Family Issue', 4, 1, 1, 0, 0),
    ('preset_other', 'Other', 5, 1, 1, 0, 0);

INSERT INTO app_settings (key, value_json, updated_at) VALUES
    ('appearance.accent', '"#2388FF"', 0),
    ('appearance.background', '"#050B14"', 0),
    ('focus.defaultDuration', '25', 0),
    ('focus.longDuration', '50', 0),
    ('notifications.focusComplete', 'true', 0),
    ('notifications.reminders', 'true', 0),
    ('reminders.defaultSnooze', '10', 0),
    ('reports.includeTotalFocusTime', 'true', 0),
    ('reports.includeTimePerTask', 'true', 0),
    ('reports.includeInterruptions', 'false', 0),
    ('reports.includeBreaks', 'false', 0);
