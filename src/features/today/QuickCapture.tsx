import { ListChecks, Play, Repeat2, Zap } from "lucide-react";
import { Button, Input } from "../../cdk";
import { useTodayStore } from "./store";

export function QuickCapture() {
  const draft = useTodayStore((state) => state.quickCaptureDraft);
  const setDraft = useTodayStore((state) => state.setQuickCaptureDraft);
  const captureTask = useTodayStore((state) => state.captureTask);
  const interrupt = useTodayStore((state) => state.interrupt);
  const mode = useTodayStore((state) => state.mode);
  const activeSession = mode === "focusing" || mode === "paused" || mode === "interrupted";
  const openTaskPicker = () => window.dispatchEvent(new Event("flowo:switch-task"));

  return (
    <form className={`quick-action-bar ${activeSession ? "is-switching" : ""}`} aria-label={activeSession ? "Create a task and switch focus" : "Quick capture a task"} onSubmit={(event) => { event.preventDefault(); void captureTask(true); }}>
      <div className="quick-action-bar__label">{activeSession ? <Repeat2 size={18} /> : <Zap size={18} fill="currentColor" />}<strong>{activeSession ? "Quick Switch" : "Quick Capture"}</strong><kbd>Ctrl K</kbd></div>
      <Input
        id="quick-capture-input"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={activeSession ? "New task to switch to…" : "What do you want to work on?"}
        aria-label={activeSession ? "Name a new task and switch to it" : "What do you want to work on?"}
      />
      <Button tone="primary" type="submit" disabled={!draft.trim()}>{activeSession ? <Repeat2 size={15} /> : <Play size={15} fill="currentColor" />} {activeSession ? "Create & Switch" : "Create & Focus"}</Button>
      <Button type="button" onClick={openTaskPicker}><ListChecks size={15} /> Choose Existing</Button>
      <Button type="button" onClick={interrupt} disabled={mode === "idle" || mode === "interrupted"}><Zap size={15} fill="currentColor" /> Interrupt</Button>
    </form>
  );
}
