import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Coffee,
  Info,
  ListChecks,
  TimerReset,
  TriangleAlert,
  Zap,
} from "lucide-react";
import { type CSSProperties, type ReactNode, useMemo, useRef, useState } from "react";
import { AppSidebar, MobileNavigation } from "../today/AppSidebar";
import { useTodayStore } from "../today/store";
import { type FlowoTask, TaskDetailsPopup, type TaskStatus } from "../tasks/TasksPage";
import { useTaskNotesStore } from "../tasks/notesStore";
import { useTaskStore } from "../tasks/taskStore";
import { RemindersDialog } from "../reminders/RemindersDialog";
import {
  activitySummary,
  entryMinutes,
  formatDuration,
  localDateKey,
  type TimelineActivity,
  useTimelineStore,
} from "../timeline/timelineStore";

type Period = "day" | "week" | "month";

type DateRange = {
  start: Date;
  end: Date;
  days: Date[];
};

type ChartBucket = {
  key: string;
  date: string;
  label: string;
  sublabel?: string;
  minutes: number;
};

const taskColors = ["#2388ff", "#3875e8", "#5a86ef", "#8b67ee", "#45a6d8", "#35bba0", "#71869f"];
const interruptionColors: Record<string, string> = {
  Meeting: "#f39b24",
  Coworker: "#ffbd44",
  "Production Issue": "#ef5350",
  Washroom: "#45c6a7",
  "Family Issue": "#9667e8",
  Other: "#718399",
};

function atMidnight(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(value: Date, amount: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + amount);
  return next;
}

function rangeFor(anchorKey: string, period: Period): DateRange {
  const anchor = atMidnight(parseDateKey(anchorKey));
  let start = anchor;
  let end = anchor;
  if (period === "week") {
    const mondayOffset = (anchor.getDay() + 6) % 7;
    start = addDays(anchor, -mondayOffset);
    end = addDays(start, 6);
  } else if (period === "month") {
    start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  }
  const days: Date[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
  return { start, end, days };
}

function moveAnchor(anchorKey: string, period: Period, direction: number) {
  const anchor = parseDateKey(anchorKey);
  if (period === "day") return localDateKey(addDays(anchor, direction));
  if (period === "week") return localDateKey(addDays(anchor, direction * 7));
  const day = anchor.getDate();
  const target = new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1);
  target.setDate(Math.min(day, new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()));
  return localDateKey(target);
}

function previousRange(anchorKey: string, period: Period) {
  return rangeFor(moveAnchor(anchorKey, period, -1), period);
}

function entriesInRange(entries: TimelineActivity[], range: DateRange) {
  const start = localDateKey(range.start);
  const end = localDateKey(range.end);
  return entries.filter((entry) => !entry.cancelled && entry.date >= start && entry.date <= end);
}

function formatRange(range: DateRange, period: Period) {
  if (period === "day") return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(range.start);
  if (period === "month") return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(range.start);
  const start = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(range.start);
  const end = new Intl.DateTimeFormat(undefined, {
    month: range.start.getMonth() === range.end.getMonth() ? undefined : "short",
    day: "numeric",
    year: "numeric",
  }).format(range.end);
  return `${start} – ${end}`;
}

function comparisonName(period: Period) {
  return period === "day" ? "previous day" : period === "week" ? "previous week" : "previous month";
}

function signedDuration(value: number) {
  if (!value) return "No change";
  return `${value > 0 ? "+" : "−"}${formatDuration(Math.abs(value))}`;
}

function signedCount(value: number) {
  if (!value) return "No change";
  return `${value > 0 ? "+" : "−"}${Math.abs(value)}`;
}

function focusBuckets(entries: TimelineActivity[], range: DateRange, period: Period): ChartBucket[] {
  const focused = entries.filter((entry) => entry.type === "focus");
  if (period === "day") {
    const date = localDateKey(range.start);
    return Array.from({ length: 24 }, (_, hour) => ({
      key: `${date}-${hour}`,
      date,
      label: hour === 0 ? "12a" : hour < 12 ? `${hour}a` : hour === 12 ? "12p" : `${hour - 12}p`,
      minutes: focused.filter((entry) => entry.date === date).reduce((total, entry) => total + Math.max(0, Math.min(entry.endMinutes, (hour + 1) * 60) - Math.max(entry.startMinutes, hour * 60)), 0),
    }));
  }
  return range.days.map((date) => {
    const key = localDateKey(date);
    return {
      key,
      date: key,
      label: period === "week" ? new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date) : String(date.getDate()),
      sublabel: period === "week" ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date) : undefined,
      minutes: focused.filter((entry) => entry.date === key).reduce((total, entry) => total + entryMinutes(entry), 0),
    };
  });
}

function dailyActivityBuckets(entries: TimelineActivity[], range: DateRange, type: "interruption" | "break") {
  return range.days.map((date) => {
    const key = localDateKey(date);
    return {
      key,
      date: key,
      label: new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date),
      sublabel: new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date),
      minutes: entries.filter((entry) => entry.type === type && entry.date === key).reduce((total, entry) => total + entryMinutes(entry), 0),
    } satisfies ChartBucket;
  });
}

function periodTimestampBounds(range: DateRange) {
  return { start: range.start.getTime(), end: addDays(range.end, 1).getTime() };
}

function MetricCard({ icon, label, value, comparison }: { icon: ReactNode; label: string; value: string; comparison: string }) {
  return (
    <article className="insights-metric">
      <span className="insights-metric__icon">{icon}</span>
      <div><span>{label}</span><strong>{value}</strong><small>{comparison}</small></div>
    </article>
  );
}

function SectionHeader({ title, detail }: { title: string; detail?: string }) {
  return <header className="insights-section__header"><div><h2>{title}</h2>{detail && <p>{detail}</p>}</div><span title="Calculated from tracked Timeline activity"><Info size={14} /></span></header>;
}

function BarChart({ buckets, period, tone, onSelect }: { buckets: ChartBucket[]; period: Period; tone: "focus" | "interruption"; onSelect: (bucket: ChartBucket) => void }) {
  const max = Math.max(1, ...buckets.map((bucket) => bucket.minutes));
  const hasData = buckets.some((bucket) => bucket.minutes > 0);
  return (
    <div className={`insights-bar-chart insights-bar-chart--${period} insights-bar-chart--${tone}`}>
      <div className="insights-bar-chart__plot" role="img" aria-label={`${tone === "focus" ? "Focus" : "Interruption"} time over the selected period`}>
        {!hasData && <div className="insights-chart-empty">No tracked {tone} time in this period</div>}
        {buckets.map((bucket) => (
          <button
            key={bucket.key}
            className="insights-chart-column"
            style={{ "--bar-height": `${Math.max(bucket.minutes ? 4 : 0, (bucket.minutes / max) * 100)}%` } as CSSProperties}
            type="button"
            title={`${bucket.label}${bucket.sublabel ? `, ${bucket.sublabel}` : ""}: ${formatDuration(bucket.minutes)}`}
            aria-label={`${bucket.label}: ${formatDuration(bucket.minutes)}. Open in Timeline.`}
            onClick={() => onSelect(bucket)}
          >
            {period === "week" && bucket.minutes > 0 && <span className="insights-chart-column__value">{formatDuration(bucket.minutes)}</span>}
            <i />
            <span className="insights-chart-column__label">{bucket.label}<small>{bucket.sublabel}</small></span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function InsightsPage({ onNavigate }: { onNavigate?: (label: string) => void }) {
  const entries = useTimelineStore((state) => state.entries);
  const tasks = useTaskStore((state) => state.tasks);
  const notesByTask = useTaskNotesStore((state) => state.notesByTask);
  const setTaskStatus = useTaskStore((state) => state.setStatus);
  const startTodayTask = useTodayStore((state) => state.startTask);
  const focusingId = useTodayStore((state) => state.currentTask?.id ?? null);
  const focusMode = useTodayStore((state) => state.mode);
  const toggleFocusPause = useTodayStore((state) => state.togglePause);
  const resumeTodayFocus = useTodayStore((state) => state.resumeFocus);
  const interruptTodayFocus = useTodayStore((state) => state.interrupt);
  const [period, setPeriod] = useState<Period>("week");
  const [anchor, setAnchor] = useState(localDateKey);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [reminderTaskId, setReminderTaskId] = useState<string | null>(null);
  const calendarInput = useRef<HTMLInputElement>(null);

  const range = useMemo(() => rangeFor(anchor, period), [anchor, period]);
  const priorRange = useMemo(() => previousRange(anchor, period), [anchor, period]);
  const periodEntries = useMemo(() => entriesInRange(entries, range), [entries, range]);
  const priorEntries = useMemo(() => entriesInRange(entries, priorRange), [entries, priorRange]);
  const totals = useMemo(() => activitySummary(periodEntries), [periodEntries]);
  const priorTotals = useMemo(() => activitySummary(priorEntries), [priorEntries]);
  const buckets = useMemo(() => focusBuckets(periodEntries, range, period), [periodEntries, period, range]);
  const interruptionBuckets = useMemo(() => dailyActivityBuckets(periodEntries, range, "interruption"), [periodEntries, range]);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const taskIds = new Set(periodEntries.filter((entry) => entry.type === "focus" && entry.taskId).map((entry) => entry.taskId));
  const previousTaskIds = new Set(priorEntries.filter((entry) => entry.type === "focus" && entry.taskId).map((entry) => entry.taskId));
  const focusEntries = periodEntries.filter((entry) => entry.type === "focus");
  const interruptionEntries = periodEntries.filter((entry) => entry.type === "interruption");
  const breakEntries = periodEntries.filter((entry) => entry.type === "break");
  const bounds = periodTimestampBounds(range);

  const taskBreakdown = useMemo(() => {
    const rows = new Map<string, { task: FlowoTask; minutes: number; sessions: Set<string> }>();
    for (const entry of focusEntries) {
      if (!entry.taskId) continue;
      const task = tasks.find((item) => item.id === entry.taskId);
      if (!task) continue;
      const row = rows.get(task.id) ?? { task, minutes: 0, sessions: new Set<string>() };
      row.minutes += entryMinutes(entry);
      row.sessions.add(entry.sessionId ?? entry.id);
      rows.set(task.id, row);
    }
    return [...rows.values()].sort((a, b) => b.minutes - a.minutes);
  }, [focusEntries, tasks]);

  const sessionStats = useMemo(() => {
    const sessions = new Map<string, TimelineActivity[]>();
    for (const entry of focusEntries) {
      const id = entry.sessionId ?? entry.id;
      sessions.set(id, [...(sessions.get(id) ?? []), entry]);
    }
    const values = [...sessions.values()].map((items) => {
      const ordered = [...items].sort((a, b) => a.date.localeCompare(b.date) || a.startMinutes - b.startMinutes);
      let switches = 0;
      for (let index = 1; index < ordered.length; index += 1) {
        if ((ordered[index].taskId ?? "unassigned") !== (ordered[index - 1].taskId ?? "unassigned")) switches += 1;
      }
      return { minutes: items.reduce((total, item) => total + entryMinutes(item), 0), switches };
    });
    return {
      average: values.length ? values.reduce((sum, item) => sum + item.minutes, 0) / values.length : 0,
      longest: values.length ? Math.max(...values.map((item) => item.minutes)) : 0,
      shortest: values.length ? Math.min(...values.map((item) => item.minutes)) : 0,
      switches: values.length ? values.reduce((sum, item) => sum + item.switches, 0) / values.length : 0,
    };
  }, [focusEntries]);

  const interruptionBreakdown = useMemo(() => {
    const categories = new Map<string, { minutes: number; count: number }>();
    for (const entry of interruptionEntries) {
      const name = entry.reason || "Other";
      const item = categories.get(name) ?? { minutes: 0, count: 0 };
      item.minutes += entryMinutes(entry);
      item.count += 1;
      categories.set(name, item);
    }
    return [...categories.entries()].map(([name, item]) => ({ name, ...item })).sort((a, b) => b.minutes - a.minutes);
  }, [interruptionEntries]);

  const navigateTimeline = (date: string, options: { filter?: "focus" | "interruption" | "break"; taskFilter?: string; query?: string } = {}) => {
    window.sessionStorage.setItem("flowo:timeline-jump", JSON.stringify({ date, ...options }));
    onNavigate?.("Timeline");
  };

  const openUnassigned = () => {
    const unassigned = focusEntries.filter((entry) => !entry.taskId).sort((a, b) => b.date.localeCompare(a.date))[0];
    navigateTimeline(unassigned?.date ?? localDateKey(range.end), { filter: "focus", taskFilter: "unassigned" });
  };

  const latestDateFor = (type: "focus" | "interruption" | "break") => periodEntries
    .filter((entry) => entry.type === type)
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.date ?? localDateKey(range.end);

  const startTask = async (task: FlowoTask) => {
    if (focusingId === task.id) {
      if (focusMode === "focusing") await toggleFocusPause();
      else if (focusMode === "paused" || focusMode === "interrupted") await resumeTodayFocus();
      return;
    }
    await startTodayTask({
      id: task.id,
      title: task.title,
      category: task.context.split(" / ")[1] ?? task.context,
      tag: task.context.split(" / ")[0] ?? "Unsorted",
      duration: formatDuration(task.totalMinutes),
      color: "var(--blue)",
    });
  };

  const taskAction = async (task: FlowoTask, action: string) => {
    if (action === "Switch Task") return startTask(task);
    if (action === "Add Reminder") {
      setReminderTaskId(task.id);
      return;
    }
    if (action === "Edit") {
      window.sessionStorage.setItem("flowo:tasks-open", task.id);
      setSelectedTaskId(null);
      onNavigate?.("Tasks");
      return;
    }
    const statusByAction: Record<string, TaskStatus> = {
      "Mark Complete": "completed",
      "Cancel Task": "cancelled",
      Archive: "archived",
      Reopen: "todo",
      Restore: "todo",
    };
    if (statusByAction[action]) await setTaskStatus(task.id, statusByAction[action]);
  };

  const openTaskPage = (task: FlowoTask, action?: "note") => {
    window.sessionStorage.setItem("flowo:tasks-open", task.id);
    if (action) window.sessionStorage.setItem("flowo:tasks-action", action);
    setSelectedTaskId(null);
    onNavigate?.("Tasks");
  };

  const periodWord = comparisonName(period);
  const maxTaskMinutes = Math.max(1, ...taskBreakdown.map((row) => row.minutes));
  const maxInterruptionMinutes = Math.max(1, ...interruptionBreakdown.map((row) => row.minutes));
  const trackedTotal = totals.focus + totals.interruptions + totals.breaks;
  const averageBreak = breakEntries.length ? totals.breaks / breakEntries.length : 0;

  return (
    <div className="app-shell insights-shell">
      <AppSidebar selected="Insights" onNavigate={onNavigate} />
      <main className="insights-page">
        <header className="insights-header">
          <div><h1>Insights</h1><p>Understand how your tracked time was distributed.</p></div>
          <div className="insights-period-controls">
            <div className="insights-period-tabs" aria-label="Time range">
              {(["day", "week", "month"] as Period[]).map((item) => <button key={item} className={period === item ? "is-selected" : ""} type="button" onClick={() => setPeriod(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}
            </div>
            <div className="insights-date-control">
              <button type="button" aria-label={`Previous ${period}`} onClick={() => setAnchor((current) => moveAnchor(current, period, -1))}><ArrowLeft size={16} /></button>
              <button className="insights-date-control__label" type="button" onClick={() => calendarInput.current?.showPicker()}><CalendarDays size={16} /><span>{formatRange(range, period)}</span></button>
              <button type="button" aria-label={`Next ${period}`} onClick={() => setAnchor((current) => moveAnchor(current, period, 1))}><ArrowRight size={16} /></button>
              <input ref={calendarInput} type="date" value={anchor} onChange={(event) => event.target.value && setAnchor(event.target.value)} aria-label="Choose date" />
            </div>
          </div>
        </header>

        <section className="insights-overview" aria-label="Overview">
          <MetricCard icon={<Clock3 size={18} />} label="Focus Time" value={formatDuration(totals.focus)} comparison={`${signedDuration(totals.focus - priorTotals.focus)} vs ${periodWord}`} />
          <MetricCard icon={<TimerReset size={18} />} label="Focus Sessions" value={String(totals.sessions)} comparison={`${signedCount(totals.sessions - priorTotals.sessions)} vs ${periodWord}`} />
          <MetricCard icon={<Zap size={18} />} label="Interruption Time" value={formatDuration(totals.interruptions)} comparison={`${signedDuration(totals.interruptions - priorTotals.interruptions)} vs ${periodWord}`} />
          <MetricCard icon={<Coffee size={18} />} label="Break Time" value={formatDuration(totals.breaks)} comparison={`${signedDuration(totals.breaks - priorTotals.breaks)} vs ${periodWord}`} />
          <MetricCard icon={<ListChecks size={18} />} label="Tasks Worked On" value={String(taskIds.size)} comparison={`${signedCount(taskIds.size - previousTaskIds.size)} vs ${periodWord}`} />
        </section>

        <div className="insights-grid">
          <section className="insights-section insights-focus-section">
            <SectionHeader title="Focus Trends" detail={period === "day" ? "Focused minutes by hour" : "Focused time by day"} />
            <BarChart buckets={buckets} period={period} tone="focus" onSelect={(bucket) => navigateTimeline(bucket.date, { filter: "focus" })} />
            <div className="session-patterns" aria-label="Focus session patterns">
              <article><span>Average session</span><strong>{formatDuration(sessionStats.average)}</strong></article>
              <article><span>Longest session</span><strong>{formatDuration(sessionStats.longest)}</strong></article>
              <article><span>Shortest session</span><strong>{formatDuration(sessionStats.shortest)}</strong></article>
              <article><span>Avg. task switches</span><strong>{sessionStats.switches.toFixed(1)}</strong><small>per session</small></article>
            </div>
          </section>

          <section className="insights-section insights-tasks-section">
            <SectionHeader title="Task Breakdown" detail="Ranked by focus time" />
            <div className="insights-task-table" aria-label="Time by task">
              <div className="insights-task-table__head"><span>Task</span><span>Time</span><span>% of focus</span></div>
              {taskBreakdown.slice(0, 7).map((row, index) => {
                const percentage = totals.focus ? (row.minutes / totals.focus) * 100 : 0;
                const completed = Boolean(row.task.completedAt && row.task.completedAt >= bounds.start && row.task.completedAt < bounds.end);
                return (
                  <button key={row.task.id} className="insights-task-row" type="button" onClick={() => setSelectedTaskId(row.task.id)}>
                    <span className="insights-task-row__name"><i style={{ background: taskColors[index % taskColors.length] }} /> <span>{row.task.title}<small>{row.sessions.size} {row.sessions.size === 1 ? "session" : "sessions"}{completed && <em><CheckCircle2 size={11} /> Completed</em>}</small></span></span>
                    <span className="insights-task-row__bar"><i style={{ width: `${(row.minutes / maxTaskMinutes) * 100}%`, background: taskColors[index % taskColors.length] }} /></span>
                    <strong>{formatDuration(row.minutes)}</strong>
                    <span>{percentage.toFixed(1)}%</span>
                  </button>
                );
              })}
              {!taskBreakdown.length && <div className="insights-empty"><ListChecks size={25} /><span>No tasks have focus time in this period.</span></div>}
            </div>
            <button className="insights-section-link" type="button" onClick={() => onNavigate?.("Tasks")}>View all tasks <ChevronRight size={15} /></button>
            <button className={`unassigned-focus ${totals.unassigned ? "has-time" : ""}`} type="button" onClick={openUnassigned}>
              <span>{totals.unassigned ? <TriangleAlert size={18} /> : <CheckCircle2 size={18} />}<span><strong>Unassigned focus time</strong><small>{totals.unassigned ? "Assign this time to keep task totals accurate." : "All focus time in this period is assigned."}</small></span></span>
              <span><strong>{formatDuration(totals.unassigned)}</strong><small>{totals.focus ? `${((totals.unassigned / totals.focus) * 100).toFixed(1)}% of focus time` : "No focus time"}</small><ChevronRight size={15} /></span>
            </button>
          </section>

          <section className="insights-section insights-interruptions-section">
            <SectionHeader title="Interruptions & Breaks" detail="Kept separate from focused work" />
            <div className="interruptions-layout">
              <div className="interruption-categories">
                <div className="interruption-summary"><span><Zap size={17} /> Interruptions</span><strong>{formatDuration(totals.interruptions)}</strong><small>{interruptionEntries.length} {interruptionEntries.length === 1 ? "interruption" : "interruptions"}</small></div>
                <div className="interruption-category-list">
                  {interruptionBreakdown.map((item) => (
                    <button key={item.name} type="button" onClick={() => {
                      const latest = interruptionEntries.filter((entry) => (entry.reason || "Other") === item.name).sort((a, b) => b.date.localeCompare(a.date))[0];
                      navigateTimeline(latest?.date ?? localDateKey(range.end), { filter: "interruption", query: item.name });
                    }}>
                      <span><i style={{ background: interruptionColors[item.name] ?? interruptionColors.Other }} />{item.name}<small>{item.count}</small></span>
                      <span className="interruption-category-bar"><i style={{ width: `${(item.minutes / maxInterruptionMinutes) * 100}%`, background: interruptionColors[item.name] ?? interruptionColors.Other }} /></span>
                      <strong>{formatDuration(item.minutes)}</strong>
                    </button>
                  ))}
                  {!interruptionBreakdown.length && <div className="insights-empty insights-empty--small"><span>No interruptions tracked.</span></div>}
                </div>
              </div>

              <div className="interruption-trend">
                <h3>Interruption trend</h3>
                <BarChart buckets={interruptionBuckets} period={period === "month" ? "month" : "week"} tone="interruption" onSelect={(bucket) => navigateTimeline(bucket.date, { filter: "interruption" })} />
              </div>

              <div className="break-analysis">
                <div className="break-analysis__stats">
                  <span><Coffee size={17} /> Breaks</span>
                  <article><small>Total break time</small><strong>{formatDuration(totals.breaks)}</strong></article>
                  <article><small>Average break</small><strong>{formatDuration(averageBreak)}</strong></article>
                  <article><small>Breaks taken</small><strong>{breakEntries.length}</strong></article>
                </div>
                <div className="time-balance">
                  <h3>Tracked time balance</h3>
                  <div className="time-balance__bar" aria-label={`Focus ${formatDuration(totals.focus)}, interruptions ${formatDuration(totals.interruptions)}, breaks ${formatDuration(totals.breaks)}`}>
                    <button style={{ width: `${trackedTotal ? (totals.focus / trackedTotal) * 100 : 0}%` }} type="button" title={`Focus: ${formatDuration(totals.focus)}`} onClick={() => navigateTimeline(latestDateFor("focus"), { filter: "focus" })} />
                    <button style={{ width: `${trackedTotal ? (totals.interruptions / trackedTotal) * 100 : 0}%` }} type="button" title={`Interruptions: ${formatDuration(totals.interruptions)}`} onClick={() => navigateTimeline(latestDateFor("interruption"), { filter: "interruption" })} />
                    <button style={{ width: `${trackedTotal ? (totals.breaks / trackedTotal) * 100 : 0}%` }} type="button" title={`Breaks: ${formatDuration(totals.breaks)}`} onClick={() => navigateTimeline(latestDateFor("break"), { filter: "break" })} />
                  </div>
                  <div className="time-balance__legend"><span><i /> Focus <b>{formatDuration(totals.focus)}</b></span><span><i /> Interruptions <b>{formatDuration(totals.interruptions)}</b></span><span><i /> Breaks <b>{formatDuration(totals.breaks)}</b></span></div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
      <MobileNavigation selected="Insights" onNavigate={onNavigate} />

      <TaskDetailsPopup
        task={selectedTask}
        notes={selectedTask ? notesByTask[selectedTask.id] ?? [] : []}
        entries={entries}
        focusMode={selectedTask && focusingId === selectedTask.id && (focusMode === "focusing" || focusMode === "paused" || focusMode === "interrupted") ? focusMode : null}
        onClose={() => setSelectedTaskId(null)}
        onStart={() => selectedTask && void startTask(selectedTask)}
        onInterrupt={() => void interruptTodayFocus()}
        onAction={(action) => selectedTask && void taskAction(selectedTask, action)}
        onAddNote={() => selectedTask && openTaskPage(selectedTask, "note")}
        onViewNotes={() => selectedTask && openTaskPage(selectedTask)}
        onViewHistory={() => selectedTask && navigateTimeline(
          entries.filter((entry) => entry.taskId === selectedTask.id).sort((a, b) => b.date.localeCompare(a.date))[0]?.date ?? localDateKey(),
          { filter: "focus", taskFilter: selectedTask.id },
        )}
        onStatusChange={(status) => { if (selectedTask) void setTaskStatus(selectedTask.id, status); }}
      />
      <RemindersDialog
        open={Boolean(reminderTaskId)}
        initialTaskId={reminderTaskId ?? undefined}
        tasks={tasks.filter((task) => task.status === "in-progress" || task.status === "todo" || task.status === "blocked").map((task) => ({ id: task.id, title: task.title }))}
        onClose={() => setReminderTaskId(null)}
        onChanged={() => useTaskStore.getState().load()}
      />
    </div>
  );
}
