import { useEffect, useState } from "react";
import { TasksPage } from "./features/tasks/TasksPage";
import { TimelinePage } from "./features/timeline/TimelinePage";
import { TodayPage } from "./features/today/TodayPage";
import { ReportsPage } from "./features/reports/ReportsPage";
import { bootstrapApplicationData } from "./data/bootstrap";
import { SettingsPage } from "./features/settings/SettingsPage";
import { InsightsPage } from "./features/insights/InsightsPage";

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

  useEffect(() => {
    void bootstrapApplicationData().catch((error) => console.error("Failed to initialize Flowo data", error));
  }, []);

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

  if (page === "Today") return <TodayPage onNavigate={navigate} />;
  if (page === "Timeline") return <TimelinePage onNavigate={navigate} />;
  if (page === "Reports") return <ReportsPage onNavigate={navigate} />;
  if (page === "Insights") return <InsightsPage onNavigate={navigate} />;
  if (page === "Settings") return <SettingsPage onNavigate={navigate} />;
  return <TasksPage onNavigate={navigate} />;
}
