import { select } from "../database";
import { breakRepository, interruptionRepository, workSegmentRepository } from "./activityRepositories";

export type TimelineRecord = {
  type: "focus" | "interruption" | "break";
  id: string;
  focus_session_id: string | null;
  task_id: string | null;
  task_name: string | null;
  context: string | null;
  preset_id: string | null;
  category: string | null;
  started_at: number;
  ended_at: number | null;
  note: string | null;
  is_cancelled: number;
  source: "timer" | "manual";
};

export const timelineRepository = {
  list(startedBefore = Number.MAX_SAFE_INTEGER, endedAfter = 0) {
    return select<TimelineRecord>(
      `SELECT * FROM (
         SELECT 'focus' AS type, ws.id, ws.focus_session_id, ws.task_id, t.title AS task_name,
                t.context, NULL AS preset_id, NULL AS category, ws.started_at, ws.ended_at,
                COALESCE(ws.note, CASE WHEN ws.id = (
                  SELECT latest.id FROM work_segments latest
                  WHERE latest.focus_session_id = ws.focus_session_id
                    AND latest.task_id IS ws.task_id
                  ORDER BY latest.started_at DESC LIMIT 1
                ) THEN (
                  SELECT fsn.body FROM focus_session_notes fsn
                  WHERE fsn.focus_session_id = ws.focus_session_id
                    AND (fsn.task_id = ws.task_id OR fsn.task_id IS NULL)
                  ORDER BY fsn.created_at DESC LIMIT 1
                ) ELSE NULL END) AS note,
                ws.is_cancelled,
                ws.source
           FROM work_segments ws LEFT JOIN tasks t ON t.id = ws.task_id
         UNION ALL
         SELECT 'interruption', i.id, i.focus_session_id, NULL, NULL, NULL, i.preset_id,
                COALESCE(p.name, 'Interruption'), i.started_at, i.ended_at, i.note, i.is_cancelled, i.source
           FROM interruptions i LEFT JOIN interruption_presets p ON p.id = i.preset_id
         UNION ALL
         SELECT 'break', b.id, b.focus_session_id, NULL, NULL, NULL, NULL,
                'Break', b.started_at, b.ended_at, b.note, b.is_cancelled, b.source
           FROM breaks b
       ) activity
       WHERE activity.started_at < ?1 AND COALESCE(activity.ended_at, ?1) > ?2
       ORDER BY activity.started_at`,
      [startedBefore, endedAfter],
    );
  },
  work: workSegmentRepository,
  interruption: interruptionRepository,
  break: breakRepository,
};
