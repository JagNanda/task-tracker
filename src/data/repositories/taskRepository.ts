import { invoke } from "@tauri-apps/api/core";
import { createId, execute, nowUtcMs, select } from "../database";

export type TaskStatus = "todo" | "in_progress" | "blocked" | "completed" | "cancelled" | "archived";

export type TaskRecord = {
  id: string;
  title: string;
  description: string | null;
  context: string | null;
  status: TaskStatus;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
  cancelled_at: number | null;
  archived_at: number | null;
  total_minutes: number;
  today_minutes: number;
  last_worked_at: number | null;
  note_count: number;
  reminder_count: number;
  next_reminder_at: number | null;
  next_reminder_message: string | null;
};

export type SaveTaskInput = {
  id?: string;
  title: string;
  description?: string;
  context?: string;
  status?: TaskStatus;
};

function startOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export const taskRepository = {
  async list(): Promise<TaskRecord[]> {
    const now = nowUtcMs();
    const dayStart = startOfLocalDay();
    const dayEnd = new Date(new Date(dayStart).setDate(new Date(dayStart).getDate() + 1)).getTime();
    return select<TaskRecord>(
      `SELECT t.*,
        CAST(COALESCE((SELECT SUM(MAX(0, COALESCE(ws.ended_at, ?1) - ws.started_at)) FROM work_segments ws WHERE ws.task_id = t.id), 0) / 60000 AS INTEGER) AS total_minutes,
        CAST(COALESCE((SELECT SUM(MAX(0, MIN(COALESCE(ws.ended_at, ?1), ?3) - MAX(ws.started_at, ?2))) FROM work_segments ws WHERE ws.task_id = t.id AND ws.started_at < ?3 AND COALESCE(ws.ended_at, ?1) > ?2), 0) / 60000 AS INTEGER) AS today_minutes,
        (SELECT MAX(ws.started_at) FROM work_segments ws WHERE ws.task_id = t.id) AS last_worked_at,
        (SELECT COUNT(*) FROM task_notes n WHERE n.task_id = t.id) AS note_count,
        (SELECT COUNT(*) FROM task_reminders r WHERE r.task_id = t.id) AS reminder_count,
        (SELECT r.scheduled_for FROM task_reminders r WHERE r.task_id = t.id AND r.status = 'active' ORDER BY r.scheduled_for LIMIT 1) AS next_reminder_at,
        (SELECT r.message FROM task_reminders r WHERE r.task_id = t.id AND r.status = 'active' ORDER BY r.scheduled_for LIMIT 1) AS next_reminder_message
       FROM tasks t ORDER BY COALESCE(last_worked_at, t.updated_at) DESC`,
      [now, dayStart, dayEnd],
    );
  },

  async create(input: SaveTaskInput) {
    const now = nowUtcMs();
    const id = input.id ?? createId("task");
    await execute(
      `INSERT INTO tasks (id, title, description, context, status, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)`,
      [id, input.title.trim(), input.description?.trim() || null, input.context?.trim() || null, input.status ?? "todo", now],
    );
    return id;
  },

  async update(id: string, input: SaveTaskInput) {
    await execute(
      `UPDATE tasks SET title = ?2, description = ?3, context = ?4, status = ?5,
         completed_at = CASE WHEN ?5 = 'completed' THEN COALESCE(completed_at, ?6) ELSE NULL END,
         cancelled_at = CASE WHEN ?5 = 'cancelled' THEN COALESCE(cancelled_at, ?6) ELSE NULL END,
         archived_at = CASE WHEN ?5 = 'archived' THEN COALESCE(archived_at, ?6) ELSE NULL END,
         updated_at = ?6 WHERE id = ?1`,
      [id, input.title.trim(), input.description?.trim() || null, input.context?.trim() || null, input.status ?? "todo", nowUtcMs()],
    );
  },

  async setStatus(id: string, status: TaskStatus) {
    const now = nowUtcMs();
    await execute(
      `UPDATE tasks SET status = ?2,
         completed_at = CASE WHEN ?2 = 'completed' THEN ?3 ELSE NULL END,
         cancelled_at = CASE WHEN ?2 = 'cancelled' THEN ?3 ELSE NULL END,
         archived_at = CASE WHEN ?2 = 'archived' THEN ?3 ELSE NULL END,
         updated_at = ?3 WHERE id = ?1`,
      [id, status, now],
    );
  },

  async deletePermanently(id: string) {
    await invoke("database_delete_task", { taskId: id });
  },
};
