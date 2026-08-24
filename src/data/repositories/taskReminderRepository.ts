import { createId, execute, nowUtcMs, select } from "../database";

export type TaskReminderRecord = {
  id: string;
  task_id: string;
  scheduled_for: number;
  original_scheduled_for: number;
  status: "active" | "dismissed" | "cancelled";
  message: string | null;
  last_fired_at: number | null;
  created_at: number;
  updated_at: number;
};

export const taskReminderRepository = {
  listForTask(taskId: string) {
    return select<TaskReminderRecord>("SELECT * FROM task_reminders WHERE task_id = ?1 ORDER BY scheduled_for", [taskId]);
  },

  async create(taskId: string, scheduledFor: number, message?: string) {
    const id = createId("reminder");
    const now = nowUtcMs();
    await execute(
      `INSERT INTO task_reminders
       (id, task_id, scheduled_for, original_scheduled_for, status, message, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?3, 'active', ?4, ?5, ?5)`,
      [id, taskId, scheduledFor, message?.trim() || null, now],
    );
    return id;
  },

  snooze(id: string, scheduledFor: number) {
    return execute(
      "UPDATE task_reminders SET scheduled_for = ?2, status = 'active', updated_at = ?3 WHERE id = ?1",
      [id, scheduledFor, nowUtcMs()],
    );
  },

  setStatus(id: string, status: TaskReminderRecord["status"]) {
    return execute("UPDATE task_reminders SET status = ?2, updated_at = ?3 WHERE id = ?1", [id, status, nowUtcMs()]);
  },
};
