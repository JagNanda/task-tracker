import { Bell, CalendarClock, Pencil, Trash2 } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Button, IconButton, Input, Modal } from "../../cdk";
import {
  taskReminderRepository,
  type TaskReminderRecord,
} from "../../data/repositories/taskReminderRepository";

export type ReminderTaskOption = {
  id: string;
  title: string;
};

type ReminderListItem = TaskReminderRecord & {
  taskTitle: string;
};

function inputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function inputTime(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function nextReminderSlot() {
  const next = new Date(Date.now() + 60 * 60 * 1000);
  next.setMinutes(Math.ceil(next.getMinutes() / 15) * 15, 0, 0);
  return next;
}

function formatReminderTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export function RemindersDialog({
  open,
  tasks,
  initialTaskId,
  onClose,
  onChanged,
}: {
  open: boolean;
  tasks: ReminderTaskOption[];
  initialTaskId?: string;
  onClose: () => void;
  onChanged?: () => void | Promise<void>;
}) {
  const [items, setItems] = useState<ReminderListItem[]>([]);
  const [taskId, setTaskId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const scopedTasks = useMemo(
    () => initialTaskId ? tasks.filter((task) => task.id === initialTaskId) : tasks,
    [initialTaskId, tasks],
  );
  const initialTask = tasks.find((task) => task.id === initialTaskId);

  const resetForm = useCallback((nextTaskId?: string) => {
    const slot = nextReminderSlot();
    setEditingId(null);
    setTaskId(nextTaskId ?? initialTaskId ?? tasks[0]?.id ?? "");
    setDate(inputDate(slot));
    setTime(inputTime(slot));
    setMessage("");
    setError("");
  }, [initialTaskId, tasks]);

  const loadItems = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const reminderGroups = await Promise.all(scopedTasks.map(async (task) => {
        const reminders = await taskReminderRepository.listForTask(task.id);
        return reminders
          .filter((reminder) => reminder.status === "active")
          .map((reminder) => ({ ...reminder, taskTitle: task.title }));
      }));
      setItems(reminderGroups.flat().sort((a, b) => a.scheduled_for - b.scheduled_for));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [open, scopedTasks]);

  useEffect(() => {
    if (!open) return;
    resetForm();
    void loadItems();
  }, [loadItems, open, resetForm]);

  const editReminder = (reminder: ReminderListItem) => {
    const scheduled = new Date(reminder.scheduled_for);
    setEditingId(reminder.id);
    setTaskId(reminder.task_id);
    setDate(inputDate(scheduled));
    setTime(inputTime(scheduled));
    setMessage(reminder.message ?? "");
    setError("");
  };

  const saveReminder = async (event: FormEvent) => {
    event.preventDefault();
    const scheduledFor = new Date(`${date}T${time}`).getTime();
    if (!taskId) {
      setError("Choose a task for this reminder.");
      return;
    }
    if (!Number.isFinite(scheduledFor) || scheduledFor <= Date.now()) {
      setError("Choose a reminder date and time in the future.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (editingId) {
        await taskReminderRepository.update(editingId, scheduledFor, message);
      } else {
        await taskReminderRepository.create(taskId, scheduledFor, message);
      }
      await onChanged?.();
      await loadItems();
      resetForm(taskId);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  const deleteReminder = async (reminder: ReminderListItem) => {
    if (!window.confirm(`Delete the reminder for “${reminder.taskTitle}”?`)) return;
    try {
      await taskReminderRepository.setStatus(reminder.id, "cancelled");
      if (editingId === reminder.id) resetForm(reminder.task_id);
      await onChanged?.();
      await loadItems();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    }
  };

  return (
    <Modal
      open={open}
      title={initialTask ? `Reminders · ${initialTask.title}` : "Upcoming reminders"}
      onClose={onClose}
      className="reminder-manager-modal"
    >
      <div className="reminder-manager">
        <section className="reminder-manager__list" aria-label="Scheduled reminders">
          <header>
            <div>
              <h3>Scheduled</h3>
              <span>{items.length}</span>
            </div>
          </header>
          {loading ? (
            <p className="reminder-manager__empty">Loading reminders…</p>
          ) : items.length ? items.map((reminder) => (
            <article className={editingId === reminder.id ? "is-editing" : ""} key={reminder.id}>
              <span className="reminder-manager__bell"><Bell size={15} /></span>
              <div>
                <strong>{reminder.taskTitle}</strong>
                <time>{formatReminderTime(reminder.scheduled_for)}</time>
                {reminder.message && <p>{reminder.message}</p>}
              </div>
              <div className="reminder-manager__row-actions">
                <IconButton label="Edit reminder" onClick={() => editReminder(reminder)}><Pencil size={14} /></IconButton>
                <IconButton label="Delete reminder" onClick={() => void deleteReminder(reminder)}><Trash2 size={14} /></IconButton>
              </div>
            </article>
          )) : (
            <p className="reminder-manager__empty">No upcoming reminders. Add one below.</p>
          )}
        </section>

        <form className="reminder-manager__form" onSubmit={saveReminder}>
          <h3>{editingId ? "Adjust reminder" : "Add a reminder"}</h3>
          {!initialTaskId && (
            <label>
              <span>Task</span>
              <select value={taskId} onChange={(event) => setTaskId(event.target.value)} required>
                <option value="" disabled>Select a task</option>
                {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
              </select>
            </label>
          )}
          <div className="reminder-manager__date-time">
            <label>
              <span>Date</span>
              <Input type="date" min={inputDate(new Date())} value={date} onChange={(event) => setDate(event.target.value)} required />
            </label>
            <label>
              <span>Time</span>
              <Input type="time" value={time} onChange={(event) => setTime(event.target.value)} required />
            </label>
          </div>
          <label>
            <span>Message <small>optional</small></span>
            <textarea
              value={message}
              maxLength={160}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="What should you remember?"
            />
          </label>
          {error && <p className="reminder-manager__error" role="alert">{error}</p>}
          <div className="modal-actions">
            {editingId && <Button type="button" onClick={() => resetForm(taskId)}>Cancel edit</Button>}
            <Button type="submit" tone="primary" disabled={saving || !tasks.length}>
              <CalendarClock size={15} /> {saving ? "Saving…" : editingId ? "Save changes" : "Add reminder"}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
