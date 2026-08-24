import { createId, execute, nowUtcMs } from "../database";

export const workSegmentRepository = {
  createManual(input: { id?: string; taskId?: string; startedAt: number; endedAt: number }) {
    const id = input.id ?? createId("segment");
    return execute(
      "INSERT INTO work_segments (id, task_id, started_at, ended_at, source, created_at) VALUES (?1, ?2, ?3, ?4, 'manual', ?5)",
      [id, input.taskId ?? null, input.startedAt, input.endedAt, nowUtcMs()],
    ).then(() => id);
  },
  update(id: string, input: { taskId?: string; startedAt: number; endedAt: number }) {
    return execute("UPDATE work_segments SET task_id = ?2, started_at = ?3, ended_at = ?4 WHERE id = ?1", [id, input.taskId ?? null, input.startedAt, input.endedAt]);
  },
  delete(id: string) {
    return execute("DELETE FROM work_segments WHERE id = ?1", [id]);
  },
};

export const interruptionRepository = {
  createManual(input: { id?: string; presetId?: string; startedAt: number; endedAt: number; note?: string }) {
    const id = input.id ?? createId("interruption");
    return execute(
      "INSERT INTO interruptions (id, preset_id, started_at, ended_at, note, source, created_at) VALUES (?1, ?2, ?3, ?4, ?5, 'manual', ?6)",
      [id, input.presetId ?? null, input.startedAt, input.endedAt, input.note?.trim() || null, nowUtcMs()],
    ).then(() => id);
  },
  update(id: string, input: { presetId?: string; startedAt: number; endedAt: number; note?: string }) {
    return execute("UPDATE interruptions SET preset_id = ?2, started_at = ?3, ended_at = ?4, note = ?5 WHERE id = ?1", [id, input.presetId ?? null, input.startedAt, input.endedAt, input.note?.trim() || null]);
  },
  delete(id: string) {
    return execute("DELETE FROM interruptions WHERE id = ?1", [id]);
  },
};

export const breakRepository = {
  createManual(input: { id?: string; startedAt: number; endedAt: number; note?: string }) {
    const id = input.id ?? createId("break");
    return execute(
      "INSERT INTO breaks (id, started_at, ended_at, note, source, created_at) VALUES (?1, ?2, ?3, ?4, 'manual', ?5)",
      [id, input.startedAt, input.endedAt, input.note?.trim() || null, nowUtcMs()],
    ).then(() => id);
  },
  update(id: string, input: { startedAt: number; endedAt: number; note?: string }) {
    return execute("UPDATE breaks SET started_at = ?2, ended_at = ?3, note = ?4 WHERE id = ?1", [id, input.startedAt, input.endedAt, input.note?.trim() || null]);
  },
  delete(id: string) {
    return execute("DELETE FROM breaks WHERE id = ?1", [id]);
  },
};
