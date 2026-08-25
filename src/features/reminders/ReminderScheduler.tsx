import { BellRing, Clock3, ExternalLink } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  isPermissionGranted,
  onAction,
  sendNotification,
  type Options as NotificationOptions,
} from "@tauri-apps/plugin-notification";
import { Button, Modal, Pill } from "../../cdk";
import {
  taskReminderRepository,
  type DueTaskReminderRecord,
} from "../../data/repositories/taskReminderRepository";
import { settingsService } from "../../data/services/settingsService";
import { playCompletionSound } from "../../audio/completionSounds";
import { useTaskStore } from "../tasks/taskStore";
import { useTodayStore } from "../today/store";
import type { SettingsState } from "../settings/settingsDefaults";

type ReminderOpenBehavior = "popup" | "tasks";

function snoozedUntil(option: string) {
  const now = new Date();
  if (option === "tomorrow") {
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0, 0);
    return tomorrow.getTime();
  }
  const amounts: Record<string, number> = { "5m": 5, "15m": 15, "30m": 30, "1h": 60 };
  return now.getTime() + (amounts[option] ?? 15) * 60_000;
}

function snoozeLabel(option: string) {
  return ({ "5m": "5 minutes", "15m": "15 minutes", "30m": "30 minutes", "1h": "1 hour", tomorrow: "Tomorrow at 9:00 AM" })[option] ?? option;
}

function notificationExtra(notification: NotificationOptions) {
  const extra = notification.extra;
  if (!extra || extra.kind !== "task-reminder" || typeof extra.taskId !== "string") return null;
  return {
    reminderId: typeof extra.reminderId === "string" ? extra.reminderId : null,
    taskId: extra.taskId,
  };
}

export function ReminderScheduler({
  enabled,
  onOpenTask,
}: {
  enabled: boolean;
  onOpenTask: (taskId: string, behavior: ReminderOpenBehavior) => void;
}) {
  const [queue, setQueue] = useState<DueTaskReminderRecord[]>([]);
  const [preferences, setPreferences] = useState<SettingsState | null>(null);
  const [busy, setBusy] = useState(false);
  const checking = useRef(false);
  const current = queue[0] ?? null;

  const refreshReminderViews = useCallback(async () => {
    await useTaskStore.getState().load();
    await useTodayStore.getState().refreshDashboard();
  }, []);

  const checkDue = useCallback(async () => {
    if (!enabled || checking.current) return;
    checking.current = true;
    try {
      const settings = await settingsService.all();
      setPreferences(settings);
      if (!settings["notifications.reminders"]) return;
      if (document.hidden && !settings["desktop.keepRemindersInTray"]) return;
      const due = await taskReminderRepository.listDue();
      if (!due.length) return;
      const firedAt = Date.now();
      await Promise.all(due.map((reminder) => taskReminderRepository.markFired(reminder.id, firedAt)));
      setQueue((existing) => {
        const known = new Set(existing.map((reminder) => reminder.id));
        return [...existing, ...due.filter((reminder) => !known.has(reminder.id))];
      });
      if (settings["notifications.reminderSound"]) void playCompletionSound("bell");
      if (await isPermissionGranted().catch(() => false)) {
        due.forEach((reminder) => sendNotification({
          title: reminder.task_title,
          body: reminder.message || "Task reminder",
          autoCancel: true,
          extra: { kind: "task-reminder", reminderId: reminder.id, taskId: reminder.task_id },
        }));
      }
    } catch (error) {
      console.error("Failed to check task reminders", error);
    } finally {
      checking.current = false;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void checkDue();
    const timer = window.setInterval(() => void checkDue(), 15_000);
    const onVisibility = () => { if (!document.hidden) void checkDue(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [checkDue, enabled]);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let unregister: (() => Promise<void>) | undefined;
    void onAction(async (notification) => {
      const extra = notificationExtra(notification);
      if (!extra) return;
      const settings = await settingsService.all();
      if (extra.reminderId) await taskReminderRepository.setStatus(extra.reminderId, "dismissed");
      setQueue((items) => items.filter((item) => item.id !== extra.reminderId));
      await refreshReminderViews();
      onOpenTask(extra.taskId, settings["reminders.openBehavior"] === "tasks" ? "tasks" : "popup");
    }).then((listener) => {
      if (disposed) void listener.unregister();
      else unregister = () => listener.unregister();
    }).catch((error) => console.error("Failed to listen for reminder actions", error));
    return () => {
      disposed = true;
      void unregister?.();
    };
  }, [enabled, onOpenTask, refreshReminderViews]);

  const dismiss = async () => {
    if (!current) return;
    setBusy(true);
    try {
      await taskReminderRepository.setStatus(current.id, "dismissed");
      setQueue((items) => items.slice(1));
      await refreshReminderViews();
    } finally {
      setBusy(false);
    }
  };

  const snooze = async (option: string) => {
    if (!current) return;
    setBusy(true);
    try {
      await taskReminderRepository.snooze(current.id, snoozedUntil(option));
      setQueue((items) => items.slice(1));
      await refreshReminderViews();
    } finally {
      setBusy(false);
    }
  };

  const openTask = async () => {
    if (!current) return;
    const behavior = preferences?.["reminders.openBehavior"] === "tasks" ? "tasks" : "popup";
    await dismiss();
    onOpenTask(current.task_id, behavior);
  };

  const choices = preferences?.["reminders.snoozeOptions"] ?? ["5m", "15m", "30m", "1h", "tomorrow"];
  const defaultChoice = preferences?.["reminders.defaultSnooze"] ?? "15m";

  return (
    <Modal open={Boolean(current)} title="Task reminder" onClose={() => void dismiss()} className="due-reminder-modal">
      {current && <div className="due-reminder">
        <span className="due-reminder__icon"><BellRing size={24} /></span>
        <div className="due-reminder__copy">
          <h3>{current.task_title}</h3>
          <p>{current.message || "You asked to be reminded about this task."}</p>
          <small><Clock3 size={13} /> Due {new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(current.scheduled_for))}</small>
        </div>
        {queue.length > 1 && <span className="due-reminder__queue">{queue.length - 1} more</span>}
        <div className="due-reminder__snooze">
          <span>Snooze for</span>
          <div>{choices.map((choice) => <Pill key={choice} selected={choice === defaultChoice} disabled={busy} onClick={() => void snooze(choice)}>{snoozeLabel(choice)}</Pill>)}</div>
        </div>
        <div className="modal-actions">
          <Button disabled={busy} onClick={() => void dismiss()}>Dismiss</Button>
          <Button tone="primary" disabled={busy} onClick={() => void openTask()}><ExternalLink size={15} /> Open task</Button>
        </div>
      </div>}
    </Modal>
  );
}
