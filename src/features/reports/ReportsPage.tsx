import {
  ArrowRight,
  Bold,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Clock3,
  Coffee,
  Copy,
  Download,
  FileText,
  Focus,
  Info,
  Italic,
  Link2,
  List,
  ListChecks,
  Maximize2,
  Minus,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Trash2,
  TriangleAlert,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, IconButton, Modal, Select } from "../../cdk";
import { reportRepository, type TicketReportRow } from "../../data/repositories/reportRepository";
import { taskLabel, useTaskStore } from "../tasks/taskStore";
import { useTaskNotesStore, type TaskNote } from "../tasks/notesStore";
import type { FlowoTask } from "../tasks/TasksPage";
import {
  activitySummary,
  entryMinutes,
  formatDuration,
  localDateKey,
  type TimelineActivity,
  useTimelineStore,
} from "../timeline/timelineStore";
import { AppSidebar } from "../today/AppSidebar";
import { type ReportPeriod, type SavedReport, useReportStore } from "./reportStore";
import { ReportQuickAddDialog } from "./ReportQuickAddDialog";
import { settingsService } from "../../data/services/settingsService";

type ReportOptions = {
  totalFocus: boolean;
  timePerTask: boolean;
  completed: boolean;
  inProgress: boolean;
  interruptions: boolean;
  breaks: boolean;
};

type TaskGroup = {
  id: string;
  name: string;
  minutes: number;
  notes: string[];
};

const defaultOptions: ReportOptions = {
  totalFocus: true,
  timePerTask: true,
  completed: true,
  inProgress: true,
  interruptions: false,
  breaks: false,
};

const taskColors = ["#2388ff", "#28c88b", "#9465ed", "#f5a11b", "#68788b"];
const reportTabs = ["day", "week", "month", "ticket"] as const;
const commentDateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(date: Date) {
  const result = new Date(date);
  const weekday = result.getDay() || 7;
  result.setDate(result.getDate() - weekday + 1);
  result.setHours(0, 0, 0, 0);
  return result;
}

function periodBounds(period: ReportPeriod, anchor: string) {
  const date = parseDate(anchor);
  if (period === "day") return { start: date, end: date };
  if (period === "week") {
    const start = startOfWeek(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { start, end };
  }
  return {
    start: new Date(date.getFullYear(), date.getMonth(), 1),
    end: new Date(date.getFullYear(), date.getMonth() + 1, 0),
  };
}

function periodLabel(period: ReportPeriod, anchor: string) {
  const date = parseDate(anchor);
  if (period === "day") return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(date);
  if (period === "month") return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);
  const { start, end } = periodBounds(period, anchor);
  const startMonth = new Intl.DateTimeFormat("en-US", { month: "long" }).format(start);
  const endMonth = new Intl.DateTimeFormat("en-US", { month: "long" }).format(end);
  if (start.getMonth() === end.getMonth()) return `${startMonth} ${start.getDate()} – ${end.getDate()}, ${end.getFullYear()}`;
  return `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}, ${end.getFullYear()}`;
}

function shortPeriodLabel(period: ReportPeriod, anchor: string) {
  const date = parseDate(anchor);
  if (period === "day") return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
  if (period === "month") return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);
  const { start, end } = periodBounds(period, anchor);
  const startLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(start);
  const endLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(end);
  return `${startLabel}–${endLabel}`;
}

function activityTimestamp(entry: TimelineActivity, end = false) {
  if (end && entry.endedAt !== undefined) return entry.endedAt;
  if (!end && entry.startedAt !== undefined) return entry.startedAt;
  const date = parseDate(entry.date);
  const minutes = end ? entry.endMinutes : entry.startMinutes;
  date.setMinutes(minutes);
  return date.getTime();
}

export function entriesForPeriod(period: ReportPeriod, anchor: string, entries: TimelineActivity[], tasks: FlowoTask[]) {
  const bounds = periodBounds(period, anchor);
  const periodStart = new Date(bounds.start);
  periodStart.setHours(0, 0, 0, 0);
  const periodEnd = new Date(bounds.end);
  periodEnd.setHours(0, 0, 0, 0);
  periodEnd.setDate(periodEnd.getDate() + 1);
  const start = periodStart.getTime();
  const end = periodEnd.getTime();
  const taskNames = new Map(tasks.map((task) => [task.id, taskLabel(task)]));
  const latestFocus = new Map<string, TimelineActivity>();
  const chronological = entries.map((entry) => ({ entry, entryStart: activityTimestamp(entry) })).sort((a, b) => a.entryStart - b.entryStart);
  return chronological.flatMap(({ entry, entryStart }) => {
    if (entry.type === "focus" && entry.sessionId && !entry.cancelled) latestFocus.set(entry.sessionId, entry);
    const entryEnd = activityTimestamp(entry, true);
    const overlapStart = Math.max(start, entryStart);
    const overlapEnd = Math.min(end, entryEnd);
    if (overlapEnd <= overlapStart) return [];
    // Breaks and interruptions inherit the most recent task in their focus session.
    const focus = entry.sessionId ? latestFocus.get(entry.sessionId) : undefined;
    const taskId = entry.type === "focus" ? entry.taskId : entry.taskId ?? focus?.taskId;
    const taskName = taskId ? taskNames.get(taskId) ?? entry.taskName ?? focus?.taskName : undefined;
    return [{ ...entry, taskId, taskName, startMinutes: 0, endMinutes: (overlapEnd - overlapStart) / 60_000 }];
  });
}

function dateInPeriod(date: string, period: ReportPeriod, anchor: string) {
  const { start, end } = periodBounds(period, anchor);
  return date >= dateKey(start) && date <= dateKey(end);
}

function taskCompletedInPeriod(task: FlowoTask, period: ReportPeriod, anchor: string) {
  if (task.status !== "completed" || task.completedAt === undefined) return false;
  const bounds = periodBounds(period, anchor);
  const start = new Date(bounds.start);
  start.setHours(0, 0, 0, 0);
  const end = new Date(bounds.end);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + 1);
  return task.completedAt >= start.getTime() && task.completedAt < end.getTime();
}

function movePeriod(period: ReportPeriod, anchor: string, direction: -1 | 1) {
  const date = parseDate(anchor);
  if (period === "day") date.setDate(date.getDate() + direction);
  if (period === "week") date.setDate(date.getDate() + direction * 7);
  if (period === "month") date.setMonth(date.getMonth() + direction, 1);
  return dateKey(date);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character] ?? character);
}

function meaningfulNotes(entries: TimelineActivity[]) {
  const seen = new Set<string>();
  return entries.flatMap((entry) => {
    const note = entry.note?.trim();
    if (!note) return [];
    const normalized = note.toLowerCase().replace(/[\p{P}\s]+/gu, " ").trim();
    if (!normalized || seen.has(normalized)) return [];
    seen.add(normalized);
    return [note];
  });
}

function groupFocusEntries(entries: TimelineActivity[]): TaskGroup[] {
  const groups = new Map<string, TimelineActivity[]>();
  entries.filter((entry) => entry.type === "focus" && !entry.cancelled).forEach((entry) => {
    const id = entry.taskId ?? "unassigned";
    groups.set(id, [...(groups.get(id) ?? []), entry]);
  });
  return [...groups.entries()].map(([id, taskEntries]) => ({
    id,
    name: id === "unassigned" ? "Unassigned focus time" : taskEntries[0].taskName ?? "Tracked work",
    minutes: taskEntries.reduce((total, entry) => total + entryMinutes(entry), 0),
    notes: meaningfulNotes(taskEntries),
  })).sort((a, b) => b.minutes - a.minutes);
}

function aggregateReasons(entries: TimelineActivity[], type: "interruption" | "break") {
  const totals = new Map<string, { taskName: string; reason: string; minutes: number }>();
  entries.filter((entry) => entry.type === type && !entry.cancelled).forEach((entry) => {
    const reason = entry.reason || (type === "break" ? "Other break" : "Other interruption");
    const key = JSON.stringify([entry.taskId, reason]);
    const minutes = (totals.get(key)?.minutes ?? 0) + entryMinutes(entry);
    totals.set(key, { taskName: entry.taskName ?? "Unassigned", reason, minutes });
  });
  return [...totals.values()].sort((a, b) => b.minutes - a.minutes);
}

function labelledLine(taskName: string, text?: string) {
  return `<li><strong>${escapeHtml(taskName)}</strong>${text ? ` - ${escapeHtml(text)}` : ""}</li>`;
}

function labelledNotes(taskName: string, notes: string[]) {
  return notes.flatMap((note) => note.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))
    .map((line) => labelledLine(taskName, line)).join("");
}

function workNotesSection(lines: string) {
  return `<h2>Work Notes</h2><ul data-report-work-notes>${lines}</ul>`;
}

function ticketKey(value: string) {
  return value.trim().toLowerCase();
}

function ticketComment(taskName: string, date: string, body: string) {
  return labelledNotes(`${taskName} · ${commentDateFormat.format(parseDate(date))}`, [body]);
}

function formatTicketDuration(milliseconds: number) {
  if (milliseconds > 0 && milliseconds < 60_000) return `${Math.max(1, Math.floor(milliseconds / 1_000))}s`;
  return formatDuration(milliseconds / 60_000);
}

export function ticketReportHtml(ticketNumber: string, rows: TicketReportRow[]) {
  const tasks = [...new Map(rows.map((row) => [row.task_id, row])).values()]
    .sort((a, b) => b.focus_ms - a.focus_ms || a.task_title.localeCompare(b.task_title));
  const total = tasks.reduce((sum, task) => sum + task.focus_ms, 0);
  const comments = rows.flatMap((row) => {
    if (!row.body || row.recorded_at === null) return [];
    const date = row.report_date ?? localDateKey(new Date(row.recorded_at));
    const task = taskLabel({ title: row.task_title, ticketNumber: row.ticket_number });
    return [{ date, recordedAt: row.recorded_at, html: ticketComment(task, date, row.body) }];
  }).sort((a, b) => b.date.localeCompare(a.date) || b.recordedAt - a.recordedAt);

  const times = tasks.map((task) => `<tr><td>${escapeHtml(task.task_title)}</td><td>${formatTicketDuration(task.focus_ms)}</td></tr>`).join("");
  const commentList = comments.map((comment) => comment.html).join("") || '<li data-empty-ticket-comments>No comments recorded.</li>';
  return `<h1>Ticket ${escapeHtml(ticketNumber)}</h1>`
    + `<p>Total focus time (all time) <strong>${formatTicketDuration(total)}</strong></p>`
    + `<table><thead><tr><th>Task</th><th>Time Spent</th></tr></thead><tbody>${times}</tbody></table>`
    + `<h2>Comments</h2><ul data-ticket-comments>${commentList}</ul>`;
}

function taskNotesForPeriod(tasks: FlowoTask[], notesByTask: Record<string, TaskNote[]>, period: ReportPeriod, anchor: string) {
  return tasks.flatMap((task) => {
    const notes = (notesByTask[task.id] ?? []).filter((note) => note.reportDate && dateInPeriod(note.reportDate, period, anchor));
    return notes.length ? [{ task, notes }] : [];
  });
}

export function reportHtml(period: ReportPeriod, anchor: string, entries: TimelineActivity[], options: ReportOptions, tasks: FlowoTask[], detail: "concise" | "detailed", notesByTask: Record<string, TaskNote[]>) {
  const tracked = entries.filter((entry) => !entry.cancelled);
  const groups = groupFocusEntries(tracked);
  const completedTasks = tasks.filter((task) => taskCompletedInPeriod(task, period, anchor));
  const workNotes = taskNotesForPeriod(tasks, notesByTask, period, anchor);
  const summary = activitySummary(tracked);
  const sectionName = period === "day" ? "Worked On" : period === "week" ? "Progress This Week" : "Progress This Month";
  const completedName = period === "day" ? "Completed" : period === "week" ? "Completed This Week" : "Major Work Completed";
  const parts = [`<h1>${escapeHtml(periodLabel(period, anchor))}</h1>`];

  if (!groups.length && !completedTasks.length && !workNotes.length &&
      !(options.interruptions && summary.interruptionCount) && !(options.breaks && summary.breaks)) {
    parts.push('<div class="report-empty"><strong>No tracked work for this period</strong><p>Choose another day, week, or month to create a report.</p></div>');
    return parts.join("");
  }

  if (options.completed && completedTasks.length) {
    parts.push(`<h2 class="report-heading report-heading--green"><span>✓</span>${completedName}</h2><ul>`);
    completedTasks.forEach((task) => {
      const notes = groups.find((group) => group.id === task.id)?.notes ?? [];
      parts.push(notes.length ? labelledNotes(taskLabel(task), detail === "detailed" ? notes : notes.slice(0, 1)) : labelledLine(taskLabel(task)));
    });
    parts.push("</ul>");
  }

  const completedIds = new Set(completedTasks.map((task) => task.id));
  const assigned = groups.filter((group) => !completedIds.has(group.id) && (group.id !== "unassigned" || group.notes.length));
  if (options.inProgress && assigned.length) {
    parts.push(`<h2 class="report-heading report-heading--blue"><span>●</span>${sectionName}</h2><ul>`);
    assigned.forEach((group) => {
      const notes = detail === "detailed" ? group.notes : group.notes.slice(0, 1);
      parts.push(notes.length ? labelledNotes(group.name, notes) : labelledLine(group.name));
    });
    parts.push("</ul>");
  }

  if (workNotes.length) {
    parts.push(workNotesSection(workNotes.map(({ task, notes }) => labelledNotes(taskLabel(task), notes.map((note) => note.body))).join("")));
  }

  if (options.totalFocus || options.timePerTask) {
    parts.push('<h2 class="report-heading report-heading--purple"><span>◷</span>Focus Time</h2>');
    if (options.totalFocus) parts.push(`<p>Total focused work time: <strong>${formatDuration(summary.focus)}</strong></p>`);
    if (options.timePerTask && groups.length) {
      parts.push('<table><thead><tr><th>Task</th><th>Time Spent</th></tr></thead><tbody>');
      groups.forEach((group) => parts.push(`<tr><td>${escapeHtml(group.name)}</td><td>${formatDuration(group.minutes)}</td></tr>`));
      parts.push("</tbody></table>");
    }
  }

  if (options.interruptions) {
    const interruptions = aggregateReasons(tracked, "interruption");
    parts.push(`<h2 class="report-heading report-heading--orange"><span>↯</span>Interruptions</h2><p>${summary.interruptionCount} interruption${summary.interruptionCount === 1 ? "" : "s"}, totaling <strong>${formatDuration(summary.interruptions)}</strong>.</p>`);
    if (interruptions.length) parts.push(`<ul>${interruptions.map(({ taskName, reason, minutes }) => labelledLine(taskName, `${reason} - ${formatDuration(minutes)}`)).join("")}</ul>`);
  }

  if (options.breaks) {
    const breaks = aggregateReasons(tracked, "break");
    parts.push(`<h2 class="report-heading report-heading--teal"><span>◌</span>Breaks</h2><p>Total break time: <strong>${formatDuration(summary.breaks)}</strong>.</p>`);
    if (breaks.length) parts.push(`<ul>${breaks.map(({ taskName, reason, minutes }) => labelledLine(taskName, `${reason} - ${formatDuration(minutes)}`)).join("")}</ul>`);
  }

  return parts.join("");
}

function OptionToggle({ label, help, checked, onChange }: { label: string; help: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="report-option">
      <span><strong>{label}</strong><small>{help}</small></span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}

function ReportToolbar({ onCommand, fullscreen, onFullscreen }: { onCommand: (command: string, value?: string) => void; fullscreen: boolean; onFullscreen: () => void }) {
  return (
    <div className="report-toolbar" aria-label="Report formatting">
      <button type="button" onMouseDown={(event) => { event.preventDefault(); onCommand("formatBlock", "h1"); }}>H1</button>
      <button type="button" onMouseDown={(event) => { event.preventDefault(); onCommand("formatBlock", "h2"); }}>H2</button>
      <button type="button" aria-label="Bold" onMouseDown={(event) => { event.preventDefault(); onCommand("bold"); }}><Bold size={15} /></button>
      <button type="button" aria-label="Italic" onMouseDown={(event) => { event.preventDefault(); onCommand("italic"); }}><Italic size={15} /></button>
      <button type="button" aria-label="Bulleted list" onMouseDown={(event) => { event.preventDefault(); onCommand("insertUnorderedList"); }}><List size={16} /></button>
      <button type="button" aria-label="Numbered list" onMouseDown={(event) => { event.preventDefault(); onCommand("insertOrderedList"); }}><ListChecks size={16} /></button>
      <span />
      <button type="button" aria-label="Horizontal rule" onMouseDown={(event) => { event.preventDefault(); onCommand("insertHorizontalRule"); }}><Minus size={16} /></button>
      <button type="button" aria-label="Add link" onMouseDown={(event) => { event.preventDefault(); const url = window.prompt("Link URL"); if (url) onCommand("createLink", url); }}><Link2 size={16} /></button>
      <button type="button" aria-label={fullscreen ? "Exit full screen" : "Full screen editor"} onClick={onFullscreen}><Maximize2 size={16} /></button>
    </div>
  );
}

export function ReportsPage({ onNavigate, quickAddDate, onOpenQuickAdd, onCloseQuickAdd }: {
  onNavigate?: (label: string) => void;
  quickAddDate: string | null;
  onOpenQuickAdd: () => void;
  onCloseQuickAdd: () => void;
}) {
  const allEntries = useTimelineStore((state) => state.entries);
  const timelineLoaded = useTimelineStore((state) => state.loaded);
  const tasks = useTaskStore((state) => state.tasks);
  const tasksLoaded = useTaskStore((state) => state.loaded);
  const notesByTask = useTaskNotesStore((state) => state.notesByTask);
  const notesLoaded = useTaskNotesStore((state) => state.loaded);
  const savedReports = useReportStore((state) => state.reports);
  const savedReportsLoaded = useReportStore((state) => state.loaded);
  const saveReport = useReportStore((state) => state.saveReport);
  const deleteReport = useReportStore((state) => state.deleteReport);
  const [period, setPeriod] = useState<ReportPeriod>("day");
  const [anchor, setAnchor] = useState(localDateKey);
  const [ticketMode, setTicketMode] = useState(false);
  const [ticketNumber, setTicketNumber] = useState("");
  const [ticketLoading, setTicketLoading] = useState(false);
  const [ticketError, setTicketError] = useState("");
  const [options, setOptions] = useState(defaultOptions);
  const [detail, setDetail] = useState<"concise" | "detailed">("concise");
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [preferLastReport, setPreferLastReport] = useState(false);
  const [html, setHtml] = useState("");
  const [status, setStatus] = useState<"generated" | "modified" | "saved">("generated");
  const [editorVersion, setEditorVersion] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [pendingRegenerate, setPendingRegenerate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SavedReport | null>(null);
  const dateInput = useRef<HTMLInputElement>(null);
  const editor = useRef<HTMLDivElement>(null);
  const optionsPopover = useRef<HTMLDivElement>(null);
  const initialDraftInstalled = useRef(false);

  const ticketGroups = useMemo(() => {
    const result = new Map<string, { number: string; taskIds: string[] }>();
    for (const task of tasks) {
      const number = task.ticketNumber?.trim();
      if (!number) continue;
      const key = ticketKey(number);
      const existing = result.get(key);
      if (existing) existing.taskIds.push(task.id);
      else result.set(key, { number, taskIds: [task.id] });
    }
    return result;
  }, [tasks]);
  const selectedTicketKey = ticketKey(ticketNumber);
  const ticketOptions = [...ticketGroups].map(([value, group]) => ({ value, label: group.number }));
  if (ticketNumber && !ticketGroups.has(selectedTicketKey)) ticketOptions.push({ value: selectedTicketKey, label: ticketNumber });
  ticketOptions.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const busy = saving || ticketLoading;
  const hasPreview = !ticketMode || Boolean(ticketNumber && (html || status !== "generated"));
  const ticketPlaceholder = ticketLoading ? "Loading ticket comments and time…" : ticketOptions.length
    ? "Choose a ticket to see its comments and time."
    : "Add a ticket number to a task to view its report.";
  const periodEntries = useMemo(() => entriesForPeriod(period, anchor, allEntries, tasks), [allEntries, anchor, period, tasks]);
  const groups = useMemo(() => groupFocusEntries(periodEntries), [periodEntries]);
  const summary = useMemo(() => activitySummary(periodEntries), [periodEntries]);
  const workedTaskIds = new Set(groups.filter((group) => group.id !== "unassigned").map((group) => group.id));
  taskNotesForPeriod(tasks, notesByTask, period, anchor).forEach(({ task }) => workedTaskIds.add(task.id));
  const completedCount = tasks.filter((task) => taskCompletedInPeriod(task, period, anchor)).length;
  const unassignedMinutes = groups.find((group) => group.id === "unassigned")?.minutes ?? 0;
  const inputType = period === "month" ? "month" : "date";
  const inputValue = period === "month" ? anchor.slice(0, 7) : anchor;
  const optionsChanged = (Object.keys(defaultOptions) as Array<keyof ReportOptions>).some((key) => options[key] !== defaultOptions[key]);

  const installHtml = (value: string, nextStatus: "generated" | "saved") => {
    setHtml(value);
    setStatus(nextStatus);
    setEditorVersion((version) => version + 1);
  };

  useEffect(() => {
    void settingsService.all().then((settings) => {
      setOptions({
        totalFocus: settings["reports.includeTotalFocusTime"],
        timePerTask: settings["reports.includeTimePerTask"],
        completed: settings["reports.includeCompleted"],
        inProgress: settings["reports.includeWorkInProgress"],
        interruptions: settings["reports.includeInterruptions"],
        breaks: settings["reports.includeBreaks"],
      });
      setDetail(settings["reports.detail"] === "detailed" ? "detailed" : "concise");
      setPreferLastReport(settings["reports.defaultPeriod"] === "last");
      setPreferencesLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!timelineLoaded || !tasksLoaded || !notesLoaded || !savedReportsLoaded || !preferencesLoaded || initialDraftInstalled.current) return;
    initialDraftInstalled.current = true;
    const latest = preferLastReport ? savedReports[0] : undefined;
    if (latest?.period === "ticket") {
      setTicketMode(true);
      setTicketNumber(latest.ticketNumber);
      installHtml(latest.html, "saved");
      return;
    }
    const initialPeriod = latest?.period ?? period;
    const initialAnchor = latest?.anchorDate ?? anchor;
    setPeriod(initialPeriod);
    setAnchor(initialAnchor);
    const entries = latest ? entriesForPeriod(initialPeriod, initialAnchor, allEntries, tasks) : periodEntries;
    installHtml(reportHtml(initialPeriod, initialAnchor, entries, options, tasks, detail, notesByTask), "generated");
  }, [allEntries, anchor, detail, notesByTask, notesLoaded, options, period, periodEntries, preferencesLoaded, preferLastReport, savedReports, savedReportsLoaded, tasks, tasksLoaded, timelineLoaded]);

  useEffect(() => {
    if (editor.current) editor.current.innerHTML = html;
  }, [editorVersion]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 2500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!optionsOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!optionsPopover.current?.contains(event.target as Node)) setOptionsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOptionsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [optionsOpen]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (status !== "modified") return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);

  useEffect(() => {
    const saveShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!quickAddDate) void handleSave();
      }
    };
    window.addEventListener("keydown", saveShortcut);
    return () => window.removeEventListener("keydown", saveShortcut);
  });

  const currentHtml = () => editor.current?.innerHTML ?? html;

  const generate = (targetPeriod: ReportPeriod = period, targetAnchor: string = anchor, announce = true) => {
    const targetEntries = entriesForPeriod(targetPeriod, targetAnchor, allEntries, tasks);
    installHtml(reportHtml(targetPeriod, targetAnchor, targetEntries, options, tasks, detail, useTaskNotesStore.getState().notesByTask), "generated");
    setPendingRegenerate(false);
    if (announce) {
      const reportType = targetPeriod === "day" ? "Daily" : targetPeriod === "week" ? "Weekly" : "Monthly";
      setNotice(`${reportType} report regenerated from tracked work.`);
    }
  };

  const generateTicket = async (number: string, announce = true) => {
    const key = ticketKey(number);
    const group = ticketGroups.get(key);
    if (!group) return;
    setPendingRegenerate(false);
    setTicketError("");
    setTicketLoading(true);
    try {
      const rows = (await reportRepository.ticketActivity(group.taskIds)).filter((row) => ticketKey(row.ticket_number) === key);
      if (!rows.length) {
        setTicketError("No tasks currently use this ticket number.");
        return;
      }
      installHtml(ticketReportHtml(number, rows), "generated");
      if (announce) setNotice("Ticket report updated.");
    } catch (error) {
      setTicketError(`Could not generate the ticket report. ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setTicketLoading(false);
    }
  };

  const showQuickAddedNotes = (task: FlowoTask, body: string) => {
    if (ticketMode && quickAddDate) {
      if (task.ticketNumber && ticketKey(task.ticketNumber) === selectedTicketKey) {
        if (status === "generated") {
          void generateTicket(ticketNumber, false);
        } else if (editor.current) {
          const lines = ticketComment(taskLabel(task), quickAddDate, body);
          const list = editor.current.querySelector("[data-ticket-comments]");
          list?.querySelector("[data-empty-ticket-comments]")?.remove();
          if (list) list.insertAdjacentHTML("afterbegin", lines);
          else editor.current.insertAdjacentHTML("beforeend", `<h2>Comments</h2><ul data-ticket-comments>${lines}</ul>`);
          setHtml(editor.current.innerHTML);
          setStatus("modified");
        }
      }
      setNotice("Work notes added.");
      return;
    }
    if (!quickAddDate || !dateInPeriod(quickAddDate, period, anchor)) {
      setNotice("Work notes added to today's report.");
      return;
    }
    if (status === "generated") {
      generate(period, anchor, false);
    } else if (editor.current) {
      const lines = labelledNotes(taskLabel(task), [body]);
      const list = editor.current.querySelector("[data-report-work-notes]");
      editor.current.querySelector(".report-empty")?.remove();
      if (list) list.insertAdjacentHTML("beforeend", lines);
      else editor.current.insertAdjacentHTML("beforeend", workNotesSection(lines));
      setHtml(editor.current.innerHTML);
      setStatus("modified");
    }
    setNotice("Work notes added.");
  };

  const generateCurrent = () => ticketMode ? void generateTicket(ticketNumber) : generate();
  const requestGenerate = () => status === "modified" ? setPendingRegenerate(true) : generateCurrent();

  const changePeriod = (nextPeriod: typeof reportTabs[number]) => {
    if (ticketMode ? nextPeriod === "ticket" : nextPeriod === period) return;
    if (status === "modified" && !window.confirm("Discard unsaved edits and change the report period?")) return;
    initialDraftInstalled.current = true;
    setOptionsOpen(false);
    setTicketError("");
    setTicketMode(nextPeriod === "ticket");
    if (nextPeriod === "ticket") {
      installHtml("", "generated");
      if (ticketGroups.has(selectedTicketKey)) void generateTicket(ticketNumber, false);
      return;
    }
    setPeriod(nextPeriod);
    generate(nextPeriod, anchor, false);
  };

  const changeTicket = (key: string) => {
    if (key === selectedTicketKey) return;
    if (status === "modified" && !window.confirm("Discard unsaved edits and change tickets?")) return;
    const number = ticketGroups.get(key)?.number ?? "";
    setTicketNumber(number);
    setTicketError("");
    installHtml("", "generated");
    if (number) void generateTicket(number, false);
  };

  const changeAnchor = (nextAnchor: string) => {
    if (status === "modified" && !window.confirm("Discard unsaved edits and move to another period?")) return;
    setAnchor(nextAnchor);
    generate(period, nextAnchor, false);
  };

  const handleSave = async () => {
    if (busy || !hasPreview) return;
    const value = currentHtml();
    const snapshot = {
      id: `report-${Date.now()}`,
      html: value,
      savedAt: new Date().toISOString(),
    };
    const report: SavedReport = ticketMode ? {
      ...snapshot, period: "ticket", periodLabel: ticketNumber, ticketNumber,
    } : {
      ...snapshot, period, periodLabel: shortPeriodLabel(period, anchor), anchorDate: anchor,
      options: { ...options },
    };
    setSaving(true);
    try {
      await saveReport(report);
      setHtml(value);
      setStatus("saved");
      setNotice("Report saved as a new version.");
    } catch (error) {
      setStatus("modified");
      setNotice(`Report could not be saved: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    const text = editor.current?.innerText ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Report copied to clipboard.");
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      if (editor.current) range.selectNodeContents(editor.current);
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.execCommand("copy");
      selection?.removeAllRanges();
      setNotice("Report copied to clipboard.");
    }
  };

  const exportText = () => {
    const blob = new Blob([editor.current?.innerText ?? ""], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = ticketMode
      ? `flowo-ticket-${ticketNumber.replace(/[^\p{L}\p{N}_.-]/gu, "_")}.txt`
      : `flowo-${period}-report-${anchor}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice("Text report exported.");
  };

  const openSaved = (report: SavedReport) => {
    if (status === "modified" && !window.confirm("Discard unsaved edits and open this saved report?")) return;
    initialDraftInstalled.current = true;
    setOptionsOpen(false);
    setTicketError("");
    setTicketMode(report.period === "ticket");
    if (report.period === "ticket") {
      setTicketNumber(report.ticketNumber);
    } else {
      setPeriod(report.period);
      setAnchor(report.anchorDate);
    }
    installHtml(report.html, "saved");
  };

  const safeNavigate = (label: string) => {
    if (status === "modified" && !window.confirm("Discard unsaved report edits and leave Reports?")) return;
    onNavigate?.(label);
  };

  const command = (name: string, value?: string) => {
    editor.current?.focus();
    document.execCommand(name, false, value);
    setHtml(currentHtml());
    setStatus("modified");
  };

  const updateOption = (key: keyof ReportOptions, value: boolean) => setOptions((current) => ({ ...current, [key]: value }));

  return (
    <div className={`app-shell reports-shell ${fullscreen ? "reports-shell--fullscreen" : ""}`}>
      <AppSidebar selected="Reports" onNavigate={safeNavigate} />
      <main className="reports-page">
        <header className="reports-header">
          <div><h1>Reports</h1><p>Turn your tracked work into a clean, shareable summary.</p></div>
          <div className="reports-header__actions">
            {!ticketMode && <Button disabled={busy} onClick={() => changeAnchor(localDateKey())}><CalendarDays size={16} /> Today</Button>}
            <Button tone="primary" disabled={!notesLoaded || busy} onClick={onOpenQuickAdd}><Plus size={16} /> Quick Add Today</Button>
          </div>
        </header>

        <div className="report-period-bar">
          <div className="report-tabs" role="tablist" aria-label="Report type">
            {reportTabs.map((item) => {
              const selected = item === (ticketMode ? "ticket" : period);
              return <button key={item} role="tab" aria-selected={selected} className={selected ? "is-selected" : ""} disabled={busy} onClick={() => changePeriod(item)}>{item[0].toUpperCase() + item.slice(1)}</button>;
            })}
          </div>
          <Button className="report-generate" disabled={busy || (ticketMode && !ticketGroups.has(selectedTicketKey))} onClick={requestGenerate}><RefreshCw size={17} /> {ticketLoading ? "Generating…" : html ? "Regenerate Report" : "Generate Report"}</Button>
        </div>

        <div className="report-date-row">
          {ticketMode ? (
            <Select className="report-ticket-select" label="Ticket number" value={selectedTicketKey} options={[{ value: "", label: "Choose a ticket number" }, ...ticketOptions]} onChange={changeTicket} disabled={busy || !ticketOptions.length} />
          ) : (
            <div className="report-date-controls">
              <IconButton label="Previous period" disabled={busy} onClick={() => changeAnchor(movePeriod(period, anchor, -1))}><ChevronLeft size={18} /></IconButton>
              <button className="report-date-button" type="button" disabled={busy} onClick={() => dateInput.current?.showPicker()}><CalendarDays size={17} /><span>{periodLabel(period, anchor)}</span></button>
              <IconButton label="Next period" disabled={busy} onClick={() => changeAnchor(movePeriod(period, anchor, 1))}><ChevronRight size={18} /></IconButton>
              <input ref={dateInput} className="report-date-input" type={inputType} value={inputValue} onChange={(event) => event.target.value && changeAnchor(period === "month" ? `${event.target.value}-01` : event.target.value)} tabIndex={-1} />
            </div>
          )}
          <div className="report-date-actions">
            {!ticketMode && <div className="report-options-popover" ref={optionsPopover}>
              <Button
                size="sm"
                className={`report-options-trigger ${optionsOpen ? "is-open" : ""}`}
                aria-expanded={optionsOpen}
                aria-controls="report-options-menu"
                onClick={() => setOptionsOpen((open) => !open)}
              >
                <Settings2 size={14} /> Options
                {optionsChanged && <span className="report-options-trigger__dot" aria-label="Options differ from defaults" />}
              </Button>
              {optionsOpen && <aside id="report-options-menu" className="report-options-panel" aria-label="Report options">
                <header><div><Settings2 size={15} /><h2>Report Options</h2><Info size={14} /></div><IconButton label="Close report options" onClick={() => setOptionsOpen(false)}><X size={16} /></IconButton></header>
                <OptionToggle label="Include total focus time" help="Show total focused work time." checked={options.totalFocus} onChange={(value) => updateOption("totalFocus", value)} />
                <OptionToggle label="Include time per task" help="Show time spent on each task." checked={options.timePerTask} onChange={(value) => updateOption("timePerTask", value)} />
                <OptionToggle label="Include completed tasks" help="Show tasks completed this period." checked={options.completed} onChange={(value) => updateOption("completed", value)} />
                <OptionToggle label="Include work in progress" help="Show tasks worked on but not completed." checked={options.inProgress} onChange={(value) => updateOption("inProgress", value)} />
                <div className="report-options-divider" />
                <OptionToggle label="Include interruptions" help="Show interruption time and categories." checked={options.interruptions} onChange={(value) => updateOption("interruptions", value)} />
                <OptionToggle label="Include breaks" help="Show break time and categories." checked={options.breaks} onChange={(value) => updateOption("breaks", value)} />
                {unassignedMinutes > 0 && <div className="unassigned-warning"><TriangleAlert size={18} /><strong>Some time is unassigned</strong><p>You have {formatDuration(unassignedMinutes)} of unassigned focus time in this period.</p><button type="button" onClick={() => safeNavigate("Timeline")}>Open Timeline <ArrowRight size={14} /></button></div>}
              </aside>}
            </div>}
            <Button size="sm" tone="primary" disabled={busy || !hasPreview} onClick={handleCopy}><Copy size={14} /> Copy Report</Button>
            <Button size="sm" disabled={busy || !hasPreview} onClick={() => void handleSave()}><Save size={14} /> {saving ? "Saving…" : "Save Report"}</Button>
            <Button size="sm" disabled={busy || !hasPreview} onClick={exportText}><Download size={14} /> Export .txt</Button>
          </div>
        </div>

        <div className="reports-workspace">
          <section className={`report-editor-card ${fullscreen ? "is-fullscreen" : ""}`}>
            <header className="report-editor-header"><div><span>Report Preview</span>{hasPreview && <><small>Editable</small><b className={`report-status report-status--${status}`}>{status === "generated" ? "Generated" : status === "modified" ? "Unsaved" : "Saved"}</b></>}</div>{hasPreview && !busy && <ReportToolbar onCommand={command} fullscreen={fullscreen} onFullscreen={() => setFullscreen((value) => !value)} />}</header>
            {ticketMode && ticketError && <p className="report-ticket-error" role="alert">{ticketError}</p>}
            <div ref={editor} className="report-editor" contentEditable={hasPreview && !busy} suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label="Editable report" aria-readonly={!hasPreview || busy} aria-busy={ticketLoading} data-placeholder={!hasPreview && !ticketError ? ticketPlaceholder : undefined} onInput={(event) => { setHtml(event.currentTarget.innerHTML); setStatus("modified"); }} />
            {hasPreview && <footer><span>Press Ctrl + S to save report</span><span>{(editor.current?.innerText.trim().split(/\s+/).filter(Boolean).length ?? 0)} words</span></footer>}
          </section>

          <aside className="reports-right-rail">
            {!ticketMode && <section className="period-summary-card">
              <h2>Period Summary</h2>
              <div><Clock3 size={19} /><span>Focus Time</span><strong>{formatDuration(summary.focus)}</strong></div>
              <div><Focus size={19} /><span>Focus Sessions</span><strong>{summary.sessions}</strong></div>
              <div><ListChecks size={19} /><span>Tasks Worked On</span><strong>{workedTaskIds.size}</strong></div>
              <div><CheckCircle2 size={19} /><span>Tasks Completed</span><strong>{completedCount}</strong></div>
              {options.interruptions && <div className="is-private"><Zap size={19} /><span>Interruptions</span><strong>{formatDuration(summary.interruptions)}</strong></div>}
              {options.breaks && <div className="is-private"><Coffee size={19} /><span>Breaks</span><strong>{formatDuration(summary.breaks)}</strong></div>}
              {groups.length > 0 && <><hr /><h3>Time by Task</h3><div className="task-time-list">{groups.slice(0, 3).map((group, index) => <p key={group.id}><i style={{ background: taskColors[index] }} /><span>{group.name}</span><strong>{formatDuration(group.minutes)}</strong></p>)}</div></>}
              <button className="summary-link" type="button" onClick={() => safeNavigate("Timeline")}>View full breakdown <ArrowRight size={14} /></button>
            </section>}

            <section className="saved-reports-card">
              <header><h2>Saved Reports</h2><span>{savedReports.length} saved</span></header>
              {savedReports.length ? <div className="saved-report-list">{savedReports.slice(0, 5).map((report) => <article key={report.id}>
                <button className="saved-report-open" type="button" disabled={busy} onClick={() => openSaved(report)}><FileText size={22} /><span><strong>{report.period[0].toUpperCase() + report.period.slice(1)} Report</strong><small>{report.periodLabel}</small></span><time>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(report.savedAt))}</time></button>
                <button className="saved-report-delete" aria-label={`Delete ${report.periodLabel} report`} type="button" onClick={() => setDeleteTarget(report)}><Trash2 size={15} /></button>
              </article>)}</div> : <div className="saved-reports-empty"><Clipboard size={24} /><p>Saved versions will appear here.</p></div>}
            </section>
          </aside>
        </div>

      </main>

      {notice && <div className="report-notice" role="status"><Check size={16} />{notice}</div>}
      {quickAddDate && notesLoaded && <ReportQuickAddDialog key={quickAddDate} date={quickAddDate} tasks={tasks} onSaved={showQuickAddedNotes} onClose={onCloseQuickAdd} />}
      <Modal open={pendingRegenerate} title="Replace unsaved edits?" onClose={() => setPendingRegenerate(false)}><p className="modal-description">Regenerating will replace the changes you made in the editor.</p><div className="modal-actions"><Button onClick={() => setPendingRegenerate(false)}>Keep Editing</Button><Button tone="primary" onClick={generateCurrent}><RefreshCw size={15} /> Regenerate</Button></div></Modal>
      <Modal open={Boolean(deleteTarget)} title="Delete saved report?" onClose={() => setDeleteTarget(null)}><p className="modal-description">This deletes only this saved report. Your tasks, Timeline, and tracked work will remain unchanged.</p><div className="modal-actions"><Button onClick={() => setDeleteTarget(null)}>Cancel</Button><Button className="report-delete-confirm" onClick={() => { if (deleteTarget) deleteReport(deleteTarget.id); setDeleteTarget(null); }}><Trash2 size={15} /> Delete Report</Button></div></Modal>
    </div>
  );
}
