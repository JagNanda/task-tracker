import {
  Archive,
  Bell,
  BellRing,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  CircleSlash2,
  Clock3,
  EllipsisVertical,
  FileText,
  Image as ImageIcon,
  ListFilter,
  MessageSquareText,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  SwitchCamera,
  Zap,
  X,
} from "lucide-react";
import { type FormEvent, type KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Badge, Button, IconButton, Input, Modal, Popover } from "../../cdk";
import { AppSidebar, MobileNavigation } from "../today/AppSidebar";
import { useTodayStore } from "../today/store";
import {
  NoteComposerModal,
  type NoteAttachment,
  type NoteComposerTask,
} from "./NoteComposerModal";
import { NotesViewerModal } from "./NotesViewerModal";
import { type TaskNote, useTaskNotesStore } from "./notesStore";
import { databaseStatus, useTaskStore } from "./taskStore";
import { entryMinutes, formatClock, formatDuration, localDateKey, type TimelineActivity, useTimelineStore } from "../timeline/timelineStore";
import { settingsService } from "../../data/services/settingsService";
import { RemindersDialog } from "../reminders/RemindersDialog";
import type { SessionMode } from "../today/types";

export type TaskStatus = "in-progress" | "todo" | "blocked" | "completed" | "cancelled" | "archived";
type StatusFilter = "active" | "blocked" | "completed" | "cancelled" | "archived";
type ReminderFilter = "all" | "due-soon" | "has-reminder";
type SortOption = "Recently Worked On" | "Recently Created" | "Reminder Time" | "Name" | "Time Spent";
type ActiveFocusMode = Extract<SessionMode, "focusing" | "paused" | "interrupted">;

type TaskReminder = {
  label: string;
  message?: string;
  scheduledFor?: number;
  sortValue: number;
  overdue?: boolean;
};

type NoteComposerState = {
  mode: "create" | "edit";
  taskId: string;
  noteId?: string;
};

export type FlowoTask = {
  id: string;
  title: string;
  context: string;
  description: string;
  status: TaskStatus;
  totalMinutes: number;
  todayMinutes: number;
  reminder?: TaskReminder;
  reminderCount: number;
  noteCount: number;
  createdOrder: number;
  workedOrder: number;
  completedToday?: boolean;
  completedAt?: number;
};

export const initialTasks: FlowoTask[] = [
  {
    id: "auth",
    title: "Implement user authentication",
    context: "Backend / Auth service",
    description: "Implement secure user authentication with email/password and OAuth providers. Includes login, registration, and password reset flows.",
    status: "in-progress",
    totalMinutes: 192,
    todayMinutes: 72,
    reminder: { label: "Today 11:00 AM", sortValue: 15 },
    reminderCount: 2,
    noteCount: 4,
    createdOrder: 17,
    workedOrder: 24,
  },
  {
    id: "token",
    title: "Fix token refresh bug",
    context: "Backend / Auth service",
    description: "Resolve the intermittent refresh-token race during session renewal.",
    status: "in-progress",
    totalMinutes: 45,
    todayMinutes: 45,
    reminder: { label: "in 45m", sortValue: 45 },
    reminderCount: 1,
    noteCount: 2,
    createdOrder: 18,
    workedOrder: 23,
  },
  {
    id: "api-docs",
    title: "Update API documentation",
    context: "Docs / API",
    description: "Document the new authentication and account endpoints.",
    status: "in-progress",
    totalMinutes: 30,
    todayMinutes: 30,
    reminder: { label: "Today 2:30 PM", sortValue: 225 },
    reminderCount: 1,
    noteCount: 3,
    createdOrder: 15,
    workedOrder: 22,
  },
  {
    id: "session",
    title: "Refactor session service",
    context: "Backend / Session",
    description: "Simplify session persistence and cleanup paths.",
    status: "in-progress",
    totalMinutes: 15,
    todayMinutes: 15,
    reminder: { label: "Overdue 15m", sortValue: -15, overdue: true },
    reminderCount: 1,
    noteCount: 5,
    createdOrder: 14,
    workedOrder: 21,
  },
  {
    id: "review",
    title: "Code review with team",
    context: "Team / Review",
    description: "Review the authentication pull request with the platform team.",
    status: "in-progress",
    totalMinutes: 65,
    todayMinutes: 35,
    reminder: { label: "Today 3:00 PM", sortValue: 255 },
    reminderCount: 1,
    noteCount: 2,
    createdOrder: 12,
    workedOrder: 20,
  },
  {
    id: "login-ui",
    title: "Design login flow UI",
    context: "Frontend / UI",
    description: "Create the interaction and visual states for sign in and registration.",
    status: "todo",
    totalMinutes: 0,
    todayMinutes: 0,
    reminder: { label: "Tomorrow 10:00 AM", sortValue: 1215 },
    reminderCount: 1,
    noteCount: 1,
    createdOrder: 24,
    workedOrder: 15,
  },
  {
    id: "cicd",
    title: "Set up CI/CD pipeline",
    context: "DevOps / CI",
    description: "Create the release build and automated verification pipeline.",
    status: "todo",
    totalMinutes: 0,
    todayMinutes: 0,
    reminder: { label: "Tomorrow 1:00 PM", sortValue: 1395 },
    reminderCount: 1,
    noteCount: 2,
    createdOrder: 23,
    workedOrder: 14,
  },
  {
    id: "integration",
    title: "Write integration tests",
    context: "Backend / Tests",
    description: "Cover the complete sign-in, renewal, and sign-out paths.",
    status: "todo",
    totalMinutes: 0,
    todayMinutes: 0,
    reminderCount: 0,
    noteCount: 0,
    createdOrder: 22,
    workedOrder: 13,
  },
  {
    id: "security",
    title: "Review security requirements",
    context: "Security / Review",
    description: "Confirm threat-model and password-policy requirements.",
    status: "todo",
    totalMinutes: 0,
    todayMinutes: 0,
    reminder: { label: "May 17, 10:00 AM", sortValue: 2880 },
    reminderCount: 1,
    noteCount: 2,
    createdOrder: 21,
    workedOrder: 12,
  },
  {
    id: "database",
    title: "Optimize database queries",
    context: "Backend / Database",
    description: "Profile and improve the slow account lookups.",
    status: "todo",
    totalMinutes: 0,
    todayMinutes: 0,
    reminderCount: 0,
    noteCount: 1,
    createdOrder: 20,
    workedOrder: 11,
  },
  {
    id: "release",
    title: "Prepare release notes",
    context: "Release / Docs",
    description: "Summarize shipped fixes and migration guidance.",
    status: "todo",
    totalMinutes: 0,
    todayMinutes: 0,
    reminder: { label: "May 18, 9:00 AM", sortValue: 4320 },
    reminderCount: 1,
    noteCount: 0,
    createdOrder: 19,
    workedOrder: 10,
  },
  {
    id: "unit-tests",
    title: "Improve unit tests",
    context: "Backend / Tests",
    description: "Increase coverage for permission and expiry edge cases.",
    status: "blocked",
    totalMinutes: 0,
    todayMinutes: 0,
    reminderCount: 0,
    noteCount: 1,
    createdOrder: 13,
    workedOrder: 19,
  },
  {
    id: "alignment",
    title: "Fix UI alignment issue",
    context: "Frontend / UI",
    description: "Correct the settings toolbar alignment at laptop widths.",
    status: "completed",
    totalMinutes: 20,
    todayMinutes: 20,
    reminderCount: 0,
    noteCount: 1,
    createdOrder: 10,
    workedOrder: 18,
    completedToday: true,
  },
  {
    id: "dependencies",
    title: "Update dependency versions",
    context: "DevOps / Dependencies",
    description: "Update the pinned runtime and UI packages.",
    status: "completed",
    totalMinutes: 25,
    todayMinutes: 25,
    reminderCount: 0,
    noteCount: 2,
    createdOrder: 9,
    workedOrder: 17,
    completedToday: true,
  },
  {
    id: "logs",
    title: "Investigate login error logs",
    context: "Backend / Monitoring",
    description: "Review failed login spikes from the latest deploy.",
    status: "completed",
    totalMinutes: 35,
    todayMinutes: 35,
    reminderCount: 0,
    noteCount: 3,
    createdOrder: 8,
    workedOrder: 16,
    completedToday: true,
  },
  {
    id: "legacy",
    title: "Migrate legacy session keys",
    context: "Backend / Migration",
    description: "Cancelled after the service architecture changed.",
    status: "cancelled",
    totalMinutes: 85,
    todayMinutes: 0,
    reminderCount: 0,
    noteCount: 4,
    createdOrder: 7,
    workedOrder: 7,
  },
  {
    id: "old-docs",
    title: "Document v1 endpoints",
    context: "Docs / Archive",
    description: "Reference notes for the retired v1 endpoints.",
    status: "archived",
    totalMinutes: 130,
    todayMinutes: 0,
    reminderCount: 0,
    noteCount: 6,
    createdOrder: 3,
    workedOrder: 3,
  },
];

const statusLabels: Record<TaskStatus, string> = {
  "in-progress": "In Progress",
  todo: "To Do",
  blocked: "Blocked",
  completed: "Completed",
  cancelled: "Cancelled",
  archived: "Archived",
};

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}h${rest ? ` ${rest}m` : ""}`;
}

function statusIcon(status: TaskStatus) {
  if (status === "completed") return <Check size={12} strokeWidth={3} />;
  if (status === "blocked") return <CircleSlash2 size={15} />;
  if (status === "cancelled") return <X size={13} />;
  if (status === "archived") return <Archive size={12} />;
  return null;
}

function TaskRow({
  task,
  selected,
  focusMode,
  onSelect,
  onStart,
  onViewNotes,
  onAction,
}: {
  task: FlowoTask;
  selected: boolean;
  focusMode: ActiveFocusMode | null;
  onSelect: () => void;
  onStart: () => void;
  onViewNotes: () => void;
  onAction: (action: string) => void;
}) {
  const focusStateLabel = focusMode === "focusing" ? "Focusing" : focusMode === "paused" ? "Paused" : focusMode === "interrupted" ? "Interrupted" : null;
  const activeActions = ["Edit", "Add Reminder", "Mark Complete", task.status === "blocked" ? "Mark To Do" : "Mark Blocked", "Cancel Task", "Archive"];
  const completedActions = ["Reopen", "Archive"];
  const archivedActions = ["Restore", "Delete Permanently"];
  const actions = task.status === "archived" ? archivedActions : task.status === "completed" || task.status === "cancelled" ? completedActions : activeActions;

  const moveFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter") onSelect();
    if (event.key.toLowerCase() === "f" && !event.ctrlKey && !event.metaKey) onStart();
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-task-row]"));
    const index = rows.indexOf(event.currentTarget);
    rows[index + (event.key === "ArrowDown" ? 1 : -1)]?.focus();
  };

  return (
    <div
      className={`task-row task-row--${task.status} ${selected ? "is-selected" : ""} ${focusMode ? "is-focusing" : ""}`}
      data-task-row
      role="listitem"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={moveFocus}
    >
      <span className="task-row__status" aria-label={statusLabels[task.status]}>{statusIcon(task.status)}</span>
      <button className="task-row__title" type="button" onClick={onSelect}>{task.title}</button>
      <Badge className="task-row__context">{task.context}</Badge>
      <span className="task-row__state">
        {focusMode ? <Badge className={`task-focus-badge task-focus-badge--${focusMode}`}>{focusMode === "interrupted" ? <Zap size={11} fill="currentColor" /> : <Pause size={11} fill="currentColor" />} {focusStateLabel}</Badge> : task.status === "blocked" ? <Badge className="task-blocked-badge">Blocked</Badge> : null}
      </span>
      <span className="task-row__time" title={task.todayMinutes ? `Today ${formatMinutes(task.todayMinutes)}` : "No time tracked today"}>{formatMinutes(task.totalMinutes)}</span>
      <span className={`task-row__reminder ${task.reminder ? "has-reminder" : ""} ${task.reminder?.overdue ? "is-overdue" : ""}`}>
        <Bell size={16} />
        <span>{task.reminder?.label ?? "—"}</span>
        {task.reminderCount > 1 && <small>+{task.reminderCount - 1}</small>}
      </span>
      <button className="task-row__notes" type="button" aria-label={`View ${task.noteCount} notes`} onClick={(event) => { event.stopPropagation(); onViewNotes(); }}>
        <MessageSquareText size={15} /> {task.noteCount}
      </button>
      {(task.status === "in-progress" || task.status === "todo" || task.status === "blocked") ? (
        <IconButton
          className="task-row__play"
          label={focusMode === "focusing" ? `Pause focus on ${task.title}` : focusMode ? `Resume focus on ${task.title}` : `Start focus on ${task.title}`}
          onClick={(event) => { event.stopPropagation(); onStart(); }}
        >
          {focusMode === "focusing" ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
        </IconButton>
      ) : <span className="task-row__play-spacer" />}
      <div className="task-row__more" onClick={(event) => event.stopPropagation()}>
        <Popover
          label={`Actions for ${task.title}`}
          trigger={<IconButton label={`Actions for ${task.title}`}><EllipsisVertical size={17} /></IconButton>}
        >
          {actions.map((action) => (
            <button key={action} className={`cdk-menu-item ${action === "Delete Permanently" ? "is-danger" : ""}`} type="button" onClick={() => onAction(action)}>{action}</button>
          ))}
        </Popover>
      </div>
    </div>
  );
}

function TaskSection({
  title,
  tasks,
  selectedId,
  activeFocusId,
  focusMode,
  onSelect,
  onStart,
  onViewNotes,
  onAction,
}: {
  title: string;
  tasks: FlowoTask[];
  selectedId: string | null;
  activeFocusId: string | null;
  focusMode: ActiveFocusMode | null;
  onSelect: (task: FlowoTask) => void;
  onStart: (task: FlowoTask) => void;
  onViewNotes: (task: FlowoTask) => void;
  onAction: (task: FlowoTask, action: string) => void;
}) {
  const [open, setOpen] = useState(true);
  if (!tasks.length) return null;
  return (
    <section className="task-section">
      <button className="task-section__header" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span>{title} <small>{tasks.length}</small></span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <div className="task-section__rows" role="list">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              selected={selectedId === task.id}
              focusMode={activeFocusId === task.id ? focusMode : null}
              onSelect={() => onSelect(task)}
              onStart={() => onStart(task)}
              onViewNotes={() => onViewNotes(task)}
              onAction={(action) => onAction(task, action)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function TaskDetailsPopup({
  task,
  notes,
  entries,
  focusMode,
  onClose,
  onStart,
  onInterrupt,
  onAction,
  onAddNote,
  onViewNotes,
  onViewHistory,
  onStatusChange,
}: {
  task: FlowoTask | null;
  notes: TaskNote[];
  entries: TimelineActivity[];
  focusMode: ActiveFocusMode | null;
  onClose: () => void;
  onStart: () => void;
  onInterrupt: () => void;
  onAction: (action: string) => void;
  onAddNote: () => void;
  onViewNotes: () => void;
  onViewHistory: () => void;
  onStatusChange: (status: TaskStatus) => void;
}) {
  useEffect(() => {
    if (!task) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [task]);

  if (!task) return null;

  const workEligible = task.status === "in-progress" || task.status === "todo" || task.status === "blocked";
  const tags = task.context.split(" / ");
  const taskEntries = entries
    .filter((entry) => entry.type === "focus" && entry.taskId === task.id && !entry.cancelled && entry.endedAt !== undefined)
    .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
  const todayEntries = taskEntries.filter((entry) => entry.date === localDateKey());
  const latest = taskEntries[0];
  const sessionCount = new Set(taskEntries.map((entry) => entry.sessionId ?? entry.id)).size;
  const todaySessionCount = new Set(todayEntries.map((entry) => entry.sessionId ?? entry.id)).size;
  const entryDate = (entry: TimelineActivity) => {
    const date = new Date(entry.startedAt ?? new Date(`${entry.date}T00:00:00`).getTime());
    if (entry.date === localDateKey()) return "Today";
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric" }).format(date);
  };

  return createPortal(
    <div className="task-details-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="task-details-popup" role="dialog" aria-modal="true" aria-labelledby="task-details-title">
        <header className="task-details-popup__header">
          <div className="task-details-popup__heading">
            <span className={`task-details-popup__dot task-details-popup__dot--${task.status}`} />
            <h2 id="task-details-title">{task.title}</h2>
            <IconButton label="Edit task" onClick={() => onAction("Edit")}><Pencil size={17} /></IconButton>
          </div>
          <IconButton className="task-details-popup__close" label="Close task details" onClick={onClose}><X size={20} /></IconButton>
        </header>

        <div className="task-details-popup__tags">
          <label className={`task-details-popup__status task-details-popup__status--${task.status}`}>
            <span /><select aria-label="Task status" value={task.status} onChange={(event) => onStatusChange(event.target.value as TaskStatus)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><ChevronDown size={13} />
          </label>
          {tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}
        </div>

        <section className="task-details-metrics" aria-label="Task metrics">
          <div><span className="metric-icon metric-icon--blue"><Clock3 size={16} /></span><p>Total Focus Time<strong>{formatMinutes(task.totalMinutes)}</strong><small>Across {sessionCount} session{sessionCount === 1 ? "" : "s"}</small></p></div>
          <div><span className="metric-icon metric-icon--green"><Clock3 size={16} /></span><p>Today's Time<strong>{formatMinutes(task.todayMinutes)}</strong><small>{todaySessionCount ? `${todaySessionCount} session${todaySessionCount === 1 ? "" : "s"} today` : "No sessions today"}</small></p></div>
          <div><span className="metric-icon metric-icon--purple"><Clock3 size={16} /></span><p>Last Session<strong>{latest ? formatDuration(entryMinutes(latest)) : "—"}</strong><small>{latest ? `${entryDate(latest)}, ${formatClock(latest.startMinutes)}` : "No sessions yet"}</small></p></div>
          <div><span className="metric-icon"><CalendarDays size={16} /></span><p>Last Worked On<strong>{latest ? entryDate(latest) : "Not yet"}</strong><small>{latest ? formatClock(latest.startMinutes) : "Start a focus session"}</small></p></div>
        </section>

        <div className={`task-details-popup__actions ${focusMode === "focusing" ? "has-active-focus" : ""}`}>
          {workEligible && <Button tone="primary" onClick={onStart}>{focusMode === "focusing" ? <><Pause size={14} fill="currentColor" /> Pause Focus</> : focusMode ? <><Play size={14} fill="currentColor" /> Resume Focus</> : <><Play size={14} fill="currentColor" /> Start Focus</>}</Button>}
          {workEligible && focusMode === "focusing" && <Button tone="orange" onClick={onInterrupt}><Zap size={15} fill="currentColor" /> Interrupt</Button>}
          {workEligible && <Button onClick={() => onAction("Switch Task")}><SwitchCamera size={15} /> Switch Task</Button>}
          {task.status === "completed" || task.status === "cancelled" || task.status === "archived" ? <Button onClick={() => onAction(task.status === "archived" ? "Restore" : "Reopen")}><Check size={15} /> {task.status === "archived" ? "Restore Task" : "Reopen Task"}</Button> : <Button onClick={() => onAction("Mark Complete")}><Check size={15} /> Mark Complete</Button>}
          {workEligible && <Button className="is-danger" onClick={() => onAction("Cancel Task")}><X size={15} /> Cancel Task</Button>}
          {task.status !== "archived" && <Button onClick={() => onAction("Archive")}><Archive size={15} /> Archive Task</Button>}
        </div>

        <div className="task-details-grid">
          <section className="task-details-card">
            <header><h3>Reminders <small>{task.reminderCount}</small></h3><button type="button" onClick={() => onAction("Add Reminder")}>{task.reminderCount ? "Manage reminders" : "+ Add Reminder"}</button></header>
            <div className="task-detail-reminders">
              {task.reminder ? (
                <article><span><Bell size={16} /></span><div><strong>{task.reminder.label}</strong><p>{task.reminder.message || (task.reminder.overdue ? "This reminder is overdue" : "Next scheduled reminder")}</p></div><small>{task.reminder.overdue ? "Overdue" : "Upcoming"}</small></article>
              ) : <p className="task-details-empty">No reminders scheduled.</p>}
              {task.reminderCount > 1 && <button className="task-details-card__footer" type="button" onClick={() => onAction("Add Reminder")}>View all {task.reminderCount} reminders</button>}
            </div>
          </section>

          <section className="task-details-card">
            <header><h3>Notes <small>{task.noteCount}</small></h3><button type="button" onClick={onAddNote}>+ Add Note</button></header>
            <div className="task-detail-note-list">
              {notes.map((note, index) => <button className="task-detail-note-item" type="button" key={note.id} onClick={onViewNotes}><div><ChevronDown className={index ? "is-collapsed" : ""} size={14} /><strong>{note.body}</strong></div><time>{note.updatedAt}</time>{note.attachments.length > 0 && <small><ImageIcon size={12} /> {note.attachments.length}</small>}</button>)}
              {!notes.length && <p className="task-details-empty">No notes yet.</p>}
            </div>
            {notes.length > 0 && <button className="task-details-card__footer" type="button" onClick={onViewNotes}>View all notes</button>}
          </section>

          <section className="task-details-card">
            <header><h3>Work History</h3><button type="button" onClick={onViewHistory}>Open in Timeline</button></header>
            <div className="task-history-list">
              {taskEntries.slice(0, 5).map((entry) => <article key={entry.id}><span /><div><strong>{entryDate(entry)}, {formatClock(entry.startMinutes)} – {formatClock(entry.endMinutes)}</strong><small>Focus session</small></div><b>{formatDuration(entryMinutes(entry))}</b><small><MessageSquareText size={12} /> {entry.note ? 1 : 0}</small></article>)}
              {!taskEntries.length && <p className="task-details-empty">No focus sessions yet.</p>}
            </div>
          </section>

          <section className="task-details-card task-details-description">
            <header><h3>Description / Context</h3><button type="button" onClick={() => onAction("Edit")} aria-label="Edit description"><Pencil size={15} /></button></header>
            <p>{task.description}</p>
            <strong>Context</strong>
            <ul>{tags.map((tag) => <li key={tag}>{tag}</li>)}</ul>
          </section>
        </div>
      </section>
    </div>,
    document.getElementById("modal-root")!,
  );
}

export function TasksPage({ onNavigate }: { onNavigate?: (label: string) => void }) {
  const tasks = useTaskStore((state) => state.tasks);
  const createPersistentTask = useTaskStore((state) => state.createTask);
  const updatePersistentTask = useTaskStore((state) => state.updateTask);
  const setPersistentTaskStatus = useTaskStore((state) => state.setStatus);
  const deletePersistentTask = useTaskStore((state) => state.deletePermanently);
  const timelineEntries = useTimelineStore((state) => state.entries);
  const [filter, setFilter] = useState<StatusFilter>("active");
  const [reminderFilter, setReminderFilter] = useState<ReminderFilter>("all");
  const [sort, setSort] = useState<SortOption>("Recently Worked On");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const requested = window.sessionStorage.getItem("flowo:tasks-open");
    if (requested) window.sessionStorage.removeItem("flowo:tasks-open");
    return requested;
  });
  const [requestedReveal] = useState<string | null>(() => {
    const requested = window.sessionStorage.getItem("flowo:tasks-reveal");
    if (requested) window.sessionStorage.removeItem("flowo:tasks-reveal");
    return requested;
  });
  const [requestedAction] = useState<"edit" | "reminder" | "note" | null>(() => {
    const requested = window.sessionStorage.getItem("flowo:tasks-action");
    if (requested) window.sessionStorage.removeItem("flowo:tasks-action");
    return requested === "edit" || requested === "reminder" || requested === "note" ? requested : null;
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [reminderTaskId, setReminderTaskId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContext, setDraftContext] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftStatus, setDraftStatus] = useState<TaskStatus>("todo");
  const [notice, setNotice] = useState("");
  const [taskPreferences, setTaskPreferences] = useState({
    defaultStatus: "todo" as "todo" | "in_progress",
    startFocusAfterCreate: false,
    confirmCancel: true,
    confirmDelete: true,
    showCompletedToday: true,
    shortcutsEnabled: true,
  });
  const notesByTask = useTaskNotesStore((state) => state.notesByTask);
  const addTaskNote = useTaskNotesStore((state) => state.addNote);
  const updateTaskNote = useTaskNotesStore((state) => state.updateNote);
  const tasksWithNoteCounts = useMemo(() => tasks.map((task) => {
    const trackedToday = timelineEntries
      .filter((entry) => entry.date === localDateKey() && entry.type === "focus" && entry.taskId === task.id && !entry.cancelled)
      .reduce((total, entry) => total + entryMinutes(entry), 0);
    return {
      ...task,
      todayMinutes: trackedToday,
      totalMinutes: Math.max(0, task.totalMinutes - task.todayMinutes) + trackedToday,
      noteCount: (notesByTask[task.id] ?? []).length,
    };
  }), [notesByTask, tasks, timelineEntries]);
  const [noteComposer, setNoteComposer] = useState<NoteComposerState | null>(null);
  const [notesViewerTaskId, setNotesViewerTaskId] = useState<string | null>(null);
  const currentFocusTask = useTodayStore((state) => state.currentTask);
  const focusMode = useTodayStore((state) => state.mode);
  const startTodayTask = useTodayStore((state) => state.startTask);
  const toggleFocusPause = useTodayStore((state) => state.togglePause);
  const resumeTodayFocus = useTodayStore((state) => state.resumeFocus);
  const interruptTodayFocus = useTodayStore((state) => state.interrupt);
  const selectedTask = tasksWithNoteCounts.find((task) => task.id === selectedId) ?? null;
  const activeFocusMode: ActiveFocusMode | null = focusMode === "focusing" || focusMode === "paused" || focusMode === "interrupted" ? focusMode : null;
  const activeFocusId = activeFocusMode ? currentFocusTask?.id ?? null : null;

  useEffect(() => {
    void settingsService.all().then((settings) => {
      const sorts: Record<string, SortOption> = {
        "recently-worked": "Recently Worked On",
        reminder: "Reminder Time",
        name: "Name",
        time: "Time Spent",
        created: "Recently Created",
      };
      setSort(sorts[settings["tasks.defaultSort"]] ?? "Recently Worked On");
      setTaskPreferences({
        defaultStatus: settings["tasks.defaultStatus"] === "in_progress" ? "in_progress" : "todo",
        startFocusAfterCreate: settings["tasks.startFocusAfterCreate"],
        confirmCancel: settings["tasks.confirmCancel"],
        confirmDelete: settings["tasks.confirmDelete"],
        showCompletedToday: settings["tasks.showCompletedToday"],
        shortcutsEnabled: settings["shortcuts.enabled"],
      });
    });
  }, []);

  useEffect(() => {
    if (!requestedAction || !selectedTask) return;
    if (requestedAction === "reminder") {
      setReminderTaskId(selectedTask.id);
      return;
    }
    if (requestedAction === "note") {
      setNoteComposer({ mode: "create", taskId: selectedTask.id });
      return;
    }
    setEditingId(selectedTask.id);
    setDraftTitle(selectedTask.title);
    setDraftContext(selectedTask.context);
    setDraftDescription(selectedTask.description);
    setDraftStatus(selectedTask.status);
    setCreateOpen(true);
  }, [requestedAction, selectedTask?.id]);

  useEffect(() => {
    if (!requestedReveal) return;
    const task = tasksWithNoteCounts.find((item) => item.id === requestedReveal);
    if (!task) return;
    setSelectedId(null);
    setQuery(task.title);
    setFilter(task.status === "blocked" || task.status === "completed" || task.status === "cancelled" || task.status === "archived" ? task.status : "active");
  }, [requestedReveal, tasksWithNoteCounts]);

  useEffect(() => {
    const openFromReminder = (event: Event) => {
      const detail = (event as CustomEvent<{ taskId?: string; behavior?: "popup" | "tasks" }>).detail;
      if (!detail?.taskId) return;
      window.sessionStorage.removeItem("flowo:tasks-open");
      window.sessionStorage.removeItem("flowo:tasks-reveal");
      if (detail.behavior === "popup") {
        setSelectedId(detail.taskId);
        return;
      }
      const task = tasksWithNoteCounts.find((item) => item.id === detail.taskId);
      if (!task) return;
      setSelectedId(null);
      setQuery(task.title);
      setFilter(task.status === "blocked" || task.status === "completed" || task.status === "cancelled" || task.status === "archived" ? task.status : "active");
    };
    window.addEventListener("flowo:open-task", openFromReminder);
    return () => window.removeEventListener("flowo:open-task", openFromReminder);
  }, [tasksWithNoteCounts]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!taskPreferences.shortcutsEnabled) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openCreate();
        return;
      }
      if (event.key === "Escape" && selectedId) {
        if (noteComposer || notesViewerTaskId || createOpen || reminderTaskId) return;
        setSelectedId(null);
        return;
      }
      const target = event.target as HTMLElement;
      const isTyping = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if (isTyping) return;
      if (event.key === "/") {
        event.preventDefault();
        document.getElementById("task-search")?.focus();
      }
      if (event.key.toLowerCase() === "n") openCreate();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createOpen, noteComposer, notesViewerTaskId, reminderTaskId, selectedId, taskPreferences.shortcutsEnabled]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 2600);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const filteredTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const matchesFilter = (task: FlowoTask) => {
      if (filter === "active") return task.status === "in-progress" || task.status === "todo" || task.status === "blocked" || Boolean(task.completedToday);
      return task.status === filter;
    };
    const compare = (a: FlowoTask, b: FlowoTask) => {
      if (sort === "Recently Created") return b.createdOrder - a.createdOrder;
      if (sort === "Reminder Time") return (a.reminder?.sortValue ?? Number.MAX_SAFE_INTEGER) - (b.reminder?.sortValue ?? Number.MAX_SAFE_INTEGER);
      if (sort === "Name") return a.title.localeCompare(b.title);
      if (sort === "Time Spent") return b.totalMinutes - a.totalMinutes;
      return b.workedOrder - a.workedOrder;
    };
    return tasksWithNoteCounts
      .filter(matchesFilter)
      .filter((task) => reminderFilter === "all" || (reminderFilter === "has-reminder" ? Boolean(task.reminder) : Boolean(task.reminder && task.reminder.sortValue <= 1440)))
      .filter((task) => !normalizedQuery || `${task.title} ${task.context} ${task.description}`.toLowerCase().includes(normalizedQuery))
      .sort(compare);
  }, [filter, query, reminderFilter, sort, tasksWithNoteCounts]);

  const flash = (message: string) => setNotice(message);

  const startFocus = async (task: FlowoTask) => {
    if (activeFocusId === task.id) {
      try {
        if (activeFocusMode === "focusing") {
          await toggleFocusPause();
          flash(`${task.title} paused.`);
        } else {
          await resumeTodayFocus();
          flash(`${task.title} resumed.`);
        }
      } catch (error) {
        flash(error instanceof Error ? error.message : String(error));
      }
      return;
    }
    const switching = Boolean(activeFocusId);
    try {
      await startTodayTask({
        id: task.id,
        title: task.title,
        category: task.context.split(" / ")[1] ?? task.context,
        tag: task.context.split(" / ")[0],
        duration: formatMinutes(task.totalMinutes),
        color: "var(--blue)",
      });
      setSelectedId(task.id);
      flash(switching ? `Switched focus to ${task.title}.` : `Focus started on ${task.title}.`);
    } catch (error) {
      flash(error instanceof Error ? error.message : String(error));
    }
  };

  const interruptActiveFocus = async () => {
    if (activeFocusMode !== "focusing" || !currentFocusTask) return;
    try {
      await interruptTodayFocus();
      flash(`${currentFocusTask.title} interrupted.`);
    } catch (error) {
      flash(error instanceof Error ? error.message : String(error));
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setDraftTitle("");
    setDraftContext("");
    setDraftDescription("");
    setDraftStatus(taskPreferences.defaultStatus === "in_progress" ? "in-progress" : "todo");
    setCreateOpen(true);
  };

  const openEdit = (task: FlowoTask) => {
    setEditingId(task.id);
    setDraftTitle(task.title);
    setDraftContext(task.context);
    setDraftDescription(task.description);
    setDraftStatus(task.status);
    setCreateOpen(true);
  };

  const saveTask = async (shouldStart: boolean) => {
    const title = draftTitle.trim();
    if (!title) return;
    if (editingId) {
      const existingTask = tasks.find((task) => task.id === editingId);
      if (!existingTask) return;
      const savedTask: FlowoTask = {
        ...existingTask,
        title,
        context: draftContext.trim() || "Unsorted / General",
        description: draftDescription.trim() || "No description yet.",
        status: draftStatus,
      };
      await updatePersistentTask(editingId, {
        title: savedTask.title,
        context: savedTask.context,
        description: savedTask.description,
        status: databaseStatus[savedTask.status],
      });
      setCreateOpen(false);
      flash("Task updated.");
      if (shouldStart) await startFocus(savedTask);
      return;
    }
    const startAfterCreate = shouldStart || taskPreferences.startFocusAfterCreate;
    const taskId = await createPersistentTask({
      title,
      context: draftContext.trim() || "Unsorted / General",
      description: draftDescription.trim() || "No description yet.",
      status: databaseStatus[startAfterCreate ? "in-progress" : draftStatus],
    });
    const task: FlowoTask = {
      id: taskId,
      title,
      context: draftContext.trim() || "Unsorted / General",
      description: draftDescription.trim() || "No description yet.",
      status: startAfterCreate ? "in-progress" : draftStatus,
      totalMinutes: 0,
      todayMinutes: 0,
      reminderCount: 0,
      noteCount: 0,
      createdOrder: Date.now(),
      workedOrder: Date.now(),
    };
    setSelectedId(task.id);
    setFilter("active");
    setCreateOpen(false);
    flash("Task created.");
    if (startAfterCreate) await startFocus(task);
  };

  const performAction = async (task: FlowoTask, action: string) => {
    if (action === "Edit") {
      openEdit(task);
      return;
    }
    if (action === "Switch Task") return startFocus(task);
    if (action === "Delete Permanently") {
      if (taskPreferences.confirmDelete && !window.confirm(`Permanently delete “${task.title}”? This cannot be undone.`)) return;
      await deletePersistentTask(task.id);
      if (selectedId === task.id) setSelectedId(null);
      flash("Task permanently deleted.");
      return;
    }
    if (action === "Add Reminder") {
      setReminderTaskId(task.id);
      return;
    }
    const statusByAction: Record<string, TaskStatus> = {
      "Mark Complete": "completed",
      "Mark Blocked": "blocked",
      "Mark To Do": "todo",
      "Cancel Task": "cancelled",
      Archive: "archived",
      Reopen: "todo",
      Restore: "todo",
    };
    const nextStatus = statusByAction[action];
    if (!nextStatus) return;
    if (nextStatus === "cancelled" && taskPreferences.confirmCancel && !window.confirm(`Cancel “${task.title}”? Tracked history will be preserved.`)) return;
    await setPersistentTaskStatus(task.id, nextStatus);
    flash(`${task.title} marked ${statusLabels[nextStatus].toLowerCase()}.`);
  };

  const openAddNote = (taskId: string) => setNoteComposer({ mode: "create", taskId });
  const openEditNote = (taskId: string, noteId: string) => setNoteComposer({ mode: "edit", taskId, noteId });

  const saveComposedNote = async ({ taskId, body, attachments }: { taskId: string; body: string; attachments: NoteAttachment[] }) => {
    if (!noteComposer) return;
    if (noteComposer.mode === "edit" && noteComposer.noteId) {
      await updateTaskNote(noteComposer.taskId, noteComposer.noteId, { body, attachments, updatedAt: "Just now" });
      flash("Note updated.");
    } else {
      const note: TaskNote = {
        id: `note-${Date.now()}`,
        body,
        createdAt: "Just now",
        updatedAt: "Just now",
        attachments,
      };
      await addTaskNote(taskId, note);
      setSelectedId(taskId);
      if (notesViewerTaskId) setNotesViewerTaskId(taskId);
      flash("Note added.");
    }
    setNoteComposer(null);
  };

  const countFor = (status: StatusFilter) => status === "active"
    ? tasks.filter((task) => task.status === "in-progress" || task.status === "todo" || task.status === "blocked").length
    : tasks.filter((task) => task.status === status).length;

  const changeStatus = async (task: FlowoTask, status: TaskStatus) => {
    if (status === task.status) return;
    if (status === "cancelled" && taskPreferences.confirmCancel && !window.confirm(`Cancel “${task.title}”? Tracked history will be preserved.`)) return;
    await setPersistentTaskStatus(task.id, status);
    flash(`${task.title} marked ${statusLabels[status].toLowerCase()}.`);
  };

  const filterButtons: Array<{ id: StatusFilter; label: string; icon?: React.ReactNode }> = [
    { id: "active", label: "Active" },
    { id: "blocked", label: "Blocked", icon: <span className="filter-status-dot filter-status-dot--blocked" /> },
    { id: "completed", label: "Completed", icon: <Check size={14} className="filter-check" /> },
    { id: "cancelled", label: "Cancelled", icon: <X size={13} /> },
    { id: "archived", label: "Archived", icon: <Archive size={13} /> },
  ];

  const activeSections = [
    { title: "IN PROGRESS", tasks: filteredTasks.filter((task) => task.status === "in-progress" || task.status === "blocked") },
    { title: "TO DO", tasks: filteredTasks.filter((task) => task.status === "todo") },
    ...(taskPreferences.showCompletedToday ? [{ title: "COMPLETED TODAY", tasks: filteredTasks.filter((task) => task.completedToday) }] : []),
  ];
  const otherSections = [{ title: filter.toUpperCase(), tasks: filteredTasks }];
  const sections = filter === "active" ? activeSections : otherSections;
  const totalVisible = sections.reduce((total, section) => total + section.tasks.length, 0);

  return (
    <div className="app-shell tasks-shell">
      <AppSidebar selected="Tasks" onNavigate={onNavigate} />
      <main className="tasks-page">
        <header className="tasks-header">
          <div>
            <div className="tasks-header__title"><h1>Tasks</h1><Badge>{tasks.filter((task) => task.status !== "archived").length} tasks</Badge></div>
            <p>Find, organize, and start work quickly</p>
          </div>
          <Button tone="primary" onClick={openCreate}><Plus size={18} /> New Task</Button>
        </header>

        <div className="tasks-layout">
          <div className="tasks-workspace">
            <div className="task-toolbar">
              <label className="task-search">
                <Search size={17} />
                <Input id="task-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks..." />
                {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={14} /></button>}
              </label>
              <div className="task-status-filters" aria-label="Task status filters">
                {filterButtons.map((item) => (
                  <button key={item.id} className={filter === item.id ? "is-selected" : ""} type="button" onClick={() => setFilter(item.id)}>
                    {item.label} {item.icon}<span className="filter-count">{countFor(item.id)}</span>
                  </button>
                ))}
              </div>
              <Popover
                label="Reminder filter"
                trigger={
                  <Button className={reminderFilter !== "all" ? "is-filtered" : ""} size="sm">
                    <Bell size={16} /> {reminderFilter === "all" ? "Due Soon / Has Reminder" : reminderFilter === "due-soon" ? "Due Soon" : "Has Reminder"} <ChevronDown size={14} />
                  </Button>
                }
              >
                <button className="cdk-menu-item" aria-checked={reminderFilter === "all"} onClick={() => setReminderFilter("all")}>All reminders</button>
                <button className="cdk-menu-item" aria-checked={reminderFilter === "due-soon"} onClick={() => setReminderFilter("due-soon")}>Due soon</button>
                <button className="cdk-menu-item" aria-checked={reminderFilter === "has-reminder"} onClick={() => setReminderFilter("has-reminder")}>Has reminder</button>
              </Popover>
              <span className="task-sort-label">Sort By</span>
              <div className="task-sort-control">
                <Popover
                  label="Sort tasks"
                  trigger={<Button className="task-sort-trigger" size="sm">{sort}<ChevronDown size={14} /></Button>}
                >
                  {(["Recently Worked On", "Recently Created", "Reminder Time", "Name", "Time Spent"] as SortOption[]).map((option) => (
                    <button
                      key={option}
                      className="cdk-menu-item task-sort-option"
                      role="menuitemradio"
                      aria-checked={sort === option}
                      onClick={() => setSort(option)}
                    >
                      <Check size={13} /> {option}
                    </button>
                  ))}
                </Popover>
              </div>
            </div>

            <div className="task-list" aria-live="polite">
              {totalVisible ? sections.map((section) => (
                <TaskSection
                  key={section.title}
                  title={section.title}
                  tasks={section.tasks}
                  selectedId={selectedId}
                  activeFocusId={activeFocusId}
                  focusMode={activeFocusMode}
                  onSelect={(task) => setSelectedId(task.id)}
                  onStart={startFocus}
                  onViewNotes={(task) => setNotesViewerTaskId(task.id)}
                  onAction={performAction}
                />
              )) : (
                <div className="tasks-empty">
                  <Circle size={32} />
                  <h2>{query ? "No matching tasks" : `No ${filter} tasks`}</h2>
                  <p>{query ? "Try a different search or filter." : "Tasks in this state will appear here."}</p>
                  {filter === "active" && <Button tone="primary" onClick={openCreate}><Plus size={16} /> Create Task</Button>}
                </div>
              )}
            </div>
          </div>

        </div>
      </main>
      <MobileNavigation selected="Tasks" onNavigate={onNavigate} />

      <TaskDetailsPopup
        task={selectedTask}
        notes={selectedTask ? notesByTask[selectedTask.id] ?? [] : []}
        entries={timelineEntries}
        focusMode={selectedTask && activeFocusId === selectedTask.id ? activeFocusMode : null}
        onClose={() => setSelectedId(null)}
        onStart={() => selectedTask && startFocus(selectedTask)}
        onInterrupt={() => void interruptActiveFocus()}
        onAction={(action) => selectedTask && performAction(selectedTask, action)}
        onAddNote={() => selectedTask && openAddNote(selectedTask.id)}
        onViewNotes={() => selectedTask && setNotesViewerTaskId(selectedTask.id)}
        onViewHistory={() => {
          if (!selectedTask) return;
          window.sessionStorage.setItem("flowo:timeline-jump", JSON.stringify({ filter: "focus", taskFilter: selectedTask.id }));
          setSelectedId(null);
          onNavigate?.("Timeline");
        }}
        onStatusChange={(status) => { if (selectedTask) void changeStatus(selectedTask, status); }}
      />

      <RemindersDialog
        open={Boolean(reminderTaskId)}
        initialTaskId={reminderTaskId ?? undefined}
        tasks={tasks.filter((task) => task.status === "in-progress" || task.status === "todo" || task.status === "blocked").map((task) => ({ id: task.id, title: task.title }))}
        onClose={() => setReminderTaskId(null)}
        onChanged={() => useTaskStore.getState().load()}
      />

      {notesViewerTaskId && !noteComposer && (() => {
        const viewerTask = tasks.find((task) => task.id === notesViewerTaskId);
        if (!viewerTask) return null;
        const viewerColor = viewerTask.status === "completed" ? "#24cc77" : viewerTask.status === "blocked" ? "#ff970d" : viewerTask.status === "todo" ? "#7f91a8" : "var(--blue)";
        return (
          <NotesViewerModal
            task={{ id: viewerTask.id, title: viewerTask.title, context: viewerTask.context, color: viewerColor }}
            notes={notesByTask[viewerTask.id] ?? []}
            onClose={() => setNotesViewerTaskId(null)}
            onAddNote={() => openAddNote(viewerTask.id)}
            onEditNote={(noteId) => openEditNote(viewerTask.id, noteId)}
          />
        );
      })()}

      <Modal open={createOpen} title={editingId ? "Edit task" : "Create a task"} onClose={() => setCreateOpen(false)}>
        <form className="task-create-form" onSubmit={(event: FormEvent) => { event.preventDefault(); saveTask(false); }}>
          <label>
            <span>Task name</span>
            <Input autoFocus value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="What needs to be done?" />
          </label>
          <label>
            <span>Context <small>optional</small></span>
            <Input value={draftContext} onChange={(event) => setDraftContext(event.target.value)} placeholder="e.g. Backend / Auth service" />
          </label>
          <label>
            <span>Description <small>optional</small></span>
            <textarea value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} placeholder="Add just enough detail to get started" />
          </label>
          <label>
            <span>Initial status</span>
            <select value={draftStatus} onChange={(event) => setDraftStatus(event.target.value as TaskStatus)}>
              <option value="todo">To Do</option>
              <option value="in-progress">In Progress</option>
              <option value="blocked">Blocked</option>
            </select>
          </label>
          <div className="modal-actions task-create-form__actions">
            <Button type="button" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit">{editingId ? "Save Task" : "Create"}</Button>
            <Button type="button" tone="primary" disabled={!draftTitle.trim()} onClick={() => saveTask(true)}><Play size={14} fill="currentColor" /> {editingId ? "Save & Start" : "Create & Start Focus"}</Button>
          </div>
        </form>
      </Modal>

      {noteComposer && (
        <NoteComposerModal
          key={`${noteComposer.mode}-${noteComposer.taskId}-${noteComposer.noteId ?? "new"}`}
          mode={noteComposer.mode}
          initialTaskId={noteComposer.taskId}
          tasks={tasks.filter((task) => task.status !== "archived").map<NoteComposerTask>((task) => ({ id: task.id, title: task.title, context: task.context, color: task.status === "completed" ? "#24cc77" : task.status === "blocked" ? "#ff970d" : task.status === "todo" ? "#7f91a8" : "var(--blue)" }))}
          note={noteComposer.noteId ? notesByTask[noteComposer.taskId]?.find((note) => note.id === noteComposer.noteId) : undefined}
          onClose={() => setNoteComposer(null)}
          onSave={saveComposedNote}
        />
      )}

      {notice && <div className="task-toast" role="status"><CheckCircle2 size={16} /> {notice}</div>}
    </div>
  );
}
