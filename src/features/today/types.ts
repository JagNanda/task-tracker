export type SessionMode = "idle" | "ready" | "focusing" | "paused" | "interrupted";

export interface Task {
  id: string;
  title: string;
  category: string;
  tag: string;
  duration: string;
  color: string;
}

export interface Metric {
  label: string;
  value: string;
  trend: string;
  favorable: boolean;
}

export interface Reminder {
  id: string;
  title: string;
  at: string;
  relative: string;
}

export interface TimelineEntry {
  id: string;
  time: string;
  type: "Focus" | "Interrupt" | "Break";
  title?: string;
  tag: string;
  duration: string;
}

export interface TodayState {
  mode: SessionMode;
  currentTask: Task | null;
  totalSeconds: number;
  remainingSeconds: number;
  interruptionSeconds: number;
  interruptionReason: string;
  selectedDuration: number;
  todayMetrics: Metric[];
  timeline: TimelineEntry[];
  reminders: Reminder[];
  recentTasks: Task[];
  quickCaptureDraft: string;
}
