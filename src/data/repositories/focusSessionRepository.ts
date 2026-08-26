import { invoke } from "@tauri-apps/api/core";
import { execute } from "../database";

export type FocusSnapshot = {
  sessionId: string;
  status: "active" | "paused" | "interrupted" | "completed" | "cancelled";
  currentTaskId: string | null;
  targetDurationSeconds: number;
  startedAt: number;
  endedAt: number | null;
  focusedMilliseconds: number;
  calculatedAt: number;
  openActivity: null | {
    type: "focus" | "interruption" | "break";
    id: string;
    startedAt: number;
    taskId: string | null;
    presetId: string | null;
    note: string | null;
  };
};

const now = () => Date.now();

export const focusSessionRepository = {
  getActive: () => invoke<FocusSnapshot | null>("focus_get_active", { now: now() }),
  start: (taskId: string | null, targetDurationSeconds: number) => invoke<FocusSnapshot>("focus_start", { taskId, targetDurationSeconds, now: now() }),
  switchTask: (sessionId: string, taskId: string | null) => invoke<FocusSnapshot>("focus_switch_task", { sessionId, taskId, now: now() }),
  interrupt: (sessionId: string, presetId: string | null = null, note: string | null = null) => invoke<FocusSnapshot>("focus_start_interruption", { sessionId, presetId, note, now: now() }),
  resumeInterruption: (sessionId: string, presetId: string | null = null, note: string | null = null) => invoke<FocusSnapshot>("focus_resume_interruption", { sessionId, presetId, note, now: now() }),
  pause: (sessionId: string, note: string | null = null) => invoke<FocusSnapshot>("focus_pause", { sessionId, note, now: now() }),
  resumePause: (sessionId: string) => invoke<FocusSnapshot>("focus_resume_pause", { sessionId, now: now() }),
  holdForCompletion: (sessionId: string, heldAt = now()) => invoke<FocusSnapshot>("focus_hold_for_completion", { sessionId, now: heldAt }),
  resumeCompletionHold: (sessionId: string) => invoke<FocusSnapshot>("focus_resume_completion_hold", { sessionId, now: now() }),
  complete: (sessionId: string, notes: Array<{ taskId: string | null; body: string }>) => invoke<FocusSnapshot>("focus_complete", { sessionId, notes, now: now() }),
  cancel: (sessionId: string) => invoke<FocusSnapshot>("focus_cancel", { sessionId, now: now() }),
  changeDuration: (sessionId: string, targetDurationSeconds: number) => execute(
    "UPDATE focus_sessions SET target_duration_seconds = ?2, updated_at = ?3 WHERE id = ?1 AND status IN ('active', 'paused', 'interrupted')",
    [sessionId, targetDurationSeconds, now()],
  ),
};
