import { createId, execute, nowUtcMs, select } from "../database";

export type SavedReportRecord = {
  id: string;
  period_type: "day" | "week" | "month";
  period_start: number;
  period_end: number;
  options_json: string;
  content: string;
  created_at: number;
  updated_at: number;
};

export const reportRepository = {
  list: () => select<SavedReportRecord>("SELECT * FROM saved_reports ORDER BY created_at DESC"),
  async save(input: { id?: string; periodType: SavedReportRecord["period_type"]; periodStart: number; periodEnd: number; options: Record<string, boolean>; content: string }) {
    const id = input.id ?? createId("report");
    const now = nowUtcMs();
    await execute(
      `INSERT INTO saved_reports (id, period_type, period_start, period_end, options_json, content, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
       ON CONFLICT(id) DO UPDATE SET options_json = excluded.options_json, content = excluded.content, updated_at = excluded.updated_at`,
      [id, input.periodType, input.periodStart, input.periodEnd, JSON.stringify(input.options), input.content, now],
    );
    return id;
  },
  delete: (id: string) => execute("DELETE FROM saved_reports WHERE id = ?1", [id]),
};
