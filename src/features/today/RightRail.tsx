import { Bell, Play, Plus } from "lucide-react";
import { Badge, Card, IconButton } from "../../cdk";
import { useTodayStore } from "./store";
import type { Metric, Reminder, Task } from "./types";
import { activitySummary, formatDuration, localDateKey, useTimelineStore } from "../timeline/timelineStore";

function CardHeader({ title, count, action = "View all" }: { title: string; count?: number; action?: string }) {
  return (
    <header className="rail-card__header">
      <h2>{title} {count !== undefined && <Badge>{count}</Badge>}</h2>
      <button>{action}</button>
    </header>
  );
}

export function MetricItem({ metric }: { metric: Metric }) {
  return (
    <div className="metric-item">
      <span>{metric.label}</span>
      <strong>{metric.value}</strong>
      <small className={metric.favorable ? "is-positive" : "is-warning"}>{metric.trend}</small>
    </div>
  );
}

export function TodayOverviewCard() {
  const entries = useTimelineStore((state) => state.entries);
  const fallbackMetrics = useTodayStore((state) => state.todayMetrics);
  const todayEntries = entries.filter((entry) => entry.date === localDateKey());
  const totals = activitySummary(todayEntries);
  const productiveTotal = totals.focus + totals.interruptions;
  const metrics: Metric[] = todayEntries.length ? [
    { label: "Focus Time", value: formatDuration(totals.focus), trend: "Live from Timeline", favorable: true },
    { label: "Sessions", value: String(totals.sessions), trend: "Focus sessions today", favorable: true },
    { label: "Interruptions", value: String(totals.interruptionCount), trend: `${formatDuration(totals.interruptions)} total`, favorable: totals.interruptions < 60 },
    { label: "Interrupt Time", value: formatDuration(totals.interruptions), trend: "Editable in Timeline", favorable: totals.interruptions < 60 },
    { label: "Break Time", value: formatDuration(totals.breaks), trend: "Intentional pauses", favorable: true },
    { label: "Focus %", value: `${productiveTotal ? Math.round(totals.focus / productiveTotal * 100) : 0}%`, trend: "Of focus + interruptions", favorable: true },
  ] : fallbackMetrics;
  return (
    <Card className="rail-card overview-card">
      <CardHeader title="Today Overview" action="View Insights" />
      <div className="metric-grid">{metrics.map((metric) => <MetricItem key={metric.label} metric={metric} />)}</div>
    </Card>
  );
}

export function ReminderRow({ reminder }: { reminder: Reminder }) {
  return (
    <div className="reminder-row">
      <span className="reminder-row__icon"><Bell size={16} /></span>
      <span className="reminder-row__copy"><strong>{reminder.title}</strong><small>{reminder.at}</small></span>
      <span className="reminder-row__relative">{reminder.relative}</span>
    </div>
  );
}

export function UpcomingRemindersCard() {
  const reminders = useTodayStore((state) => state.reminders);
  return (
    <Card className="rail-card reminders-card">
      <CardHeader title="Upcoming Reminders" count={reminders.length} />
      <div>{reminders.map((reminder) => <ReminderRow key={reminder.id} reminder={reminder} />)}</div>
    </Card>
  );
}

export function RecentTaskRow({ task }: { task: Task }) {
  const startTask = useTodayStore((state) => state.startTask);
  const activeTaskId = useTodayStore((state) => state.currentTask?.id);
  return (
    <div className={`recent-task-row ${activeTaskId === task.id ? "is-active" : ""}`}>
      <span className="task-color" style={{ background: task.color }} />
      <strong title={task.title}>{task.title}</strong>
      <span>{task.duration}</span>
      <IconButton label={`Start focus on ${task.title}`} onClick={() => startTask(task)}><Play size={13} fill="currentColor" /></IconButton>
    </div>
  );
}

export function RecentTasksCard() {
  const tasks = useTodayStore((state) => state.recentTasks);
  const setQuickCaptureDraft = useTodayStore((state) => state.setQuickCaptureDraft);
  return (
    <Card className="rail-card recent-card">
      <CardHeader title="Recent Tasks" />
      <div>{tasks.slice(0, 5).map((task) => <RecentTaskRow key={task.id} task={task} />)}</div>
      <button
        className="new-task-link"
        onClick={() => {
          setQuickCaptureDraft("");
          document.getElementById("quick-capture-input")?.focus();
        }}
      ><Plus size={16} /> New Task</button>
    </Card>
  );
}

export function RightRail() {
  return (
    <aside className="right-rail">
      <TodayOverviewCard />
      <UpcomingRemindersCard />
      <RecentTasksCard />
    </aside>
  );
}
