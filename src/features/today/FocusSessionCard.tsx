import { useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  CirclePause,
  Clock3,
  Edit3,
  Pause,
  Play,
  Plus,
  Repeat2,
  X,
  Zap,
} from "lucide-react";
import { Badge, Button, Card, Dropdown, IconButton, Input, Modal, Pill, ProgressRing } from "../../cdk";
import { useTodayStore } from "./store";
import type { Task } from "./types";
import { formatClock } from "./utils";
import { interruptionService } from "../../data/services/interruptionService";
import { settingsService } from "../../data/services/settingsService";
import { defaultSettings, type SettingsState } from "../settings/settingsDefaults";

export function CurrentTaskHeader({ task, onEdit, mode }: { task: Task; onEdit: () => void; mode: string }) {
  const eyebrow = mode === "interrupted" ? "INTERRUPTED" : mode === "paused" ? "SESSION PAUSED" : mode === "ready" ? "READY TO FOCUS" : "FOCUSING ON";
  return (
    <div className="current-task-header">
      <span className="current-task-header__eyebrow">{mode === "interrupted" && <Zap size={12} fill="currentColor" />} {eyebrow}</span>
      <div className="current-task-header__title">
        <span className="status-dot" />
        <strong>{task.title}</strong>
        <IconButton label="Change current task" onClick={onEdit}><Edit3 size={14} /></IconButton>
      </div>
      <p>{task.category} <span>•</span> {task.tag}</p>
    </div>
  );
}

export function FocusTimer({
  remainingSeconds,
  totalSeconds,
  mode,
  interruptionSeconds,
  children,
}: {
  remainingSeconds: number;
  totalSeconds: number;
  mode: string;
  interruptionSeconds: number;
  children?: React.ReactNode;
}) {
  const shownTime = mode === "interrupted" ? formatClock(interruptionSeconds) : formatClock(remainingSeconds);
  const elapsedSeconds = Math.max(0, totalSeconds - remainingSeconds);
  const progress = mode === "interrupted" ? 1 : totalSeconds > 0 ? elapsedSeconds / totalSeconds : 0;
  const accessible = mode === "interrupted"
    ? `Interruption has lasted ${shownTime}`
    : `${shownTime} remaining of ${formatClock(totalSeconds)}`;
  return (
    <ProgressRing size={390} value={progress} muted={mode === "paused"} interruption={mode === "interrupted"} label={accessible}>
      {children}
      <div className="timer-readout" aria-hidden="true">{shownTime}</div>
      <div className="timer-total">{mode === "interrupted" ? "interruption elapsed" : `of ${formatClock(totalSeconds)}`}</div>
      {mode === "paused" && <Badge className="timer-state"><CirclePause size={13} /> Paused</Badge>}
    </ProgressRing>
  );
}

function CustomDurationModal({
  open,
  selected,
  onSelect,
  onClose,
}: {
  open: boolean;
  selected: number;
  onSelect: (minutes: number) => void;
  onClose: () => void;
}) {
  const [minutes, setMinutes] = useState("");
  const parsedMinutes = Number(minutes);
  const valid = Number.isInteger(parsedMinutes) && parsedMinutes >= 1 && parsedMinutes <= 1440;

  useEffect(() => {
    if (open) setMinutes(selected !== 25 && selected !== 50 ? String(selected) : "");
  }, [open, selected]);

  return (
    <Modal open={open} title="Choose a custom duration" onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); if (valid) { onSelect(parsedMinutes); onClose(); } }}>
        <div className="custom-duration-field">
          <label htmlFor="custom-duration-minutes">Duration in minutes</label>
          <div><Input id="custom-duration-minutes" type="number" min="1" max="1440" step="1" value={minutes} onChange={(event) => setMinutes(event.target.value)} placeholder="e.g. 35" /><span>minutes</span></div>
          <small>Enter any whole number from 1 minute to 24 hours.</small>
        </div>
        <div className="modal-actions">
          <Button type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" tone="primary" disabled={!valid}>Use {valid ? `${parsedMinutes}m` : "duration"}</Button>
        </div>
      </form>
    </Modal>
  );
}

export function DurationSelector({ selected, presets, onSelect, onCustom }: { selected: number; presets: number[]; onSelect: (minutes: number) => void; onCustom: () => void }) {
  return (
    <div className="duration-row">
      <span>Duration</span>
      {presets.map((minutes) => <Pill key={minutes} selected={selected === minutes} onClick={() => onSelect(minutes)}>{minutes}m</Pill>)}
      <Pill selected={!presets.includes(selected)} onClick={onCustom}>{!presets.includes(selected) ? `${selected}m` : "Custom"}</Pill>
    </div>
  );
}

export function FocusControls({
  mode,
  onPause,
  onStart,
  onInterrupt,
  onResume,
  onSwitch,
  onFinish,
  onCancel,
}: {
  mode: string;
  onPause: () => void;
  onStart: () => void;
  onInterrupt: () => void;
  onResume: () => void;
  onSwitch: () => void;
  onFinish: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="focus-controls">
      {mode === "interrupted" ? (
        <Button tone="orange" size="lg" onClick={onResume}><Play size={19} fill="currentColor" /> Resume Focus</Button>
      ) : (
        <Button tone="primary" size="lg" onClick={mode === "ready" ? onStart : onPause}>
          {mode === "ready" ? <><Play size={19} fill="currentColor" /> Start Focus</> : mode === "paused" ? <><Play size={19} fill="currentColor" /> Resume</> : <><Pause size={19} fill="currentColor" /> Pause</>}
        </Button>
      )}
      {mode !== "interrupted" && <Button tone="orange" size="lg" onClick={onInterrupt} disabled={mode === "ready"}><Zap size={19} fill="currentColor" /> Interrupt</Button>}
      <Button size="lg" onClick={onSwitch}><Repeat2 size={19} /> Switch Task</Button>
      <Button size="lg" onClick={onFinish} disabled={mode === "ready"}><Check size={20} /> Finish Early</Button>
      <Button size="lg" onClick={onCancel}><X size={20} /> Cancel Active Work</Button>
    </div>
  );
}

function TaskPicker({ open, onClose, preserveSession = false }: { open: boolean; onClose: () => void; preserveSession?: boolean }) {
  const tasks = useTodayStore((state) => state.recentTasks);
  const selectTask = useTodayStore((state) => state.selectTask);
  const switchTask = useTodayStore((state) => state.switchTask);
  const captureTask = useTodayStore((state) => state.captureTask);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    if (open) {
      setNewTaskTitle("");
      setCreateError("");
    }
  }, [open]);

  const createAndUseTask = async () => {
    const title = newTaskTitle.trim();
    if (!title) return;
    setCreating(true);
    setCreateError("");
    try {
      await captureTask(true, title);
      setNewTaskTitle("");
      onClose();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : String(error));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal open={open} title={preserveSession ? "Switch task" : "Choose a task"} onClose={onClose}>
      <p className="modal-description">{preserveSession ? "Switch to an existing task or create something new without ending this focus session." : "Choose an existing task or create the task you want to focus on."}</p>
      <form className="task-picker-create" onSubmit={(event) => { event.preventDefault(); void createAndUseTask(); }}>
        <label htmlFor="switch-new-task">Create a new task</label>
        <div><Input id="switch-new-task" value={newTaskTitle} onChange={(event) => { setNewTaskTitle(event.target.value); if (createError) setCreateError(""); }} placeholder="What are you switching to?" autoComplete="off" /><Button tone="primary" type="submit" disabled={creating || !newTaskTitle.trim()}><Plus size={15} /> {creating ? "Creating…" : preserveSession ? "Create & Switch" : "Create & Focus"}</Button></div>
        <small>Saved to Quick Capture / Unsorted. You can organize it later.</small>
        {createError && <small className="task-picker-create__error" role="alert">{createError}</small>}
      </form>
      <div className="task-picker-divider"><span>or choose an existing task</span></div>
      <div className="task-picker-list">
        {tasks.map((task) => (
          <button key={task.id} type="button" onClick={() => { preserveSession ? void switchTask(task) : selectTask(task); onClose(); }}>
            <span className="task-color" style={{ background: task.color }} />
            <span><strong>{task.title}</strong><small>{task.category} • {task.tag}</small></span>
            <Play size={16} />
          </button>
        ))}
      </div>
    </Modal>
  );
}

function IdleFocusCard({ onPick, durationPresets }: { onPick: () => void; durationPresets: number[] }) {
  const selectedDuration = useTodayStore((state) => state.selectedDuration);
  const setDuration = useTodayStore((state) => state.setDuration);
  const [customOpen, setCustomOpen] = useState(false);
  return (
    <>
      <Card className="focus-card focus-card--idle">
        <div className="idle-focus">
          <span className="idle-focus__icon"><Play size={26} fill="currentColor" /></span>
          <p className="eyebrow">YOUR NEXT SESSION</p>
          <h2>Ready to focus?</h2>
          <p>Select a task, choose a duration, and make some progress.</p>
          <Button tone="primary" size="lg" onClick={onPick}><Play size={18} fill="currentColor" /> Select a task</Button>
        </div>
        <div className="focus-card__footer">
          <DurationSelector selected={selectedDuration} presets={durationPresets} onSelect={setDuration} onCustom={() => setCustomOpen(true)} />
        </div>
      </Card>
      <CustomDurationModal open={customOpen} selected={selectedDuration} onSelect={setDuration} onClose={() => setCustomOpen(false)} />
    </>
  );
}

export function FocusSessionCard() {
  const mode = useTodayStore((state) => state.mode);
  const task = useTodayStore((state) => state.currentTask);
  const remainingSeconds = useTodayStore((state) => state.remainingSeconds);
  const totalSeconds = useTodayStore((state) => state.totalSeconds);
  const interruptionSeconds = useTodayStore((state) => state.interruptionSeconds);
  const selectedDuration = useTodayStore((state) => state.selectedDuration);
  const togglePause = useTodayStore((state) => state.togglePause);
  const startFocus = useTodayStore((state) => state.startFocus);
  const interrupt = useTodayStore((state) => state.interrupt);
  const resumeFocus = useTodayStore((state) => state.resumeFocus);
  const setReason = useTodayStore((state) => state.setInterruptionReason);
  const setDuration = useTodayStore((state) => state.setDuration);
  const cancelSession = useTodayStore((state) => state.cancelSession);
  const completeSession = useTodayStore((state) => state.completeSession);
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [customDurationOpen, setCustomDurationOpen] = useState(false);
  const [interruptionReasonOpen, setInterruptionReasonOpen] = useState(false);
  const [interruptionReasonDraft, setInterruptionReasonDraft] = useState("");
  const [completionNote, setCompletionNote] = useState("");
  const [completionError, setCompletionError] = useState("");
  const [completing, setCompleting] = useState(false);
  const [interruptionPresets, setInterruptionPresets] = useState<string[]>([]);
  const [preferences, setPreferences] = useState<SettingsState>({ ...defaultSettings, "focus.quickDurations": [...defaultSettings["focus.quickDurations"]], "reminders.snoozeOptions": [...defaultSettings["reminders.snoozeOptions"]] });
  const [reasonModalPurpose, setReasonModalPurpose] = useState<"record" | "resume">("resume");

  useEffect(() => {
    void Promise.all([interruptionService.listPresets(), settingsService.all()]).then(([presets, settings]) => {
      setInterruptionPresets(presets.map((preset) => preset.name));
      setPreferences(settings);
    });
  }, []);

  useEffect(() => {
    if (mode !== "focusing" || remainingSeconds !== 0) return;
    setCompletionError("");
    setFinishOpen(true);
  }, [mode, remainingSeconds]);

  const beginInterruption = async () => {
    await interrupt();
    if (preferences["interruptions.reasonPrompt"] === "immediately") {
      setInterruptionReasonDraft("");
      setReasonModalPurpose("record");
      setInterruptionReasonOpen(true);
    }
  };
  const resumeInterruption = () => {
    if (preferences["interruptions.reasonPrompt"] === "resume" && !useTodayStore.getState().interruptionReason) {
      setInterruptionReasonDraft("");
      setReasonModalPurpose("resume");
      setInterruptionReasonOpen(true);
    } else {
      void resumeFocus();
    }
  };
  const finish = () => {
    setCompletionError("");
    setFinishOpen(true);
  };

  const submitCompletion = async () => {
    const summary = completionNote.trim();
    if (!summary) {
      setCompletionError("Add a quick summary of what you worked on.");
      return;
    }
    setCompleting(true);
    setCompletionError("");
    try {
      await completeSession(summary);
      setCompletionNote("");
      setFinishOpen(false);
    } catch (error) {
      setCompletionError(error instanceof Error ? error.message : String(error));
    } finally {
      setCompleting(false);
    }
  };

  useEffect(() => {
    const interruptFromShortcut = () => void beginInterruption();
    const switchFromShortcut = () => setTaskPickerOpen(true);
    const finishFromShortcut = () => finish();
    window.addEventListener("flowo:interrupt", interruptFromShortcut);
    window.addEventListener("flowo:switch-task", switchFromShortcut);
    window.addEventListener("flowo:finish-focus", finishFromShortcut);
    return () => {
      window.removeEventListener("flowo:interrupt", interruptFromShortcut);
      window.removeEventListener("flowo:switch-task", switchFromShortcut);
      window.removeEventListener("flowo:finish-focus", finishFromShortcut);
    };
  });

  if (mode === "idle" || !task) {
    return <><IdleFocusCard onPick={() => setTaskPickerOpen(true)} durationPresets={preferences["focus.quickDurations"]} /><TaskPicker open={taskPickerOpen} onClose={() => setTaskPickerOpen(false)} /></>;
  }

  const durationItems = [
    ...preferences["focus.quickDurations"].map((minutes) => ({ label: `${minutes} minutes`, onSelect: () => setDuration(minutes) })),
    { label: "Custom…", onSelect: () => setCustomDurationOpen(true) },
  ];

  return (
    <>
      <Card className={`focus-card focus-card--${mode}`}>
        <div className="focus-card__main">
          <div className="focus-card__timer">
            <FocusTimer remainingSeconds={remainingSeconds} totalSeconds={totalSeconds} mode={mode} interruptionSeconds={interruptionSeconds}>
              <CurrentTaskHeader task={task} onEdit={() => setTaskPickerOpen(true)} mode={mode} />
            </FocusTimer>
            {mode === "interrupted" ? (
              <Badge className="interruption-prompt"><Zap size={13} /> {preferences["interruptions.reasonPrompt"] === "immediately" ? "Interruption reason can be recorded now" : preferences["interruptions.reasonPrompt"] === "resume" ? "Reason requested when you resume" : "No interruption reason required"}</Badge>
            ) : (
              <Dropdown
                label={<Button tone="subtle" size="sm"><Clock3 size={14} /> Change Duration <ChevronDown size={14} /></Button>}
                items={durationItems}
              />
            )}
          </div>
          <FocusControls
            mode={mode}
            onPause={togglePause}
            onStart={startFocus}
            onInterrupt={() => void beginInterruption()}
            onResume={resumeInterruption}
            onSwitch={() => setTaskPickerOpen(true)}
            onFinish={finish}
            onCancel={() => setCancelOpen(true)}
          />
        </div>
        <div className="focus-card__footer">
          <DurationSelector selected={selectedDuration} presets={preferences["focus.quickDurations"]} onSelect={setDuration} onCustom={() => setCustomDurationOpen(true)} />
          <div className="session-meta"><Badge>Session</Badge><span>Auto-tracking: On <i /></span></div>
        </div>
      </Card>

      <TaskPicker open={taskPickerOpen} onClose={() => setTaskPickerOpen(false)} preserveSession />
      <CustomDurationModal open={customDurationOpen} selected={selectedDuration} onSelect={setDuration} onClose={() => setCustomDurationOpen(false)} />
      <Modal open={interruptionReasonOpen} title="What interrupted you?" onClose={() => setInterruptionReasonOpen(false)}>
        <p className="modal-description">{reasonModalPurpose === "resume" ? "Optionally add a reason before returning to your focus session." : "Optionally record what pulled you away while the interruption keeps running."}</p>
        <div className="interruption-reason-options" role="group" aria-label="Common interruption reasons">
          {interruptionPresets.map((item) => (
            <Pill key={item} selected={interruptionReasonDraft === item} onClick={() => setInterruptionReasonDraft(item)}>{item}</Pill>
          ))}
        </div>
        <div className="interruption-reason-field">
          <label htmlFor="interruption-reason">Or type another reason</label>
          <Input id="interruption-reason" value={interruptionReasonDraft} onChange={(event) => setInterruptionReasonDraft(event.target.value)} placeholder="What pulled you away?" />
        </div>
        <div className="modal-actions">
          <Button onClick={() => { if (reasonModalPurpose === "resume") void resumeFocus(); setInterruptionReasonOpen(false); }}>{reasonModalPurpose === "resume" ? "Resume without reason" : "Keep interruption running"}</Button>
          <Button tone="orange" disabled={!interruptionReasonDraft.trim()} onClick={() => { setReason(interruptionReasonDraft.trim()); if (reasonModalPurpose === "resume") void resumeFocus(); setInterruptionReasonOpen(false); }}>{reasonModalPurpose === "resume" && <Play size={16} fill="currentColor" />} {reasonModalPurpose === "resume" ? "Save reason & resume" : "Save reason"}</Button>
        </div>
      </Modal>
      <Modal open={finishOpen} title={remainingSeconds === 0 ? "Complete focus session" : "Finish this session early?"} onClose={() => { if (!completing) setFinishOpen(false); }}>
        <p className="modal-description">Before finishing, capture what you did in one or two sentences. This summary is saved with the session and appears in your work history.</p>
        <label className="completion-note-field" htmlFor="completion-note">
          <span>Session summary <em>Required</em></span>
          <textarea
            id="completion-note"
            value={completionNote}
            onChange={(event) => { setCompletionNote(event.target.value); if (completionError) setCompletionError(""); }}
            onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void submitCompletion(); } }}
            placeholder="Finished JWT refresh handling and reviewed the API changes."
            rows={3}
            maxLength={280}
            aria-invalid={Boolean(completionError)}
            aria-describedby={completionError ? "completion-note-error completion-note-help" : "completion-note-help"}
            disabled={completing}
            autoFocus
          />
          <span className="completion-note-field__meta" id="completion-note-help"><small>Keep it brief · Ctrl+Enter to finish</small><small>{completionNote.length}/280</small></span>
          {completionError && <small className="completion-note-field__error" id="completion-note-error" role="alert">{completionError}</small>}
        </label>
        <div className="modal-actions">
          <Button disabled={completing} onClick={() => setFinishOpen(false)}>Keep focusing</Button>
          <Button tone="primary" disabled={completing || !completionNote.trim()} onClick={() => void submitCompletion()}><Check size={17} /> {completing ? "Saving…" : "Finish session"}</Button>
        </div>
      </Modal>
      <Modal open={cancelOpen} title="Cancel active work?" onClose={() => setCancelOpen(false)}>
        <p className="modal-description">Tracked activity will be closed and the session marked cancelled. The task itself will not be cancelled.</p>
        <div className="modal-actions">
          <Button onClick={() => setCancelOpen(false)}>Keep session</Button>
          <Button tone="subtle" onClick={() => { cancelSession(); setCancelOpen(false); }}><X size={17} /> Cancel work</Button>
        </div>
      </Modal>
    </>
  );
}
