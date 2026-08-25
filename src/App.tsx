import { useCallback, useEffect, useState } from "react";
import { TasksPage } from "./features/tasks/TasksPage";
import { TimelinePage } from "./features/timeline/TimelinePage";
import { TodayPage } from "./features/today/TodayPage";
import { ReportsPage } from "./features/reports/ReportsPage";
import { bootstrapApplicationData } from "./data/bootstrap";
import { SettingsPage } from "./features/settings/SettingsPage";
import { InsightsPage } from "./features/insights/InsightsPage";
import { useTodayStore } from "./features/today/store";
import { ReminderScheduler } from "./features/reminders/ReminderScheduler";
import { FocusExpiryDialog } from "./features/today/FocusExpiryDialog";
import { isDesktopRuntime } from "./data/database";

type Page = "Today" | "Tasks" | "Timeline" | "Reports" | "Insights" | "Settings";

function pageFromPath(): Page {
  const path = window.location.pathname.toLowerCase();
  if (path.startsWith("/today")) return "Today";
  if (path.startsWith("/timeline")) return "Timeline";
  if (path.startsWith("/reports")) return "Reports";
  if (path.startsWith("/insights")) return "Insights";
  if (path.startsWith("/settings")) return "Settings";
  return "Tasks";
}

export default function App() {
  const [page, setPage] = useState<Page>(pageFromPath);
  const [ready, setReady] = useState(false);
  const tick = useTodayStore((state) => state.tick);

  useEffect(() => {
    void bootstrapApplicationData()
      .then(() => setReady(true))
      .catch((error) => console.error("Failed to initialize Flowo data", error));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [tick]);

  useEffect(() => {
    const path = page === "Today" ? "/today" : page === "Timeline" ? "/timeline" : page === "Reports" ? "/reports" : page === "Insights" ? "/insights" : page === "Settings" ? "/settings" : "/tasks";
    if (window.location.pathname !== path) window.history.replaceState({}, "", path);
  }, [page]);

  useEffect(() => {
    const onPopState = () => setPage(pageFromPath());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = (label: string) => {
    if (label === "Today" || label === "Tasks" || label === "Timeline" || label === "Reports" || label === "Insights" || label === "Settings") setPage(label);
  };

  const openReminderTask = useCallback((taskId: string, behavior: "popup" | "tasks") => {
    if (behavior === "popup") {
      window.sessionStorage.setItem("flowo:tasks-open", taskId);
      window.sessionStorage.removeItem("flowo:tasks-reveal");
    } else {
      window.sessionStorage.setItem("flowo:tasks-reveal", taskId);
      window.sessionStorage.removeItem("flowo:tasks-open");
    }
    window.dispatchEvent(new CustomEvent("flowo:open-task", { detail: { taskId, behavior } }));
    setPage("Tasks");
  }, []);

  const content = page === "Today" ? <TodayPage onNavigate={navigate} />
    : page === "Timeline" ? <TimelinePage onNavigate={navigate} />
      : page === "Reports" ? <ReportsPage onNavigate={navigate} />
        : page === "Insights" ? <InsightsPage onNavigate={navigate} />
          : page === "Settings" ? <SettingsPage onNavigate={navigate} />
            : <TasksPage onNavigate={navigate} />;

  return <>
    {content}
    <FocusExpiryDialog />
    <ReminderScheduler enabled={ready && isDesktopRuntime()} onOpenTask={openReminderTask} />
  </>;
}
