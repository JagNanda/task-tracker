import { isDesktopRuntime } from "./database";
import { useReportStore } from "../features/reports/reportStore";
import { useTaskNotesStore } from "../features/tasks/notesStore";
import { useTaskStore } from "../features/tasks/taskStore";
import { setTimelineTasks, useTimelineStore } from "../features/timeline/timelineStore";
import { useTodayStore } from "../features/today/store";
import { settingsService } from "./services/settingsService";
import { applyAppTheme } from "../theme";

let bootstrapPromise: Promise<void> | null = null;

export function bootstrapApplicationData(force = false) {
  if (!isDesktopRuntime()) return Promise.resolve();
  if (force) bootstrapPromise = null;
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    await Promise.all([
      useTaskStore.getState().load(),
      useTimelineStore.getState().load(),
      useReportStore.getState().load(),
    ]);
    const [accent, background] = await Promise.all([
      settingsService.get<string>("appearance.accent"),
      settingsService.get<string>("appearance.background"),
    ]);
    if (accent && background) applyAppTheme(background, accent);
    const tasks = useTaskStore.getState().tasks;
    setTimelineTasks(tasks.map((task) => ({ id: task.id, title: task.title, context: task.context, description: task.description })));
    await Promise.all([
      useTaskNotesStore.getState().loadTasks(tasks.map((task) => task.id)),
      useTodayStore.getState().initialize(),
    ]);
  })().catch((error) => {
    bootstrapPromise = null;
    throw error;
  });
  return bootstrapPromise;
}
