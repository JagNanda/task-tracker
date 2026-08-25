ALTER TABLE work_segments ADD COLUMN note TEXT;
ALTER TABLE work_segments ADD COLUMN is_cancelled INTEGER NOT NULL DEFAULT 0 CHECK (is_cancelled IN (0, 1));

ALTER TABLE interruptions ADD COLUMN is_cancelled INTEGER NOT NULL DEFAULT 0 CHECK (is_cancelled IN (0, 1));
ALTER TABLE breaks ADD COLUMN is_cancelled INTEGER NOT NULL DEFAULT 0 CHECK (is_cancelled IN (0, 1));

CREATE INDEX idx_work_segments_cancelled ON work_segments(is_cancelled);
CREATE INDEX idx_interruptions_cancelled ON interruptions(is_cancelled);
CREATE INDEX idx_breaks_cancelled ON breaks(is_cancelled);
