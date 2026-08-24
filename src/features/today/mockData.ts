import type { TodayState } from "./types";

export const mockTodayState: TodayState = {
  mode: "idle",
  currentTask: null,
  totalSeconds: 1500,
  remainingSeconds: 1477,
  interruptionSeconds: 0,
  interruptionReason: "Meeting",
  selectedDuration: 25,
  todayMetrics: [
    { label: "Focus Time", value: "3h 42m", trend: "↑ 12% vs yesterday", favorable: true },
    { label: "Sessions", value: "6", trend: "↓ 2 vs yesterday", favorable: true },
    { label: "Interruptions", value: "4", trend: "↓ 1 vs yesterday", favorable: true },
    { label: "Interrupt Time", value: "47m", trend: "↓ 15m vs yesterday", favorable: true },
    { label: "Break Time", value: "32m", trend: "↑ 5m vs yesterday", favorable: false },
    { label: "Focus %", value: "78%", trend: "↑ 7% vs yesterday", favorable: true },
  ],
  reminders: [
    { id: "review", title: "Code review with team", at: "Today, 11:00 AM", relative: "in 1h 15m" },
    { id: "docs", title: "Update API documentation", at: "Today, 2:30 PM", relative: "in 4h 45m" },
    { id: "refactor", title: "Refactor session service", at: "Tomorrow, 9:00 AM", relative: "in 20h" },
  ],
  recentTasks: [
    { id: "auth", title: "Implement user authentication", category: "Auth service", tag: "Backend", duration: "3h 12m", color: "#2388ff" },
    { id: "token", title: "Fix token refresh bug", category: "Auth service", tag: "Backend", duration: "1h 05m", color: "#20c77a" },
    { id: "tests", title: "Improve unit tests", category: "Quality", tag: "Testing", duration: "45m", color: "#9b5cff" },
    { id: "limits", title: "Update API rate limiting", category: "API", tag: "Backend", duration: "30m", color: "#ff7a14" },
    { id: "session", title: "Refactor session service", category: "Auth service", tag: "Backend", duration: "15m", color: "#7891b1" },
  ],
  timeline: [
    { id: "1", time: "9:04 AM", type: "Focus", title: "Implement user authentication", tag: "Backend", duration: "1h 12m" },
    { id: "2", time: "10:16 AM", type: "Interrupt", title: "Meeting", tag: "Calendar", duration: "27m" },
    { id: "3", time: "10:43 AM", type: "Focus", title: "Implement user authentication", tag: "Backend", duration: "58m" },
    { id: "4", time: "11:41 AM", type: "Break", tag: "Lunch", duration: "32m" },
    { id: "5", time: "12:13 PM", type: "Focus", title: "Fix token refresh bug", tag: "Backend", duration: "1h 05m" },
    { id: "6", time: "1:18 PM", type: "Interrupt", title: "Coworker", tag: "Discussion", duration: "12m" },
    { id: "7", time: "1:30 PM", type: "Focus", title: "Fix token refresh bug", tag: "Backend", duration: "35m" },
  ],
  quickCaptureDraft: "",
};
