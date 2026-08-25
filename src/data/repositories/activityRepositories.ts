import { createId, execute, nowUtcMs, select } from "../database";

export const workSegmentRepository = {
  createManual(input: { id?: string; taskId?: string; startedAt: number; endedAt: number; note?: string; cancelled?: boolean }) {
    const id = input.id ?? createId("segment");
    return execute(
      "INSERT INTO work_segments (id, task_id, started_at, ended_at, note, is_cancelled, source, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'manual', ?7)",
      [id, input.taskId ?? null, input.startedAt, input.endedAt, input.note?.trim() || null, input.cancelled ? 1 : 0, nowUtcMs()],
    ).then(() => id);
  },
  update(id: string, input: { taskId?: string; startedAt: number; endedAt: number; note?: string; cancelled?: boolean }) {
    return execute(
      "UPDATE work_segments SET task_id = ?2, started_at = ?3, ended_at = ?4, note = ?5, is_cancelled = ?6 WHERE id = ?1",
      [id, input.taskId ?? null, input.startedAt, input.endedAt, input.note?.trim() || null, input.cancelled ? 1 : 0],
    );
  },
  delete(id: string) {
    return execute("DELETE FROM work_segments WHERE id = ?1", [id]);
  },
};

export const interruptionRepository = {
  createManual(input: { id?: string; presetId?: string; startedAt: number; endedAt: number; note?: string; cancelled?: boolean }) {
    const id = input.id ?? createId("interruption");
    return execute(
      "INSERT INTO interruptions (id, preset_id, started_at, ended_at, note, is_cancelled, source, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'manual', ?7)",
      [id, input.presetId ?? null, input.startedAt, input.endedAt, input.note?.trim() || null, input.cancelled ? 1 : 0, nowUtcMs()],
    ).then(() => id);
  },
  update(id: string, input: { presetId?: string; startedAt: number; endedAt: number; note?: string; cancelled?: boolean }) {
    return execute(
      "UPDATE interruptions SET preset_id = ?2, started_at = ?3, ended_at = ?4, note = ?5, is_cancelled = ?6 WHERE id = ?1",
      [id, input.presetId ?? null, input.startedAt, input.endedAt, input.note?.trim() || null, input.cancelled ? 1 : 0],
    );
  },
  delete(id: string) {
    return execute("DELETE FROM interruptions WHERE id = ?1", [id]);
  },
};

export const breakRepository = {
  createManual(input: { id?: string; startedAt: number; endedAt: number; note?: string; cancelled?: boolean }) {
    const id = input.id ?? createId("break");
    return execute(
      "INSERT INTO breaks (id, started_at, ended_at, note, is_cancelled, source, created_at) VALUES (?1, ?2, ?3, ?4, ?5, 'manual', ?6)",
      [id, input.startedAt, input.endedAt, input.note?.trim() || null, input.cancelled ? 1 : 0, nowUtcMs()],
    ).then(() => id);
  },
  update(id: string, input: { startedAt: number; endedAt: number; note?: string; cancelled?: boolean }) {
    return execute(
      "UPDATE breaks SET started_at = ?2, ended_at = ?3, note = ?4, is_cancelled = ?5 WHERE id = ?1",
      [id, input.startedAt, input.endedAt, input.note?.trim() || null, input.cancelled ? 1 : 0],
    );
  },
  delete(id: string) {
    return execute("DELETE FROM breaks WHERE id = ?1", [id]);
  },
};

export type TimedBreakRecord = {
  id: string;
  focus_session_id: string;
  started_at: number;
  ended_at: number | null;
  target_duration_seconds: number;
};

export const timedBreakRepository = {
  async getActive() {
    const [active] = await select<TimedBreakRecord>(
      `SELECT id, focus_session_id, started_at, ended_at, target_duration_seconds
       FROM breaks
       WHERE ended_at IS NULL AND target_duration_seconds IS NOT NULL
       ORDER BY started_at DESC
       LIMIT 1`,
    );
    return active ?? null;
  },

  async start(focusSessionId: string, targetDurationSeconds: number) {
    const id = createId("break");
    const startedAt = nowUtcMs();
    await execute(
      `INSERT INTO breaks
       (id, focus_session_id, started_at, note, source, created_at, target_duration_seconds)
       VALUES (?1, ?2, ?3, 'Automatic recovery break', 'timer', ?3, ?4)`,
      [id, focusSessionId, startedAt, targetDurationSeconds],
    );
    return { id, focus_session_id: focusSessionId, started_at: startedAt, ended_at: null, target_duration_seconds: targetDurationSeconds } satisfies TimedBreakRecord;
  },

  finish(id: string, endedAt = nowUtcMs()) {
    return execute(
      "UPDATE breaks SET ended_at = MAX(started_at + 1, ?2) WHERE id = ?1 AND ended_at IS NULL",
      [id, endedAt],
    );
  },
};
