import { createId, execute, nowUtcMs, select } from "../database";

export type SessionNoteRecord = {
  id: string;
  focus_session_id: string;
  task_id: string | null;
  body: string;
  created_at: number;
  updated_at: number;
};

export const sessionNoteRepository = {
  listForSession(sessionId: string) {
    return select<SessionNoteRecord>(
      "SELECT * FROM focus_session_notes WHERE focus_session_id = ?1 ORDER BY created_at",
      [sessionId],
    );
  },
  async listRecentForTask(taskId: string, limit = 3) {
    return select<Pick<SessionNoteRecord, "body" | "updated_at">>(
      `SELECT body, MAX(updated_at) AS updated_at
       FROM focus_session_notes
       WHERE task_id = ?1
       GROUP BY body
       ORDER BY updated_at DESC
       LIMIT ?2`,
      [taskId, limit],
    );
  },
  async create(sessionId: string, taskId: string | null, body: string) {
    const id = createId("session_note");
    const now = nowUtcMs();
    await execute(
      "INSERT INTO focus_session_notes (id, focus_session_id, task_id, body, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
      [id, sessionId, taskId, body.trim(), now],
    );
    return id;
  },
};
