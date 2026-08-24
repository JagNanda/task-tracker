import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock3,
  Coffee,
  EllipsisVertical,
  FileText,
  Layers3,
  MessageSquareText,
  Pencil,
  Play,
  Plus,
  Search,
  Tag,
  TimerReset,
  Trash2,
  UserRoundPlus,
  X,
  Zap,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Badge, Button, IconButton, Modal } from "../../cdk";
import { interruptionService } from "../../data/services/interruptionService";
import { settingsService } from "../../data/services/settingsService";
import { AppSidebar, MobileNavigation } from "../today/AppSidebar";
import { useTodayStore } from "../today/store";
import {
  activitySummary,
  entryMinutes,
  formatClock,
  formatDuration,
  localDateKey,
  setTimelineTasks,
  timelineTasks,
  type ActivityType,
  type TimelineActivity,
  useTimelineStore,
} from "./timelineStore";
import { useTaskStore } from "../tasks/taskStore";

type Filter = "all" | ActivityType;
const breakReasons = ["Break", "Lunch", "Coffee", "Stretch", "Walk", "Other"];

function toTimeInput(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function fromTimeInput(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function offsetDate(dateKey: string, amount: number) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return localDateKey(date);
}

function displayDate(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00`);
  const label = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (dateKey === localDateKey()) return `Today, ${label}`;
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function eventLabel(entry: TimelineActivity) {
  if (entry.type === "focus") return entry.taskName || "Unassigned";
  return entry.reason || (entry.type === "break" ? "Break" : "Other");
}

function formatRunningDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}` : `${minutes}:${String(rest).padStart(2, "0")}`;
}

function ActivityIcon({ type, size = 15 }: { type: ActivityType; size?: number }) {
  if (type === "interruption") return <Zap size={size} fill="currentColor" />;
  if (type === "break") return <Coffee size={size} />;
  return <CircleDot size={size} />;
}

function SummaryRow({ entries }: { entries: TimelineActivity[] }) {
  const totals = activitySummary(entries);
  const metrics = [
    { label: "Focus", value: formatDuration(totals.focus), type: "focus" as const, icon: <CircleDot size={15} /> },
    { label: "Interruptions", value: formatDuration(totals.interruptions), type: "interruption" as const, icon: <Zap size={15} fill="currentColor" /> },
    { label: "Breaks", value: formatDuration(totals.breaks), type: "break" as const, icon: <Coffee size={15} /> },
    { label: "Sessions", value: String(totals.sessions), type: "sessions" as const, icon: <Layers3 size={15} /> },
    { label: "Unassigned", value: formatDuration(totals.unassigned), type: "unassigned" as const, icon: <AlertCircle size={15} /> },
    { label: "Tracked", value: formatDuration(totals.tracked), type: "tracked" as const, icon: <Clock3 size={15} /> },
  ];
  return (
    <section className="timeline-summary" aria-label="Daily totals">
      {metrics.map((metric) => (
        <div key={metric.label} className={`timeline-summary__metric timeline-summary__metric--${metric.type}`}>
          <span>{metric.icon}{metric.label}</span>
          <strong>{metric.value}</strong>
        </div>
      ))}
    </section>
  );
}

function ActivityRow({
  entry,
  active = false,
  activeSeconds,
  selected,
  onSelect,
  onOpenTask,
}: {
  entry: TimelineActivity;
  active?: boolean;
  activeSeconds?: number;
  selected: boolean;
  onSelect: () => void;
  onOpenTask: () => void;
}) {
  const duration = entryMinutes(entry);
  return (
    <div
      className={`activity-row activity-row--${entry.type} ${selected ? "is-selected" : ""} ${entry.cancelled ? "is-cancelled" : ""} ${active ? "is-active" : ""}`}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && onSelect()}
      aria-label={`Edit ${eventLabel(entry)} from ${formatClock(entry.startMinutes)}`}
    >
      <div className="activity-row__marker"><ActivityIcon type={entry.type} /></div>
      <time>{formatClock(entry.startMinutes)} <span>–</span> {active ? "Now" : formatClock(entry.endMinutes)}</time>
      <div className="activity-row__content">
        <span className="activity-row__eyebrow">
          {entry.type === "interruption" ? "Interruption" : entry.type === "break" ? "Break" : "Focus"}
          {entry.cancelled && <Badge>Discarded</Badge>}
          {active && <Badge className="activity-row__active-badge"><span /> Active now</Badge>}
        </span>
        {entry.type === "focus" && entry.taskId ? (
          <button className="activity-row__title activity-row__title--link" type="button" onClick={(event) => { event.stopPropagation(); onOpenTask(); }}>
            {eventLabel(entry)}
          </button>
        ) : <strong className="activity-row__title">{eventLabel(entry)}</strong>}
        {entry.context && <Badge className="activity-row__context"><Tag size={10} /> {entry.context}</Badge>}
        {entry.note && <p>{entry.note}</p>}
      </div>
      <strong className="activity-row__duration">{active && activeSeconds !== undefined ? formatRunningDuration(activeSeconds) : formatDuration(duration)}</strong>
      {entry.type === "focus" && !entry.taskId && !active && (
        <button className="activity-row__assign" type="button" onClick={(event) => { event.stopPropagation(); onSelect(); }}><UserRoundPlus size={14} /> Assign Task</button>
      )}
      <button className="activity-row__more" type="button" aria-label={`Edit ${eventLabel(entry)}`} onClick={(event) => { event.stopPropagation(); onSelect(); }}><EllipsisVertical size={18} /></button>
    </div>
  );
}

type TimelineGroup = { id: string; entries: TimelineActivity[]; grouped: boolean };

function groupEntries(entries: TimelineActivity[]) {
  const groups: TimelineGroup[] = [];
  for (const entry of entries) {
    const groupId = entry.sessionId ?? entry.id;
    const existing = groups.find((group) => group.id === groupId);
    if (existing) existing.entries.push(entry);
    else groups.push({ id: groupId, entries: [entry], grouped: Boolean(entry.sessionId) });
  }
  return groups.sort((a, b) => a.entries[0].startMinutes - b.entries[0].startMinutes);
}

function SessionGroup({
  group,
  expanded,
  selectedId,
  onToggle,
  onSelect,
  onOpenTask,
}: {
  group: TimelineGroup;
  expanded: boolean;
  selectedId: string | null;
  onToggle: () => void;
  onSelect: (entry: TimelineActivity) => void;
  onOpenTask: (entry: TimelineActivity) => void;
}) {
  if (!group.grouped || group.entries.length === 1) {
    const entry = group.entries[0];
    return <ActivityRow entry={entry} selected={selectedId === entry.id} onSelect={() => onSelect(entry)} onOpenTask={() => onOpenTask(entry)} />;
  }
  const start = group.entries[0].startMinutes;
  const end = group.entries[group.entries.length - 1].endMinutes;
  const focusMinutes = group.entries.filter((entry) => entry.type === "focus").reduce((total, entry) => total + entryMinutes(entry), 0);
  return (
    <section className="session-group">
      <button className="session-group__header" type="button" onClick={onToggle} aria-expanded={expanded}>
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <Layers3 size={15} />
        <span>Focus session · {group.entries.length} segments</span>
        <time>{formatClock(start)} – {formatClock(end)}</time>
        <strong>{formatDuration(focusMinutes)} focus</strong>
      </button>
      {expanded && <div className="session-group__entries">
        {group.entries.map((entry) => <ActivityRow key={entry.id} entry={entry} selected={selectedId === entry.id} onSelect={() => onSelect(entry)} onOpenTask={() => onOpenTask(entry)} />)}
      </div>}
    </section>
  );
}

function EntryEditor({
  entry,
  isNew,
  onClose,
  onSave,
  onDelete,
  interruptionReasons,
}: {
  entry: TimelineActivity;
  isNew: boolean;
  onClose: () => void;
  onSave: (entry: TimelineActivity) => void;
  onDelete: () => void;
  interruptionReasons: string[];
}) {
  const [draft, setDraft] = useState(entry);
  const [error, setError] = useState("");
  useEffect(() => { setDraft(entry); setError(""); }, [entry]);

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (draft.endMinutes <= draft.startMinutes) {
      setError("End time must be after start time.");
      return;
    }
    const task = timelineTasks.find((item) => item.id === draft.taskId);
    onSave({
      ...draft,
      taskName: draft.type === "focus" ? task?.title ?? "Unassigned" : undefined,
      context: draft.type === "focus" ? task?.context : undefined,
      taskId: draft.type === "focus" ? draft.taskId || undefined : undefined,
      reason: draft.type === "focus" ? undefined : draft.reason,
    });
  };

  return (
    <aside className="entry-editor" aria-label={isNew ? "Add entry" : "Entry details"}>
      <header><div><span>{isNew ? "Manual entry" : "Entry details"}</span><small>{isNew ? "Add missing tracked time" : "Correct this activity"}</small></div><IconButton label="Close editor" onClick={onClose}><X size={18} /></IconButton></header>
      <form onSubmit={save}>
        <label><span>Type</span><select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as ActivityType })}>
          <option value="focus">Focus</option><option value="interruption">Interruption</option><option value="break">Break</option>
        </select></label>
        {draft.type === "focus" ? <label><span>Task</span><select value={draft.taskId ?? ""} onChange={(event) => setDraft({ ...draft, taskId: event.target.value || undefined })}>
          <option value="">Unassigned</option>{timelineTasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
        </select></label> : <label><span>{draft.type === "break" ? "Break type" : "Reason"}</span><select value={draft.reason ?? ""} onChange={(event) => setDraft({ ...draft, reason: event.target.value })}>
          <option value="">Choose a reason</option>{(draft.type === "break" ? breakReasons : interruptionReasons).map((reason) => <option key={reason}>{reason}</option>)}
        </select></label>}
        <div className="entry-editor__time-grid">
          <label><span>Start</span><input type="time" value={toTimeInput(draft.startMinutes)} onChange={(event) => setDraft({ ...draft, startMinutes: fromTimeInput(event.target.value) })} /></label>
          <label><span>End</span><input type="time" value={toTimeInput(draft.endMinutes)} onChange={(event) => setDraft({ ...draft, endMinutes: fromTimeInput(event.target.value) })} /></label>
        </div>
        <div className="entry-editor__duration"><Clock3 size={15} /><span>Duration</span><strong>{formatDuration(entryMinutes(draft))}</strong></div>
        <label><span>Session note <small>optional</small></span><textarea rows={5} value={draft.note ?? ""} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder={draft.type === "focus" ? "What did you accomplish?" : "Add context for this activity"} /></label>
        <label><span>Entry status</span><select value={draft.cancelled ? "cancelled" : "tracked"} onChange={(event) => setDraft({ ...draft, cancelled: event.target.value === "cancelled" })}><option value="tracked">Tracked</option><option value="cancelled">Discarded / cancelled</option></select></label>
        {error && <p className="entry-editor__error"><AlertCircle size={14} />{error}</p>}
        <Button className="entry-editor__save" tone="primary" type="submit"><Check size={16} /> {isNew ? "Add Entry" : "Save Changes"}</Button>
        {!isNew && <Button className="entry-editor__delete" type="button" onClick={onDelete}><Trash2 size={15} /> Delete Entry</Button>}
      </form>
    </aside>
  );
}

function TaskPreview({ taskId, entries, onClose }: { taskId: string | null; entries: TimelineActivity[]; onClose: () => void }) {
  const task = timelineTasks.find((item) => item.id === taskId);
  useEffect(() => {
    if (!task) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [task, onClose]);
  if (!task) return null;
  const taskEntries = entries.filter((entry) => entry.taskId === task.id && !entry.cancelled);
  const total = taskEntries.reduce((sum, entry) => sum + entryMinutes(entry), 0);
  const latest = [...taskEntries].sort((a, b) => b.startMinutes - a.startMinutes)[0];
  const tags = task.context.split(" / ");
  return createPortal(
    <div className="task-details-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="task-details-popup timeline-task-preview" role="dialog" aria-modal="true" aria-labelledby="timeline-task-title">
        <header className="task-details-popup__header"><div className="task-details-popup__heading"><span className="task-details-popup__dot" /><h2 id="timeline-task-title">{task.title}</h2><IconButton label="Edit task"><Pencil size={17} /></IconButton></div><IconButton className="task-details-popup__close" label="Close task details" onClick={onClose}><X size={20} /></IconButton></header>
        <div className="task-details-popup__tags"><button className="task-details-popup__status" type="button"><span /> In Progress <ChevronDown size={13} /></button>{tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}</div>
        <section className="task-details-metrics" aria-label="Task metrics">
          <div><span className="metric-icon metric-icon--blue"><Clock3 size={16} /></span><p>Total Focus Time<strong>{formatDuration(total)}</strong><small>From tracked timeline</small></p></div>
          <div><span className="metric-icon metric-icon--green"><TimerReset size={16} /></span><p>Sessions<strong>{new Set(taskEntries.map((entry) => entry.sessionId ?? entry.id)).size}</strong><small>Focus sessions</small></p></div>
          <div><span className="metric-icon metric-icon--purple"><Play size={16} /></span><p>Last Session<strong>{latest ? formatDuration(entryMinutes(latest)) : "—"}</strong><small>{latest ? `${formatClock(latest.startMinutes)} today` : "No sessions yet"}</small></p></div>
          <div><span className="metric-icon"><CalendarDays size={16} /></span><p>Last Worked On<strong>{latest ? "Today" : "—"}</strong><small>{latest ? formatClock(latest.startMinutes) : "No history"}</small></p></div>
        </section>
        <div className="task-details-popup__actions"><Button tone="primary"><Play size={14} fill="currentColor" /> Start Focus</Button><Button><Bell size={14} /> Add Reminder</Button><Button><MessageSquareText size={14} /> Add Note</Button><Button><Check size={14} /> Mark Complete</Button></div>
        <div className="task-details-grid">
          <section className="task-details-card task-details-description"><header><h3>Description / Context</h3><button type="button"><Pencil size={15} /></button></header><p>{task.description}</p><strong>Context</strong><ul><li>{task.context}</li><li>Tracked activity stays private in Timeline</li></ul></section>
          <section className="task-details-card"><header><h3>Work History</h3><button type="button">View full history</button></header><div className="task-history-list">{taskEntries.slice().reverse().map((entry) => <article key={entry.id}><span /><div><strong>Today, {formatClock(entry.startMinutes)} – {formatClock(entry.endMinutes)}</strong><small>Focus session</small></div><b>{formatDuration(entryMinutes(entry))}</b><small><MessageSquareText size={12} /> {entry.note ? 1 : 0}</small></article>)}</div></section>
        </div>
      </section>
    </div>,
    document.getElementById("modal-root")!,
  );
}

function Reconciliation({ entries, onUnassigned }: { entries: TimelineActivity[]; onUnassigned: () => void }) {
  const totals = activitySummary(entries);
  return <footer className="timeline-reconciliation"><strong>Reconciliation</strong><span><CircleDot size={14} /> Focus <b>{formatDuration(totals.focus)}</b></span><i>•</i><span><Zap size={14} /> Interruptions <b>{formatDuration(totals.interruptions)}</b></span><i>•</i><span><Coffee size={14} /> Breaks <b>{formatDuration(totals.breaks)}</b></span><button type="button" onClick={onUnassigned}><AlertCircle size={14} /> Unassigned {formatDuration(totals.unassigned)} <ChevronRight size={15} /></button></footer>;
}

export function TimelinePage({ onNavigate }: { onNavigate?: (label: string) => void }) {
  const timelineJump = useMemo(() => {
    const raw = window.sessionStorage.getItem("flowo:timeline-jump");
    if (!raw) return null;
    window.sessionStorage.removeItem("flowo:timeline-jump");
    try { return JSON.parse(raw) as { date?: string; filter?: Filter; taskFilter?: string; query?: string }; }
    catch { return null; }
  }, []);
  const entries = useTimelineStore((state) => state.entries);
  const tasks = useTaskStore((state) => state.tasks);
  setTimelineTasks(tasks.map((task) => ({ id: task.id, title: task.title, context: task.context, description: task.description })));
  const addEntry = useTimelineStore((state) => state.addEntry);
  const updateEntry = useTimelineStore((state) => state.updateEntry);
  const deleteEntry = useTimelineStore((state) => state.deleteEntry);
  const mode = useTodayStore((state) => state.mode);
  const currentTask = useTodayStore((state) => state.currentTask);
  const totalSeconds = useTodayStore((state) => state.totalSeconds);
  const remainingSeconds = useTodayStore((state) => state.remainingSeconds);
  const interruptionSeconds = useTodayStore((state) => state.interruptionSeconds);
  const interruptionReason = useTodayStore((state) => state.interruptionReason);
  const [date, setDate] = useState(() => timelineJump?.date ?? localDateKey());
  const [filter, setFilter] = useState<Filter>(() => timelineJump?.filter ?? "all");
  const [taskFilter, setTaskFilter] = useState(() => timelineJump?.taskFilter ?? "all");
  const [query, setQuery] = useState(() => timelineJump?.query ?? "");
  const [selected, setSelected] = useState<TimelineActivity | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TimelineActivity | null>(null);
  const [taskPreviewId, setTaskPreviewId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["morning-auth"]));
  const dateInput = useRef<HTMLInputElement>(null);
  const [now, setNow] = useState(Date.now());
  const [interruptionReasons, setInterruptionReasons] = useState<string[]>([]);
  const [timelinePreferences, setTimelinePreferences] = useState({ showNotesInline: true, collapseLongNotes: true, confirmDelete: true });

  useEffect(() => {
    void Promise.all([interruptionService.listPresets(), settingsService.all()]).then(([presets, settings]) => {
      setInterruptionReasons(presets.map((preset) => preset.name));
      const preferredFilter = settings["timeline.defaultFilter"];
      if (!timelineJump?.filter) setFilter(preferredFilter === "focus" || preferredFilter === "interruption" || preferredFilter === "break" ? preferredFilter : "all");
      setTimelinePreferences({
        showNotesInline: settings["timeline.showNotesInline"],
        collapseLongNotes: settings["timeline.collapseLongNotes"],
        confirmDelete: settings["timeline.confirmDelete"],
      });
    });
  }, [timelineJump]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setSelected(null);
    setIsNew(false);
  }, [date]);

  const dayEntries = useMemo(() => entries.filter((entry) => entry.date === date && entry.endedAt !== undefined).sort((a, b) => a.startMinutes - b.startMinutes), [date, entries]);
  const liveEntry = useMemo<TimelineActivity | null>(() => {
    if (date !== localDateKey() || (mode !== "focusing" && mode !== "interrupted") || !currentTask) return null;
    const elapsedSeconds = mode === "interrupted" ? interruptionSeconds : Math.max(0, totalSeconds - remainingSeconds);
    const nowDate = new Date(now);
    const endMinutes = nowDate.getHours() * 60 + nowDate.getMinutes();
    const startMinutes = Math.max(0, endMinutes - Math.max(1, Math.ceil(elapsedSeconds / 60)));
    return { id: "live-activity", date, startMinutes, endMinutes, type: mode === "interrupted" ? "interruption" : "focus", taskId: currentTask.id, taskName: currentTask.title, context: currentTask.tag, reason: interruptionReason || "Interruption", sessionId: "live-session" };
  }, [currentTask, date, interruptionReason, interruptionSeconds, mode, now, remainingSeconds, totalSeconds]);

  const filtered = useMemo(() => dayEntries.filter((entry) => {
    if (filter !== "all" && entry.type !== filter) return false;
    if (taskFilter === "unassigned" && (entry.type !== "focus" || entry.taskId)) return false;
    if (taskFilter !== "all" && taskFilter !== "unassigned" && entry.taskId !== taskFilter) return false;
    const needle = query.trim().toLowerCase();
    return !needle || `${eventLabel(entry)} ${entry.note ?? ""} ${entry.context ?? ""}`.toLowerCase().includes(needle);
  }), [dayEntries, filter, query, taskFilter]);
  const groups = useMemo(() => groupEntries(filtered), [filtered]);
  const liveSeconds = mode === "interrupted" ? interruptionSeconds : Math.max(0, totalSeconds - remainingSeconds);
  const liveInsertIndex = liveEntry ? groups.findIndex((group) => group.entries[0].startMinutes > liveEntry.startMinutes) : -1;

  const openNew = () => {
    const latestEnd = dayEntries.reduce((latest, entry) => Math.max(latest, entry.endMinutes), 9 * 60);
    const startMinutes = Math.min(latestEnd, 23 * 60 + 29);
    setSelected({ id: `entry-${Date.now()}`, date, startMinutes, endMinutes: startMinutes + 30, type: "focus", taskName: "Unassigned" });
    setIsNew(true);
  };

  const saveEntry = (entry: TimelineActivity) => {
    if (isNew) addEntry(entry); else updateEntry(entry.id, entry);
    setSelected(entry);
    setIsNew(false);
  };

  const openUnassigned = () => {
    const item = dayEntries.find((entry) => entry.type === "focus" && !entry.taskId && !entry.cancelled);
    if (item) { setSelected(item); setIsNew(false); }
  };

  const requestDelete = (entry: TimelineActivity) => {
    if (timelinePreferences.confirmDelete) {
      setDeleteTarget(entry);
      return;
    }
    void deleteEntry(entry.id);
    setSelected(null);
  };

  return (
    <div className="app-shell timeline-shell">
      <AppSidebar selected="Timeline" onNavigate={onNavigate} />
      <main className={`timeline-page ${!timelinePreferences.showNotesInline ? "timeline-page--hide-notes" : ""} ${timelinePreferences.collapseLongNotes ? "timeline-page--collapse-notes" : ""}`}>
        <header className="timeline-page__header"><div><h1>Timeline</h1><p>Review and correct your tracked work history</p></div><Button tone="primary" onClick={openNew}><Plus size={17} /> Add Entry</Button></header>
        <div className="date-navigator">
          <Button onClick={() => setDate(offsetDate(date, -1))}><ArrowLeft size={16} /> <span>Previous</span></Button>
          <button className="date-navigator__today" type="button" onClick={() => setDate(localDateKey())}><CalendarDays size={17} /><strong>{displayDate(date)}</strong>{date !== localDateKey() && <small>Back to today</small>}</button>
          <Button onClick={() => setDate(offsetDate(date, 1))}><span>Next</span><ArrowRight size={16} /></Button>
          <button className="date-navigator__picker" type="button" aria-label="Choose a date" onClick={() => dateInput.current?.showPicker()}><CalendarDays size={18} /></button>
          <input ref={dateInput} className="date-navigator__input" type="date" value={date} onChange={(event) => event.target.value && setDate(event.target.value)} tabIndex={-1} />
        </div>
        <SummaryRow entries={dayEntries} />
        <div className="timeline-filters">
          <div className="timeline-filters__types" aria-label="Activity filters">
            {([{ id: "all", label: "All", icon: null }, { id: "focus", label: "Focus", icon: <CircleDot size={14} /> }, { id: "interruption", label: "Interruptions", icon: <Zap size={14} fill="currentColor" /> }, { id: "break", label: "Breaks", icon: <Coffee size={14} /> }] as Array<{ id: Filter; label: string; icon: React.ReactNode }>).map((item) => <button key={item.id} className={filter === item.id ? "is-selected" : ""} type="button" onClick={() => setFilter(item.id)}>{item.icon}{item.label}</button>)}
          </div>
          <label className="timeline-task-filter"><span className="sr-only">Filter by task</span><select value={taskFilter} onChange={(event) => setTaskFilter(event.target.value)}><option value="all">Task: All</option><option value="unassigned">Unassigned</option>{timelineTasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select><ChevronDown size={14} /></label>
          <label className="timeline-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search entries" />{query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")}><X size={13} /></button>}</label>
        </div>
        <div className={`timeline-workspace ${selected ? "has-editor" : ""}`}>
          <section className="activity-list" aria-label="Chronological activity">
            {groups.length ? groups.map((group, index) => <div key={group.id} className="timeline-group-slot">
              {liveEntry && liveInsertIndex === index && <div className="live-activity"><ActivityRow entry={liveEntry} active activeSeconds={liveSeconds} selected={false} onSelect={() => onNavigate?.("Today")} onOpenTask={() => setTaskPreviewId(liveEntry.taskId ?? null)} /></div>}
              <SessionGroup group={group} expanded={expanded.has(group.id)} selectedId={selected?.id ?? null} onToggle={() => setExpanded((current) => { const next = new Set(current); next.has(group.id) ? next.delete(group.id) : next.add(group.id); return next; })} onSelect={(entry) => { setSelected(entry); setIsNew(false); }} onOpenTask={(entry) => setTaskPreviewId(entry.taskId ?? null)} />
            </div>) : !liveEntry && <div className="timeline-empty-state"><FileText size={35} /><h2>No activity for this date</h2><p>{query || filter !== "all" || taskFilter !== "all" ? "Try clearing your filters or search." : "Add a manual entry if you forgot to run the timer."}</p><Button onClick={openNew}><Plus size={15} /> Add Entry</Button></div>}
            {liveEntry && (liveInsertIndex === -1 || !groups.length) && <div className="live-activity"><ActivityRow entry={liveEntry} active activeSeconds={liveSeconds} selected={false} onSelect={() => onNavigate?.("Today")} onOpenTask={() => setTaskPreviewId(liveEntry.taskId ?? null)} /></div>}
          </section>
          {selected && <EntryEditor key={`${selected.id}-${isNew}`} entry={selected} isNew={isNew} interruptionReasons={interruptionReasons} onClose={() => { setSelected(null); setIsNew(false); }} onSave={saveEntry} onDelete={() => requestDelete(selected)} />}
        </div>
        <Reconciliation entries={dayEntries} onUnassigned={openUnassigned} />
      </main>
      <MobileNavigation selected="Timeline" onNavigate={onNavigate} />
      <Modal open={Boolean(deleteTarget)} title="Delete timeline entry?" onClose={() => setDeleteTarget(null)}><p className="modal-description">This removes the entry from Timeline and recalculates its time everywhere. This action cannot be undone.</p><div className="modal-actions"><Button onClick={() => setDeleteTarget(null)}>Cancel</Button><Button className="timeline-delete-confirm" onClick={() => { if (deleteTarget) deleteEntry(deleteTarget.id); setDeleteTarget(null); setSelected(null); }}><Trash2 size={15} /> Delete Entry</Button></div></Modal>
      <TaskPreview taskId={taskPreviewId} entries={entries} onClose={() => setTaskPreviewId(null)} />
    </div>
  );
}
