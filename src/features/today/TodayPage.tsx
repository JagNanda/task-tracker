import { useEffect, useState } from "react";
import { AppSidebar, MobileNavigation } from "./AppSidebar";
import { CurrentTaskNotes } from "./CurrentTaskNotes";
import { FocusSessionCard } from "./FocusSessionCard";
import { QuickActionBar } from "./QuickActionBar";
import { RightRail } from "./RightRail";
import { TodayHeader } from "./TodayHeader";
import { TodayTimeline } from "./TodayTimeline";
import { useTodayStore } from "./store";
import { settingsService } from "../../data/services/settingsService";
import { RemindersDialog } from "../reminders/RemindersDialog";
import { useTaskStore } from "../tasks/taskStore";

export function TodayPage({ onNavigate }: { onNavigate?: (label: string) => void }) {
  const initialize = useTodayStore((state) => state.initialize);
  const refreshDashboard = useTodayStore((state) => state.refreshDashboard);
  const mode = useTodayStore((state) => state.mode);
  const togglePause = useTodayStore((state) => state.togglePause);
  const [shortcutsEnabled, setShortcutsEnabled] = useState(true);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const tasks = useTaskStore((state) => state.tasks);

  useEffect(() => {
    void initialize();
    void settingsService.get<boolean>("shortcuts.enabled").then((enabled) => setShortcutsEnabled(enabled ?? true));
  }, [initialize]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!shortcutsEnabled) return;
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable || target.closest("[contenteditable='true']")) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.getElementById("quick-capture-input")?.focus();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey || document.querySelector("[role='dialog']")) return;
      const key = event.key.toLowerCase();
      if (event.code === "Space" && (mode === "focusing" || mode === "paused")) {
        event.preventDefault();
        void togglePause();
      } else if (key === "i" && mode === "focusing") {
        window.dispatchEvent(new Event("flowo:interrupt"));
      } else if (key === "t" && mode !== "idle" && mode !== "break") {
        window.dispatchEvent(new Event("flowo:switch-task"));
      } else if (key === "f" && mode !== "idle" && mode !== "ready" && mode !== "break") {
        window.dispatchEvent(new Event("flowo:finish-focus"));
      } else if (key === "n") {
        onNavigate?.("Tasks");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, onNavigate, shortcutsEnabled, togglePause]);

  return (
    <div className="app-shell">
      <AppSidebar selected="Today" onNavigate={onNavigate} />
      <main className="today-page">
        <TodayHeader onEndDay={() => onNavigate?.("Reports")} />
        <div className="today-grid">
          <div className="today-primary">
            <FocusSessionCard onOpenSettings={() => { window.sessionStorage.setItem("flowo:settings-section", "focus"); onNavigate?.("Settings"); }} />
            <CurrentTaskNotes />
            <TodayTimeline />
          </div>
          <RightRail onNavigate={onNavigate} onOpenReminders={() => setRemindersOpen(true)} />
        </div>
      </main>
      <QuickActionBar />
      <MobileNavigation selected="Today" onNavigate={onNavigate} />
      <RemindersDialog
        open={remindersOpen}
        tasks={tasks.filter((task) => task.status === "in-progress" || task.status === "todo" || task.status === "blocked").map((task) => ({ id: task.id, title: task.title }))}
        onClose={() => setRemindersOpen(false)}
        onChanged={refreshDashboard}
      />
    </div>
  );
}
