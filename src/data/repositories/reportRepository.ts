import { createId, execute, nowUtcMs, select } from "../database";

type ReportScope =
  | { period_type: "day" | "week" | "month"; period_start: number; period_end: number; ticket_number: null }
  | { period_type: "ticket"; period_start: null; period_end: null; ticket_number: string };

export type SavedReportRecord = ReportScope & {
  id: string;
  options_json: string;
  content: string;
  created_at: number;
  updated_at: number;
};

export type TicketReportRow = {
  task_id: string;
  task_title: string;
  ticket_number: string;
  focus_ms: number;
  body: string | null;
  recorded_at: number | null;
  report_date: string | null;
};

export const reportRepository = {
  async claimDailyReminder(date: string) {
    const result = await execute(
      `INSERT INTO app_settings (key, value_json, updated_at) VALUES ('reports.lastReminderDate', ?1, ?2)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
       WHERE app_settings.value_json < excluded.value_json`,
      [JSON.stringify(date), nowUtcMs()],
    );
    return result.rowsAffected > 0;
  },
  ticketActivity(taskIds: string[]) {
    return select<TicketReportRow>(
      `SELECT * FROM (WITH ticket_tasks AS (
         SELECT id, title, ticket_number FROM tasks
          WHERE ticket_number IS NOT NULL AND id IN (SELECT value FROM json_each(?1))
       ), focus_totals AS (
         SELECT ws.task_id, SUM(MAX(0, COALESCE(ws.ended_at, ?2) - ws.started_at)) AS focus_ms
           FROM work_segments ws JOIN ticket_tasks t ON t.id = ws.task_id
           WHERE ws.is_cancelled = 0 GROUP BY ws.task_id
       ), comments AS (
         SELECT n.task_id, n.body, n.created_at AS recorded_at, n.report_date
           FROM task_notes n JOIN ticket_tasks t ON t.id = n.task_id
         UNION ALL
         SELECT n.task_id, n.body, n.created_at, NULL
           FROM focus_session_notes n JOIN ticket_tasks t ON t.id = n.task_id
         UNION ALL
         SELECT ws.task_id, ws.note, ws.started_at, NULL
           FROM work_segments ws JOIN ticket_tasks t ON t.id = ws.task_id
           WHERE length(trim(ws.note)) > 0
       )
       SELECT t.id AS task_id, t.title AS task_title, t.ticket_number,
              COALESCE(f.focus_ms, 0) AS focus_ms, c.body, c.recorded_at, c.report_date
         FROM ticket_tasks t LEFT JOIN focus_totals f ON f.task_id = t.id
         LEFT JOIN comments c ON c.task_id = t.id
       ) ORDER BY recorded_at DESC, task_title, task_id`,
      [JSON.stringify(taskIds), nowUtcMs()],
    );
  },
  list: () => select<SavedReportRecord>("SELECT * FROM saved_reports ORDER BY created_at DESC"),
  async save(input: { id?: string; scope: ReportScope; options: Record<string, boolean>; content: string }) {
    const id = input.id ?? createId("report");
    const now = nowUtcMs();
    const { period_type, period_start, period_end, ticket_number } = input.scope;
    await execute(
      `INSERT INTO saved_reports (id, period_type, period_start, period_end, ticket_number, options_json, content, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
       ON CONFLICT(id) DO UPDATE SET options_json = excluded.options_json, content = excluded.content, updated_at = excluded.updated_at`,
      [id, period_type, period_start, period_end, ticket_number, JSON.stringify(input.options), input.content, now],
    );
    return id;
  },
  delete: (id: string) => execute("DELETE FROM saved_reports WHERE id = ?1", [id]),
};
