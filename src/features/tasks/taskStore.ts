import { create } from "zustand";
import { taskRepository, type SaveTaskInput, type TaskRecord, type TaskStatus as DatabaseTaskStatus } from "../../data/repositories/taskRepository";
import { taskReminderRepository } from "../../data/repositories/taskReminderRepository";
import type { FlowoTask, TaskStatus } from "./TasksPage";

const uiStatus: Record<DatabaseTaskStatus, TaskStatus> = {
  todo: "todo",
  in_progress: "in-progress",
  blocked: "blocked",
  completed: "completed",
  cancelled: "cancelled",
  archived: "archived",
};

export const databaseStatus: Record<TaskStatus, DatabaseTaskStatus> = {
  todo: "todo",
  "in-progress": "in_progress",
  blocked: "blocked",
  completed: "completed",
  cancelled: "cancelled",
  archived: "archived",
};

function reminderLabel(timestamp: number) {
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function toFlowoTask(task: TaskRecord): FlowoTask {
  const reminderMinutes = task.next_reminder_at === null ? null : Math.round((task.next_reminder_at - Date.now()) / 60_000);
  return {
    id: task.id,
    title: task.title,
    context: task.context || "Unsorted / General",
    description: task.description || "No description yet.",
    status: uiStatus[task.status],
    totalMinutes: task.total_minutes,
    todayMinutes: task.today_minutes,
    reminder: task.next_reminder_at === null ? undefined : {
      label: task.next_reminder_message || reminderLabel(task.next_reminder_at),
      sortValue: reminderMinutes ?? Number.MAX_SAFE_INTEGER,
      overdue: (reminderMinutes ?? 0) < 0,
    },
    reminderCount: task.reminder_count,
    noteCount: task.note_count,
    createdOrder: task.created_at,
    workedOrder: task.last_worked_at ?? task.updated_at,
    completedToday: task.completed_at !== null && task.completed_at >= new Date().setHours(0, 0, 0, 0),
    completedAt: task.completed_at ?? undefined,
  };
}

type TaskStore = {
  tasks: FlowoTask[];
  loaded: boolean;
  error: string | null;
  load: () => Promise<void>;
  createTask: (input: SaveTaskInput, reminderMessage?: string) => Promise<string>;
  updateTask: (id: string, input: SaveTaskInput, reminderMessage?: string) => Promise<void>;
  setStatus: (id: string, status: TaskStatus) => Promise<void>;
  addReminder: (id: string, message?: string, scheduledFor?: number) => Promise<void>;
  deletePermanently: (id: string) => Promise<void>;
};

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  loaded: false,
  error: null,
  load: async () => {
    try {
      const tasks = (await taskRepository.list()).map(toFlowoTask);
      set({ tasks, loaded: true, error: null });
    } catch (error) {
      set({ loaded: true, error: error instanceof Error ? error.message : String(error) });
    }
  },
  createTask: async (input, reminderMessage) => {
    const id = await taskRepository.create(input);
    if (reminderMessage?.trim()) {
      await taskReminderRepository.create(id, Date.now() + 24 * 60 * 60 * 1000, reminderMessage);
    }
    await get().load();
    return id;
  },
  updateTask: async (id, input, reminderMessage) => {
    await taskRepository.update(id, input);
    if (reminderMessage?.trim()) {
      const reminders = await taskReminderRepository.listForTask(id);
      if (!reminders.some((reminder) => reminder.status === "active")) {
        await taskReminderRepository.create(id, Date.now() + 24 * 60 * 60 * 1000, reminderMessage);
      }
    }
    await get().load();
  },
  setStatus: async (id, status) => {
    await taskRepository.setStatus(id, databaseStatus[status]);
    await get().load();
  },
  addReminder: async (id, message = "Reminder", scheduledFor = Date.now() + 24 * 60 * 60 * 1000) => {
    await taskReminderRepository.create(id, scheduledFor, message);
    await get().load();
  },
  deletePermanently: async (id) => {
    await taskRepository.deletePermanently(id);
    set((state) => ({ tasks: state.tasks.filter((task) => task.id !== id) }));
  },
}));
