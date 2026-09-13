import { Check, TimerReset } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Modal, Pill } from "../../cdk";
import { sessionNoteRepository } from "../../data/repositories/sessionNoteRepository";
import { settingsService } from "../../data/services/settingsService";
import { defaultSettings, type SettingsState } from "../settings/settingsDefaults";
import { useTodayStore } from "./store";

export function FocusExpiryDialog() {
  const mode = useTodayStore((state) => state.mode);
  const selectedDuration = useTodayStore((state) => state.selectedDuration);
  const task = useTodayStore((state) => state.currentTask);
  const sessionId = useTodayStore((state) => state.sessionId);
  const completionHeld = useTodayStore((state) => state.completionHeld);
  const completeSession = useTodayStore((state) => state.completeSession);
  const extendSession = useTodayStore((state) => state.extendSession);
  const timerTransitioning = useTodayStore((state) => state.timerTransitioning);
  const [summary, setSummary] = useState("");
  const [recentSummaries, setRecentSummaries] = useState<string[]>([]);
  const [extensionMinutes, setExtensionMinutes] = useState(selectedDuration);
  const [preferences, setPreferences] = useState<SettingsState>({ ...defaultSettings, "focus.quickDurations": [...defaultSettings["focus.quickDurations"]], "reminders.snoozeOptions": [...defaultSettings["reminders.snoozeOptions"]] });
  const [busy, setBusy] = useState<"complete" | "extend" | null>(null);
  const [error, setError] = useState("");
  const open = mode === "paused" && completionHeld && Boolean(sessionId);
  const disabled = Boolean(busy) || timerTransitioning;

  useEffect(() => {
    void settingsService.all().then(setPreferences);
  }, []);

  useEffect(() => {
    if (!open) return;
    setSummary("");
    setError("");
    setExtensionMinutes(selectedDuration);
    if (!task) {
      setRecentSummaries([]);
      return;
    }
    let current = true;
    void sessionNoteRepository.listRecentForTask(task.id)
      .then((notes) => { if (current) setRecentSummaries(notes.map((note) => note.body)); })
      .catch(() => { if (current) setRecentSummaries([]); });
    return () => { current = false; };
  }, [open, selectedDuration, sessionId, task]);

  const finish = async () => {
    if (disabled) return;
    const value = summary.trim();
    if (!value && preferences["focus.requireCompletionNote"]) {
      setError("Add a quick summary of what you worked on.");
      return;
    }
    setBusy("complete");
    setError("");
    try {
      await completeSession(value);
    } catch (completionError) {
      setError(completionError instanceof Error ? completionError.message : String(completionError));
    } finally {
      setBusy(null);
    }
  };

  const continueFocusing = async () => {
    if (disabled) return;
    setBusy("extend");
    setError("");
    try {
      await extendSession(extensionMinutes);
    } catch (extensionError) {
      setError(extensionError instanceof Error ? extensionError.message : String(extensionError));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open={open} title="Break complete — what’s next?" onClose={() => {}} dismissible={false} className="focus-expiry-modal">
      <div className="focus-expiry-dialog">
        <p className="modal-description">Your break is over{task ? ` for ${task.title}` : ""}. Continue focusing in this session, or add a summary and finish. Tracking stays paused until you choose.</p>
        <label className="completion-note-field" htmlFor="global-completion-note">
          <span>Session summary {preferences["focus.requireCompletionNote"] && <em>Required</em>}</span>
          <textarea
            id="global-completion-note"
            value={summary}
            onChange={(event) => { setSummary(event.target.value); setError(""); }}
            onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void finish(); } }}
            placeholder="What did you accomplish?"
            rows={3}
            maxLength={280}
            autoFocus
            disabled={disabled}
          />
          <span className="completion-note-field__meta"><small>Ctrl+Enter to finish</small><small>{summary.length}/280</small></span>
          {error && <small className="completion-note-field__error" role="alert">{error}</small>}
        </label>
        {recentSummaries.length > 0 && <div className="completion-note-recent"><span>Use a recent summary</span><div>{recentSummaries.map((item) => <button className={summary === item ? "is-selected" : ""} type="button" key={item} onClick={() => setSummary(item)} title={item}>{item}</button>)}</div></div>}
        <div className="completion-extension">
          <span>Continue focusing for</span>
          <div>{preferences["focus.quickDurations"].map((minutes) => <Pill key={minutes} disabled={disabled} selected={extensionMinutes === minutes} onClick={() => setExtensionMinutes(minutes)}>{minutes}m</Pill>)}</div>
        </div>
        <div className="modal-actions">
          <Button disabled={disabled} onClick={() => void continueFocusing()}><TimerReset size={15} /> {busy === "extend" ? "Resuming…" : `Continue · ${extensionMinutes}m`}</Button>
          <Button tone="primary" disabled={disabled || (preferences["focus.requireCompletionNote"] && !summary.trim())} onClick={() => void finish()}><Check size={16} /> {busy === "complete" ? "Saving…" : "Finish session"}</Button>
        </div>
      </div>
    </Modal>
  );
}
