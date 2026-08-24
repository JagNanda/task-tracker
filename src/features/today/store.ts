import { create } from "zustand";
import type { FocusSnapshot } from "../../data/repositories/focusSessionRepository";
import { taskRepository } from "../../data/repositories/taskRepository";
import { focusService } from "../../data/services/focusService";
import { interruptionService } from "../../data/services/interruptionService";
import { settingsService } from "../../data/services/settingsService";
import { isPermissionGranted, sendNotification } from "@tauri-apps/plugin-notification";
import { useTaskStore } from "../tasks/taskStore";
import { activitySummary, formatClock, formatDuration, localDateKey, useTimelineStore } from "../timeline/timelineStore";
import type { Task, TodayState } from "./types";

type PersistedTimerState = {
  sessionId: string | null;
  focusedSecondsAtSync: number;
  syncedAt: number;
  activityStartedAt: number | null;
};

type TodayActions = {
  initialize: () => Promise<void>;
  tick: () => void;
  setMode: (mode: TodayState["mode"]) => void;
  togglePause: () => Promise<void>;
  interrupt: () => Promise<void>;
  resumeFocus: () => Promise<void>;
  setInterruptionReason: (reason: string) => void;
  setDuration: (minutes: number) => void;
  selectTask: (task: Task) => void;
  switchTask: (task: Task) => Promise<void>;
  startFocus: () => Promise<void>;
  startTask: (task: Task) => Promise<void>;
  cancelSession: () => Promise<void>;
  completeSession: (completionNote: string) => Promise<void>;
  setQuickCaptureDraft: (value: string) => void;
  captureTask: (startFocus?: boolean, titleOverride?: string) => Promise<void>;
};

const emptyState: TodayState & PersistedTimerState = {
  mode: "idle",
  currentTask: null,
  totalSeconds: 25 * 60,
  remainingSeconds: 25 * 60,
  interruptionSeconds: 0,
  interruptionReason: "",
  selectedDuration: 25,
  todayMetrics: [
    { label: "Focus Time", value: "0m", trend: "From tracked activity", favorable: true },
    { label: "Sessions", value: "0", trend: "From tracked activity", favorable: true },
    { label: "Interruptions", value: "0", trend: "From tracked activity", favorable: true },
    { label: "Interrupt Time", value: "0m", trend: "From tracked activity", favorable: true },
    { label: "Break Time", value: "0m", trend: "From tracked activity", favorable: true },
    { label: "Focus %", value: "0%", trend: "From tracked activity", favorable: true },
  ],
  timeline: [],
  reminders: [],
  recentTasks: [],
  quickCaptureDraft: "",
  sessionId: null,
  focusedSecondsAtSync: 0,
  syncedAt: Date.now(),
  activityStartedAt: null,
};

function uiTask(task: { id: string; title: string; context: string; totalMinutes: number }): Task {
  const [tag, category] = task.context.split(" / ");
  return {
    id: task.id,
    title: task.title,
    category: category || tag || "General",
    tag: tag || "Unsorted",
    duration: formatDuration(task.totalMinutes),
    color: "var(--blue)",
  };
}

function modeForStatus(status: FocusSnapshot["status"]): TodayState["mode"] {
  if (status === "active") return "focusing";
  if (status === "paused") return "paused";
  if (status === "interrupted") return "interrupted";
  return "idle";
}

function timerPatch(snapshot: FocusSnapshot, task: Task | null) {
  const now = Date.now();
  const mode = modeForStatus(snapshot.status);
  const focusedSeconds = snapshot.focusedMilliseconds / 1000;
  return {
    sessionId: mode === "idle" ? null : snapshot.sessionId,
    mode,
    currentTask: mode === "idle" ? null : task,
    totalSeconds: snapshot.targetDurationSeconds,
    selectedDuration: Math.round(snapshot.targetDurationSeconds / 60),
    remainingSeconds: Math.max(0, Math.ceil(snapshot.targetDurationSeconds - focusedSeconds)),
    interruptionSeconds: snapshot.openActivity?.type === "interruption" ? Math.max(0, Math.floor((now - snapshot.openActivity.startedAt) / 1000)) : 0,
    focusedSecondsAtSync: focusedSeconds,
    syncedAt: now,
    activityStartedAt: snapshot.openActivity?.startedAt ?? null,
  } satisfies Partial<TodayState & PersistedTimerState>;
}

async function dashboardPatch() {
  await Promise.all([useTaskStore.getState().load(), useTimelineStore.getState().load()]);
  const tasks = useTaskStore.getState().tasks;
  const entries = useTimelineStore.getState().entries;
  const today = entries.filter((entry) => entry.date === localDateKey());
  const totals = activitySummary(today);
  const tracked = totals.focus + totals.interruptions + totals.breaks;
  return {
    recentTasks: tasks.filter((task) => task.status !== "archived" && task.status !== "cancelled").slice(0, 6).map(uiTask),
    reminders: tasks.filter((task) => task.reminder).map((task) => ({
      id: `${task.id}-next-reminder`,
      title: task.title,
      at: task.reminder!.label,
      relative: task.reminder!.overdue ? "overdue" : task.reminder!.sortValue < 60 ? `in ${Math.max(1, task.reminder!.sortValue)}m` : `in ${Math.round(task.reminder!.sortValue / 60)}h`,
    })),
    timeline: today.map((entry) => ({
      id: entry.id,
      time: formatClock(entry.startMinutes),
      type: entry.type === "focus" ? "Focus" as const : entry.type === "interruption" ? "Interrupt" as const : "Break" as const,
      title: entry.taskName || entry.reason,
      tag: entry.context || entry.reason || (entry.type === "break" ? "Break" : "Unassigned"),
      duration: formatDuration(Math.max(0, entry.endMinutes - entry.startMinutes)),
    })),
    todayMetrics: [
      { label: "Focus Time", value: formatDuration(totals.focus), trend: "From tracked activity", favorable: true },
      { label: "Sessions", value: String(totals.sessions), trend: "From tracked activity", favorable: true },
      { label: "Interruptions", value: String(totals.interruptionCount), trend: "From tracked activity", favorable: totals.interruptionCount < 5 },
      { label: "Interrupt Time", value: formatDuration(totals.interruptions), trend: "From tracked activity", favorable: true },
      { label: "Break Time", value: formatDuration(totals.breaks), trend: "From tracked activity", favorable: true },
      { label: "Focus %", value: `${tracked ? Math.round((totals.focus / tracked) * 100) : 0}%`, trend: "From tracked activity", favorable: true },
    ],
  } satisfies Partial<TodayState>;
}

function playCompletionTone() {
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.setValueAtTime(660, context.currentTime);
    gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.45);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.45);
    oscillator.addEventListener("ended", () => void context.close());
  } catch {
    // Audio is a preference enhancement and must never block session completion.
  }
}

export const useTodayStore = create<TodayState & PersistedTimerState & TodayActions>((set, get) => ({
  ...emptyState,
  initialize: async () => {
    const [dashboard, active, settings] = await Promise.all([dashboardPatch(), focusService.restore(), settingsService.all()]);
    const preferredDuration = settings["focus.rememberLastDuration"]
      ? settings["focus.lastDuration"]
      : settings["focus.defaultDuration"];
    if (!active) {
      set({
        ...dashboard,
        mode: "idle",
        sessionId: null,
        currentTask: null,
        selectedDuration: preferredDuration,
        totalSeconds: preferredDuration * 60,
        remainingSeconds: preferredDuration * 60,
        interruptionSeconds: 0,
      });
      return;
    }
    const taskRecord = useTaskStore.getState().tasks.find((task) => task.id === active.currentTaskId);
    set({ ...dashboard, ...timerPatch(active, taskRecord ? uiTask(taskRecord) : null) });
  },
  tick: () => {
    const state = get();
    const now = Date.now();
    if (state.mode === "focusing") {
      const focused = state.focusedSecondsAtSync + (now - state.syncedAt) / 1000;
      set({ remainingSeconds: Math.max(0, Math.ceil(state.totalSeconds - focused)) });
    } else if (state.mode === "interrupted" && state.activityStartedAt !== null) {
      set({ interruptionSeconds: Math.max(0, Math.floor((now - state.activityStartedAt) / 1000)) });
    }
  },
  setMode: (mode) => set({ mode }),
  togglePause: async () => {
    const state = get();
    if (!state.sessionId) return;
    const snapshot = state.mode === "paused"
      ? await focusService.resumeFocus(state.sessionId)
      : await focusService.pauseFocus(state.sessionId);
    set(timerPatch(snapshot, state.currentTask));
    set(await dashboardPatch());
  },
  interrupt: async () => {
    const state = get();
    if (!state.sessionId || state.mode !== "focusing") return;
    const snapshot = await focusService.startInterruption(state.sessionId);
    set({ ...timerPatch(snapshot, state.currentTask), interruptionReason: "" });
    set(await dashboardPatch());
  },
  resumeFocus: async () => {
    const state = get();
    if (!state.sessionId) return;
    if (state.mode === "interrupted") {
      const presetId = state.interruptionReason ? await interruptionService.ensurePreset(state.interruptionReason) : null;
      const snapshot = await focusService.resumeFromInterruption(state.sessionId, presetId, null);
      set(timerPatch(snapshot, state.currentTask));
    } else if (state.mode === "paused") {
      const snapshot = await focusService.resumeFocus(state.sessionId);
      set(timerPatch(snapshot, state.currentTask));
    }
    set(await dashboardPatch());
  },
  setInterruptionReason: (interruptionReason) => set({ interruptionReason }),
  setDuration: (minutes) => {
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    const totalSeconds = Math.round(minutes * 60);
    const state = get();
    set({ selectedDuration: minutes, totalSeconds, remainingSeconds: state.mode === "ready" || state.mode === "idle" ? totalSeconds : state.remainingSeconds });
    if (state.sessionId) void focusService.changeDuration(state.sessionId, totalSeconds);
    void settingsService.set("focus.lastDuration", minutes);
  },
  selectTask: (task) => {
    const totalSeconds = get().selectedDuration * 60;
    set({ currentTask: task, mode: "ready", totalSeconds, remainingSeconds: totalSeconds, interruptionSeconds: 0 });
  },
  switchTask: async (task) => {
    const state = get();
    if (!state.sessionId) {
      set({ currentTask: task });
      return;
    }
    const snapshot = await focusService.switchTask(state.sessionId, task.id);
    set(timerPatch(snapshot, task));
    set(await dashboardPatch());
  },
  startFocus: async () => {
    const state = get();
    if (state.sessionId || !state.currentTask) return;
    const snapshot = await focusService.startFocus(state.currentTask.id, state.selectedDuration * 60);
    set(timerPatch(snapshot, state.currentTask));
    set(await dashboardPatch());
  },
  startTask: async (task) => {
    const state = get();
    if (!state.sessionId) {
      const settings = await settingsService.all();
      const duration = settings["focus.startBehavior"] === "last"
        ? settings["focus.lastDuration"]
        : settings["focus.startBehavior"] === "default"
          ? settings["focus.defaultDuration"]
          : state.selectedDuration;
      if (settings["focus.startBehavior"] === "ask") {
        set({ currentTask: task, mode: "ready", selectedDuration: duration, totalSeconds: duration * 60, remainingSeconds: duration * 60, interruptionSeconds: 0 });
        return;
      }
      const snapshot = await focusService.startFocus(task.id, duration * 60);
      set(timerPatch(snapshot, task));
      set(await dashboardPatch());
      return;
    }
    const snapshot = await focusService.switchTask(state.sessionId, task.id);
    set(timerPatch(snapshot, task));
    set(await dashboardPatch());
  },
  cancelSession: async () => {
    const state = get();
    if (state.sessionId) await focusService.cancelActiveFocus(state.sessionId);
    set({ currentTask: null, mode: "idle", sessionId: null, remainingSeconds: state.selectedDuration * 60, interruptionSeconds: 0 });
    set(await dashboardPatch());
  },
  completeSession: async (completionNote) => {
    const state = get();
    if (!state.sessionId) return;
    const summary = completionNote.trim();
    if (!summary) throw new Error("A short session summary is required before finishing.");
    const settings = await settingsService.all();
    const notes = [{ taskId: state.currentTask?.id ?? null, body: summary }];
    await focusService.completeFocus(state.sessionId, notes);
    set({ currentTask: null, mode: "idle", sessionId: null, remainingSeconds: state.selectedDuration * 60, interruptionSeconds: 0 });
    set(await dashboardPatch());
    if (settings["notifications.focusSound"]) playCompletionTone();
    if (settings["notifications.focusComplete"] && await isPermissionGranted().catch(() => false)) {
      sendNotification({ title: "Focus session complete", body: state.currentTask ? `Focused work on ${state.currentTask.title} was saved.` : "Your focused work was saved." });
    }
  },
  setQuickCaptureDraft: (quickCaptureDraft) => set({ quickCaptureDraft }),
  captureTask: async (startFocus = false, titleOverride) => {
    const title = (titleOverride ?? get().quickCaptureDraft).trim();
    if (!title) return;
    const settings = await settingsService.all();
    const shouldStart = startFocus || settings["tasks.startFocusAfterCreate"];
    const id = await taskRepository.create({ title, context: "Quick Capture / Unsorted", status: shouldStart ? "in_progress" : settings["tasks.defaultStatus"] === "in_progress" ? "in_progress" : "todo" });
    if (titleOverride === undefined) set({ quickCaptureDraft: "" });
    const dashboard = await dashboardPatch();
    set(dashboard);
    if (shouldStart) {
      const task = dashboard.recentTasks?.find((item) => item.id === id);
      if (task) await get().startTask(task);
    }
  },
}));
