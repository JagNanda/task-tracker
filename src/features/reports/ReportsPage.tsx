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
  Flag,
  Focus,
  Info,
  Italic,
  Link2,
  List,
  ListChecks,
  Maximize2,
  Minus,
  RefreshCw,
  Save,
  Trash2,
  TriangleAlert,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, IconButton, Modal } from "../../cdk";
import { useTaskStore } from "../tasks/taskStore";
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

function entriesForPeriod(period: ReportPeriod, anchor: string, entries: TimelineActivity[]) {
  const bounds = periodBounds(period, anchor);
  const periodStart = new Date(bounds.start);
  periodStart.setHours(0, 0, 0, 0);
  const periodEnd = new Date(bounds.end);
  periodEnd.setHours(0, 0, 0, 0);
  periodEnd.setDate(periodEnd.getDate() + 1);
  const start = periodStart.getTime();
  const end = periodEnd.getTime();
  return entries.flatMap((entry) => {
    const entryStart = activityTimestamp(entry);
    const entryEnd = activityTimestamp(entry, true);
    const overlapStart = Math.max(start, entryStart);
    const overlapEnd = Math.min(end, entryEnd);
    if (overlapEnd <= overlapStart) return [];
    return [{ ...entry, startMinutes: 0, endMinutes: (overlapEnd - overlapStart) / 60_000 }];
  });
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
    const normalized = note.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!normalized || seen.has(normalized)) return [];
    seen.add(normalized);
    return [note.replace(/[.]+$/, "") + "."];
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
  const totals = new Map<string, number>();
  entries.filter((entry) => entry.type === type && !entry.cancelled).forEach((entry) => {
    const reason = entry.reason || (type === "break" ? "Other break" : "Other interruption");
    totals.set(reason, (totals.get(reason) ?? 0) + entryMinutes(entry));
  });
  return [...totals.entries()].sort((a, b) => b[1] - a[1]);
}

function reportHtml(period: ReportPeriod, anchor: string, entries: TimelineActivity[], options: ReportOptions, tasks: FlowoTask[], detail: "concise" | "detailed") {
  const tracked = entries.filter((entry) => !entry.cancelled);
  const groups = groupFocusEntries(tracked);
  const completedTasks = tasks.filter((task) => taskCompletedInPeriod(task, period, anchor));
  const summary = activitySummary(tracked);
  const sectionName = period === "day" ? "Worked On" : period === "week" ? "Progress This Week" : "Progress This Month";
  const completedName = period === "day" ? "Completed" : period === "week" ? "Completed This Week" : "Major Work Completed";
  const parts = [`<h1>${escapeHtml(periodLabel(period, anchor))}</h1>`];

  if (!groups.length && !completedTasks.length) {
    parts.push('<div class="report-empty"><strong>No tracked work for this period</strong><p>Choose another day, week, or month to create a report.</p></div>');
    return parts.join("");
  }

  if (options.completed && completedTasks.length) {
    parts.push(`<h2 class="report-heading report-heading--green"><span>✓</span>${completedName}</h2><ul>`);
    completedTasks.forEach((task) => parts.push(`<li>${escapeHtml(task.title)}.</li>`));
    parts.push("</ul>");
  }

  const completedIds = new Set(completedTasks.map((task) => task.id));
  const assigned = groups.filter((group) => group.id !== "unassigned" && !completedIds.has(group.id));
  if (options.inProgress && assigned.length) {
    parts.push(`<h2 class="report-heading report-heading--blue"><span>●</span>${sectionName}</h2><ul>`);
    assigned.forEach((group) => {
      const notes = group.notes.length
        ? detail === "detailed" ? group.notes.join(" ") : group.notes[0]
        : `Worked on ${group.name}.`;
      parts.push(`<li><strong>${escapeHtml(group.name)}</strong> — ${escapeHtml(notes)}</li>`);
    });
    parts.push("</ul>");
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
    if (interruptions.length) parts.push(`<ul>${interruptions.map(([reason, minutes]) => `<li>${escapeHtml(reason)} — ${formatDuration(minutes)}</li>`).join("")}</ul>`);
  }

  if (options.breaks) {
    const breaks = aggregateReasons(tracked, "break");
    parts.push(`<h2 class="report-heading report-heading--teal"><span>◌</span>Breaks</h2><p>Total break time: <strong>${formatDuration(summary.breaks)}</strong>.</p>`);
    if (breaks.length) parts.push(`<ul>${breaks.map(([reason, minutes]) => `<li>${escapeHtml(reason)} — ${formatDuration(minutes)}</li>`).join("")}</ul>`);
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

export function ReportsPage({ onNavigate }: { onNavigate?: (label: string) => void }) {
  const allEntries = useTimelineStore((state) => state.entries);
  const timelineLoaded = useTimelineStore((state) => state.loaded);
  const tasks = useTaskStore((state) => state.tasks);
  const tasksLoaded = useTaskStore((state) => state.loaded);
  const savedReports = useReportStore((state) => state.reports);
  const saveReport = useReportStore((state) => state.saveReport);
  const deleteReport = useReportStore((state) => state.deleteReport);
  const [period, setPeriod] = useState<ReportPeriod>("day");
  const [anchor, setAnchor] = useState(localDateKey);
  const [options, setOptions] = useState(defaultOptions);
  const [detail, setDetail] = useState<"concise" | "detailed">("concise");
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [html, setHtml] = useState("");
  const [status, setStatus] = useState<"generated" | "modified" | "saved">("generated");
  const [editorVersion, setEditorVersion] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [notice, setNotice] = useState("");
  const [pendingRegenerate, setPendingRegenerate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SavedReport | null>(null);
  const dateInput = useRef<HTMLInputElement>(null);
  const editor = useRef<HTMLDivElement>(null);
  const initialDraftInstalled = useRef(false);

  const periodEntries = useMemo(() => entriesForPeriod(period, anchor, allEntries), [allEntries, anchor, period]);
  const groups = useMemo(() => groupFocusEntries(periodEntries), [periodEntries]);
  const summary = useMemo(() => activitySummary(periodEntries), [periodEntries]);
  const completedCount = tasks.filter((task) => taskCompletedInPeriod(task, period, anchor)).length;
  const unassignedMinutes = groups.find((group) => group.id === "unassigned")?.minutes ?? 0;
  const inputType = period === "month" ? "month" : "date";
  const inputValue = period === "month" ? anchor.slice(0, 7) : anchor;

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
      if (settings["reports.defaultPeriod"] === "last" && savedReports[0]) {
        setPeriod(savedReports[0].period);
        setAnchor(savedReports[0].anchorDate);
      }
      setPreferencesLoaded(true);
    });
  }, [savedReports]);

  useEffect(() => {
    if (!timelineLoaded || !tasksLoaded || !preferencesLoaded || initialDraftInstalled.current) return;
    initialDraftInstalled.current = true;
    installHtml(reportHtml(period, anchor, entriesForPeriod(period, anchor, allEntries), options, tasks, detail), "generated");
  }, [allEntries, anchor, detail, options, period, preferencesLoaded, tasks, tasksLoaded, timelineLoaded]);

  useEffect(() => {
    if (editor.current) editor.current.innerHTML = html;
  }, [editorVersion]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 2500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

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
        handleSave();
      }
    };
    window.addEventListener("keydown", saveShortcut);
    return () => window.removeEventListener("keydown", saveShortcut);
  });

  const currentHtml = () => editor.current?.innerHTML ?? html;

  const generate = (targetPeriod: ReportPeriod = period, targetAnchor: string = anchor, announce = true) => {
    const targetEntries = entriesForPeriod(targetPeriod, targetAnchor, allEntries);
    installHtml(reportHtml(targetPeriod, targetAnchor, targetEntries, options, tasks, detail), "generated");
    setPendingRegenerate(false);
    if (announce) {
      const reportType = targetPeriod === "day" ? "Daily" : targetPeriod === "week" ? "Weekly" : "Monthly";
      setNotice(`${reportType} report regenerated from tracked work.`);
    }
  };

  const requestGenerate = () => status === "modified" ? setPendingRegenerate(true) : generate();

  const changePeriod = (nextPeriod: ReportPeriod) => {
    if (status === "modified" && !window.confirm("Discard unsaved edits and change the report period?")) return;
    setPeriod(nextPeriod);
    generate(nextPeriod, anchor, false);
  };

  const changeAnchor = (nextAnchor: string) => {
    if (status === "modified" && !window.confirm("Discard unsaved edits and move to another period?")) return;
    setAnchor(nextAnchor);
    generate(period, nextAnchor, false);
  };

  const handleSave = () => {
    const value = currentHtml();
    const report: SavedReport = {
      id: `report-${Date.now()}`,
      period,
      periodLabel: shortPeriodLabel(period, anchor),
      anchorDate: anchor,
      html: value,
      savedAt: new Date().toISOString(),
      options: { ...options },
    };
    saveReport(report);
    setHtml(value);
    setStatus("saved");
    setNotice("Report saved as a new version.");
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
    link.download = `flowo-${period}-report-${anchor}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice("Text report exported.");
  };

  const openSaved = (report: SavedReport) => {
    if (status === "modified" && !window.confirm("Discard unsaved edits and open this saved report?")) return;
    setPeriod(report.period);
    setAnchor(report.anchorDate);
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
          <Button onClick={() => changeAnchor(localDateKey())}><Flag size={16} /> End Day</Button>
        </header>

        <div className="report-period-bar">
          <div className="report-tabs" role="tablist" aria-label="Report period">
            {(["day", "week", "month"] as ReportPeriod[]).map((item) => <button key={item} role="tab" aria-selected={period === item} className={period === item ? "is-selected" : ""} onClick={() => changePeriod(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}
          </div>
          <Button className="report-generate" onClick={requestGenerate}><RefreshCw size={17} /> {html ? "Regenerate Report" : "Generate Report"}</Button>
        </div>

        <div className="report-date-row">
          <div className="report-date-controls">
            <IconButton label="Previous period" onClick={() => changeAnchor(movePeriod(period, anchor, -1))}><ChevronLeft size={18} /></IconButton>
            <button className="report-date-button" type="button" onClick={() => dateInput.current?.showPicker()}><CalendarDays size={17} /><span>{periodLabel(period, anchor)}</span></button>
            <IconButton label="Next period" onClick={() => changeAnchor(movePeriod(period, anchor, 1))}><ChevronRight size={18} /></IconButton>
            <input ref={dateInput} className="report-date-input" type={inputType} value={inputValue} onChange={(event) => event.target.value && changeAnchor(period === "month" ? `${event.target.value}-01` : event.target.value)} tabIndex={-1} />
          </div>
          <div className="report-date-actions">
            <Button size="sm" tone="primary" onClick={handleCopy}><Copy size={14} /> Copy Report</Button>
            <Button size="sm" onClick={handleSave}><Save size={14} /> Save Report</Button>
            <Button size="sm" onClick={exportText}><Download size={14} /> Export .txt</Button>
          </div>
        </div>

        <div className="reports-workspace">
          <aside className="report-options-card">
            <header><h2>Report Options</h2><Info size={15} /></header>
            <OptionToggle label="Include total focus time" help="Show total focused work time." checked={options.totalFocus} onChange={(value) => updateOption("totalFocus", value)} />
            <OptionToggle label="Include time per task" help="Show time spent on each task." checked={options.timePerTask} onChange={(value) => updateOption("timePerTask", value)} />
            <OptionToggle label="Include completed tasks" help="Show tasks completed this period." checked={options.completed} onChange={(value) => updateOption("completed", value)} />
            <OptionToggle label="Include work in progress" help="Show tasks worked on but not completed." checked={options.inProgress} onChange={(value) => updateOption("inProgress", value)} />
            <div className="report-options-divider" />
            <OptionToggle label="Include interruptions" help="Show interruption time and categories." checked={options.interruptions} onChange={(value) => updateOption("interruptions", value)} />
            <OptionToggle label="Include breaks" help="Show break time and categories." checked={options.breaks} onChange={(value) => updateOption("breaks", value)} />
            {unassignedMinutes > 0 && <div className="unassigned-warning"><TriangleAlert size={18} /><strong>Some time is unassigned</strong><p>You have {formatDuration(unassignedMinutes)} of unassigned focus time in this period.</p><button type="button" onClick={() => safeNavigate("Timeline")}>Open Timeline <ArrowRight size={14} /></button></div>}
          </aside>

          <section className={`report-editor-card ${fullscreen ? "is-fullscreen" : ""}`}>
            <header className="report-editor-header"><div><span>Report Preview</span><small>Editable</small><b className={`report-status report-status--${status}`}>{status === "generated" ? "Generated" : status === "modified" ? "Unsaved" : "Saved"}</b></div><ReportToolbar onCommand={command} fullscreen={fullscreen} onFullscreen={() => setFullscreen((value) => !value)} /></header>
            <div ref={editor} className="report-editor" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label="Editable report" onInput={(event) => { setHtml(event.currentTarget.innerHTML); setStatus("modified"); }} />
            <footer><span>Press Ctrl + S to save report</span><span>{(editor.current?.innerText.trim().split(/\s+/).filter(Boolean).length ?? 0)} words</span></footer>
          </section>

          <aside className="reports-right-rail">
            <section className="period-summary-card">
              <h2>Period Summary</h2>
              <div><Clock3 size={19} /><span>Focus Time</span><strong>{formatDuration(summary.focus)}</strong></div>
              <div><Focus size={19} /><span>Focus Sessions</span><strong>{summary.sessions}</strong></div>
              <div><ListChecks size={19} /><span>Tasks Worked On</span><strong>{groups.filter((group) => group.id !== "unassigned").length}</strong></div>
              <div><CheckCircle2 size={19} /><span>Tasks Completed</span><strong>{completedCount}</strong></div>
              {options.interruptions && <div className="is-private"><Zap size={19} /><span>Interruptions</span><strong>{formatDuration(summary.interruptions)}</strong></div>}
              {options.breaks && <div className="is-private"><Coffee size={19} /><span>Breaks</span><strong>{formatDuration(summary.breaks)}</strong></div>}
              {groups.length > 0 && <><hr /><h3>Time by Task</h3><div className="task-time-list">{groups.slice(0, 3).map((group, index) => <p key={group.id}><i style={{ background: taskColors[index] }} /><span>{group.name}</span><strong>{formatDuration(group.minutes)}</strong></p>)}</div></>}
              <button className="summary-link" type="button" onClick={() => safeNavigate("Timeline")}>View full breakdown <ArrowRight size={14} /></button>
            </section>

            <section className="saved-reports-card">
              <header><h2>Saved Reports</h2><span>{savedReports.length} saved</span></header>
              {savedReports.length ? <div className="saved-report-list">{savedReports.slice(0, 5).map((report) => <article key={report.id}>
                <button className="saved-report-open" type="button" onClick={() => openSaved(report)}><FileText size={22} /><span><strong>{report.period[0].toUpperCase() + report.period.slice(1)} Report</strong><small>{report.periodLabel}</small></span><time>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(report.savedAt))}</time></button>
                <button className="saved-report-delete" aria-label={`Delete ${report.periodLabel} report`} type="button" onClick={() => setDeleteTarget(report)}><Trash2 size={15} /></button>
              </article>)}</div> : <div className="saved-reports-empty"><Clipboard size={24} /><p>Saved versions will appear here.</p></div>}
            </section>
          </aside>
        </div>

      </main>

      {notice && <div className="report-notice" role="status"><Check size={16} />{notice}</div>}
      <Modal open={pendingRegenerate} title="Replace unsaved edits?" onClose={() => setPendingRegenerate(false)}><p className="modal-description">Regenerating will replace the changes you made in the editor. Your Timeline and task data will not be changed.</p><div className="modal-actions"><Button onClick={() => setPendingRegenerate(false)}>Keep Editing</Button><Button tone="primary" onClick={() => generate()}><RefreshCw size={15} /> Regenerate</Button></div></Modal>
      <Modal open={Boolean(deleteTarget)} title="Delete saved report?" onClose={() => setDeleteTarget(null)}><p className="modal-description">This deletes only this saved report. Your tasks, Timeline, and tracked work will remain unchanged.</p><div className="modal-actions"><Button onClick={() => setDeleteTarget(null)}>Cancel</Button><Button className="report-delete-confirm" onClick={() => { if (deleteTarget) deleteReport(deleteTarget.id); setDeleteTarget(null); }}><Trash2 size={15} /> Delete Report</Button></div></Modal>
    </div>
  );
}
