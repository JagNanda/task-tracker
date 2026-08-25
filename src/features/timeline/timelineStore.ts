import { create } from "zustand";
import { interruptionService } from "../../data/services/interruptionService";
import { timelineRepository, type TimelineRecord } from "../../data/repositories/timelineRepository";

export type ActivityType = "focus" | "interruption" | "break";

export type TimelineActivity = {
  id: string;
  date: string;
  startMinutes: number;
  endMinutes: number;
  type: ActivityType;
  taskId?: string;
  taskName?: string;
  context?: string;
  reason?: string;
  note?: string;
  sessionId?: string;
  cancelled?: boolean;
  startedAt?: number;
  endedAt?: number;
};

export type TimelineTask = {
  id: string;
  title: string;
  context: string;
  description: string;
};

export let timelineTasks: TimelineTask[] = [];

export function setTimelineTasks(tasks: TimelineTask[]) {
  timelineTasks = tasks;
}

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function minutesOfDay(timestamp: number) {
  const date = new Date(timestamp);
  return date.getHours() * 60 + date.getMinutes();
}

function fromRecord(record: TimelineRecord): TimelineActivity {
  const end = record.ended_at ?? Date.now();
  const startDate = new Date(record.started_at);
  const startOfDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()).getTime();
  return {
    id: record.id,
    date: localDateKey(new Date(record.started_at)),
    startMinutes: minutesOfDay(record.started_at),
    endMinutes: Math.round((end - startOfDay) / 60_000),
    type: record.type,
    taskId: record.task_id ?? undefined,
    taskName: record.task_name ?? (record.type === "focus" ? "Unassigned" : undefined),
    context: record.context ?? undefined,
    reason: record.category ?? undefined,
    note: record.note ?? undefined,
    cancelled: Boolean(record.is_cancelled),
    sessionId: record.focus_session_id ?? undefined,
    startedAt: record.started_at,
    endedAt: record.ended_at ?? undefined,
  };
}

function timestamp(dateKey: string, minutes: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, Math.floor(minutes / 60), minutes % 60).getTime();
}

async function persistEntry(entry: TimelineActivity, creating: boolean) {
  const common = {
    startedAt: timestamp(entry.date, entry.startMinutes),
    endedAt: timestamp(entry.date, entry.endMinutes),
    cancelled: Boolean(entry.cancelled),
  };
  if (entry.type === "focus") {
    return creating
      ? timelineRepository.work.createManual({ id: entry.id, taskId: entry.taskId, note: entry.note, ...common })
      : timelineRepository.work.update(entry.id, { taskId: entry.taskId, note: entry.note, ...common });
  }
  if (entry.type === "interruption") {
    const presetId = await interruptionService.ensurePreset(entry.reason || "Other");
    return creating
      ? timelineRepository.interruption.createManual({ id: entry.id, presetId, note: entry.note, ...common })
      : timelineRepository.interruption.update(entry.id, { presetId, note: entry.note, ...common });
  }
  return creating
    ? timelineRepository.break.createManual({ id: entry.id, note: entry.note || entry.reason, ...common })
    : timelineRepository.break.update(entry.id, { note: entry.note || entry.reason, ...common });
}

type TimelineState = {
  entries: TimelineActivity[];
  loaded: boolean;
  load: () => Promise<void>;
  addEntry: (entry: TimelineActivity) => Promise<void>;
  updateEntry: (id: string, entry: TimelineActivity) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
};

export const useTimelineStore = create<TimelineState>((set, get) => ({
  entries: [],
  loaded: false,
  load: async () => {
    const entries = (await timelineRepository.list()).map(fromRecord);
    set({ entries, loaded: true });
  },
  addEntry: async (entry) => {
    set((state) => ({ entries: [...state.entries, entry] }));
    try {
      await persistEntry(entry, true);
      await get().load();
    } catch (error) {
      set((state) => ({ entries: state.entries.filter((item) => item.id !== entry.id) }));
      throw error;
    }
  },
  updateEntry: async (id, entry) => {
    const previous = get().entries;
    set({ entries: previous.map((item) => item.id === id ? entry : item) });
    try {
      if (previous.find((item) => item.id === id)?.type !== entry.type) {
        const original = previous.find((item) => item.id === id);
        if (original) await deletePersisted(original);
        await persistEntry(entry, true);
      } else {
        await persistEntry(entry, false);
      }
      await get().load();
    } catch (error) {
      set({ entries: previous });
      throw error;
    }
  },
  deleteEntry: async (id) => {
    const previous = get().entries;
    const entry = previous.find((item) => item.id === id);
    if (!entry) return;
    set({ entries: previous.filter((item) => item.id !== id) });
    try {
      await deletePersisted(entry);
    } catch (error) {
      set({ entries: previous });
      throw error;
    }
  },
}));

function deletePersisted(entry: TimelineActivity) {
  if (entry.type === "focus") return timelineRepository.work.delete(entry.id);
  if (entry.type === "interruption") return timelineRepository.interruption.delete(entry.id);
  return timelineRepository.break.delete(entry.id);
}

export function entryMinutes(entry: TimelineActivity) {
  return Math.max(0, entry.endMinutes - entry.startMinutes);
}

export function formatDuration(minutes: number) {
  const rounded = Math.max(0, Math.round(minutes));
  if (rounded < 60) return `${rounded}m`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return `${hours}h${rest ? ` ${String(rest).padStart(2, "0")}m` : ""}`;
}

export function formatClock(minutes: number) {
  const hours24 = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours = hours24 % 12 || 12;
  return `${hours}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export function activitySummary(entries: TimelineActivity[]) {
  const tracked = entries.filter((entry) => !entry.cancelled);
  const totalFor = (type: ActivityType) => tracked
    .filter((entry) => entry.type === type)
    .reduce((total, entry) => total + entryMinutes(entry), 0);
  return {
    focus: totalFor("focus"),
    interruptions: totalFor("interruption"),
    breaks: totalFor("break"),
    sessions: new Set(tracked.filter((entry) => entry.type === "focus").map((entry) => entry.sessionId || entry.id)).size,
    unassigned: tracked.filter((entry) => entry.type === "focus" && !entry.taskId).reduce((total, entry) => total + entryMinutes(entry), 0),
    tracked: tracked.reduce((total, entry) => total + entryMinutes(entry), 0),
    interruptionCount: tracked.filter((entry) => entry.type === "interruption").length,
  };
}
