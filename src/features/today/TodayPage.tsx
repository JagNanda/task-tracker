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

export function TodayPage({ onNavigate }: { onNavigate?: (label: string) => void }) {
  const tick = useTodayStore((state) => state.tick);
  const initialize = useTodayStore((state) => state.initialize);
  const mode = useTodayStore((state) => state.mode);
  const togglePause = useTodayStore((state) => state.togglePause);
  const [shortcutsEnabled, setShortcutsEnabled] = useState(true);

  useEffect(() => {
    void initialize();
    void settingsService.get<boolean>("shortcuts.enabled").then((enabled) => setShortcutsEnabled(enabled ?? true));
  }, [initialize]);

  useEffect(() => {
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [tick]);

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
      } else if (key === "t" && mode !== "idle") {
        window.dispatchEvent(new Event("flowo:switch-task"));
      } else if (key === "f" && mode !== "idle" && mode !== "ready") {
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
            <FocusSessionCard />
            <CurrentTaskNotes />
            <TodayTimeline />
          </div>
          <RightRail />
        </div>
      </main>
      <QuickActionBar />
      <MobileNavigation selected="Today" onNavigate={onNavigate} />
    </div>
  );
}
