import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { createServer } from "vite";

// Load the actual store through Vite; replace only persistence and OS boundaries.
const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
after(() => server.close());
const load = (path) => server.ssrLoadModule(`/src/${path}`);
const { useTodayStore: store } = await load("features/today/store.ts");
const { focusService } = await load("data/services/focusService.ts");
const { taskRepository } = await load("data/repositories/taskRepository.ts");
const { breakService } = await load("data/services/breakService.ts");
const { settingsService } = await load("data/services/settingsService.ts");
const { defaultSettings } = await load("features/settings/settingsDefaults.ts");
const { useTaskStore } = await load("features/tasks/taskStore.ts");
const { useTimelineStore } = await load("features/timeline/timelineStore.ts");
const initial = store.getState();
const task = { id: "task", title: "Test task", category: "General", tag: "Test", duration: "0m", color: "blue" };
const epoch = 1_000_000;
let now, session, activeBreak, settings, calls;
const snapshot = () => ({ ...session, intervalDurationSeconds: session.targetDurationSeconds - Math.ceil(session.focusedMillisecondsBeforeInterval / 1000), calculatedAt: now, focusedMilliseconds: session.focusedMilliseconds + (session.openActivity?.type === "focus" ? now - session.openActivity.startedAt : 0) });

beforeEach((context) => {
  now = epoch;
  context.mock.method(Date, "now", () => now);
  settings = { ...defaultSettings, "notifications.focusSound": false, "notifications.breakSound": false, "notifications.focusComplete": false };
  settingsService.all = async () => settings;
  settingsService.set = async (key, value) => { settings[key] = value; };
  useTaskStore.setState({ load: async () => {}, tasks: [{ id: task.id, title: task.title, context: "Test / General", totalMinutes: 0, status: "in-progress" }] });
  useTimelineStore.setState({ load: async () => {}, entries: [] });
  store.setState(initial, true);
  calls = { start: 0, finishBreak: [], complete: [] };
  activeBreak = null;
  session = { sessionId: "session", status: "active", currentTaskId: task.id, targetDurationSeconds: 1500, focusedMillisecondsBeforeInterval: 0, startedAt: epoch, endedAt: null, focusedMilliseconds: 0, calculatedAt: epoch, openActivity: { type: "focus", id: "work", startedAt: epoch, taskId: task.id, presetId: null, note: null, targetDurationSeconds: null } };
  focusService.restore = async () => session.status === "completed" ? null : snapshot();
  focusService.startBreak = async (id, duration, startedAt = now) => {
    assert.equal(id, "session");
    calls.start++;
    session.focusedMilliseconds += session.openActivity?.type === "focus" ? startedAt - session.openActivity.startedAt : 0;
    activeBreak = { id: `break-${calls.start}`, focus_session_id: id, started_at: startedAt, ended_at: null, target_duration_seconds: duration };
    session.status = "paused";
    session.openActivity = { type: "break", id: activeBreak.id, startedAt, taskId: null, presetId: null, note: null, targetDurationSeconds: duration };
    return snapshot();
  };
  breakService.restore = async () => activeBreak;
  breakService.finish = async (id, endedAt) => {
    calls.finishBreak.push({ id, endedAt });
    activeBreak = null;
    session.openActivity = null;
  };
  focusService.changeDuration = async (id, seconds) => { session.targetDurationSeconds = seconds; };
  focusService.resumeCompletionHold = async (id, durationSeconds) => {
    assert.equal(session.openActivity, null);
    assert.equal(id, "session");
    session.targetDurationSeconds = Math.ceil(session.focusedMilliseconds / 1000) + durationSeconds;
    session.focusedMillisecondsBeforeInterval = session.focusedMilliseconds;
    session.status = "active";
    session.openActivity = { type: "focus", id: "continued-work", startedAt: now, taskId: task.id, presetId: null, note: null, targetDurationSeconds: null };
    return snapshot();
  };
  focusService.completeFocus = async (id, notes) => {
    calls.complete.push({ id, notes, endedAt: now });
    session.status = "completed";
    session.endedAt = now;
    return snapshot();
  };
});

async function settleTimer() {
  for (let turn = 0; turn < 30; turn++) await Promise.resolve();
  assert.equal(store.getState().timerTransitioning, false);
}

async function expireFocus() {
  await store.getState().initialize();
  now += 1500 * 1000;
  store.getState().tick();
  store.getState().tick();
  await settleTimer();
}

async function expireBreak() {
  now = store.getState().breakEndsAt + 2000;
  store.getState().tick();
  await settleTimer();
}

test("focus expiry starts one break and keeps the session and task open", async () => {
  await expireFocus();
  const state = store.getState();
  assert.equal(state.mode, "break");
  assert.equal(state.sessionId, "session");
  assert.equal(state.currentTask.id, task.id);
  assert.equal(state.remainingSeconds, 300);
  assert.equal(state.completionHeld, false);
  assert.equal(session.endedAt, null);
  assert.equal(calls.start, 1);
  assert.equal(calls.complete.length, 0);
});

test("break expiry asks for a decision and excludes decision time from tracking", async () => {
  await expireFocus();
  const end = store.getState().breakEndsAt;
  await expireBreak();
  assert.equal(store.getState().mode, "paused");
  assert.equal(store.getState().completionHeld, true);
  assert.equal(store.getState().sessionId, "session");
  assert.equal(calls.finishBreak[0].endedAt, end);
  now += 90_000;
  store.getState().tick();
  assert.equal(store.getState().focusedSecondsAtSync, 1500);
  assert.equal(calls.complete.length, 0);
});

test("continue reuses the session for another interval and another automatic break", async () => {
  await expireFocus();
  await expireBreak();
  await store.getState().extendSession(25);
  assert.equal(store.getState().mode, "focusing");
  assert.equal(store.getState().sessionId, "session");
  assert.equal(store.getState().remainingSeconds, 1500);
  assert.equal(store.getState().totalSeconds, 1500);
  assert.equal(store.getState().selectedDuration, 25);
  now += 1500_000;
  store.getState().tick();
  await settleTimer();
  assert.equal(store.getState().mode, "break");
  assert.equal(calls.start, 2);
  assert.equal(session.focusedMilliseconds, 3000_000);
  assert.equal(calls.complete.length, 0);
  await expireBreak();
  assert.equal(store.getState().selectedDuration, 25);
  await store.getState().extendSession(store.getState().selectedDuration);
  assert.equal(store.getState().totalSeconds, 1500);
  assert.equal(store.getState().remainingSeconds, 1500);
});

test("finish saves the note at the user's decision time without starting another break", async () => {
  await expireFocus();
  await expireBreak();
  now += 45_000;
  await store.getState().completeSession("  Finished the feature.  ");
  assert.deepEqual(calls.complete, [{ id: "session", notes: [{ taskId: task.id, body: "Finished the feature." }], endedAt: now }]);
  assert.equal(store.getState().mode, "idle");
  assert.equal(store.getState().sessionId, null);
  assert.equal(calls.start, 1);
});

test("completion and unrelated focus actions cannot bypass an ongoing break", async () => {
  await expireFocus();
  await store.getState().completeSession("Too early");
  await store.getState().extendSession(25);
  await store.getState().togglePause();
  await store.getState().startTask({ ...task, id: "other" });
  assert.equal(store.getState().mode, "break");
  assert.equal(store.getState().currentTask.id, task.id);
  assert.equal(calls.complete.length, 0);
});

test("required summary is enforced only when finishing after a break", async () => {
  await expireFocus();
  await expireBreak();
  await assert.rejects(store.getState().completeSession(" "), /summary is required/);
  assert.equal(store.getState().completionHeld, true);
  assert.equal(store.getState().timerTransitioning, false);
  await store.getState().extendSession(5);
  assert.equal(store.getState().remainingSeconds, 300);
});

test("ending focus and break early still waits for an explicit session decision", async () => {
  await store.getState().initialize();
  now += 120_000;
  await store.getState().requestCompletion();
  assert.equal(store.getState().mode, "break");
  now += 30_000;
  await store.getState().endBreak();
  assert.equal(store.getState().completionHeld, true);
  await store.getState().extendSession(5);
  assert.equal(store.getState().remainingSeconds, 300);
  assert.equal(session.focusedMilliseconds, 120_000);
});

test("restart restores an ongoing break with its original task and deadline", async () => {
  await expireFocus();
  const deadline = store.getState().breakEndsAt;
  now += 60_000;
  store.setState(initial, true);
  await store.getState().initialize();
  assert.equal(store.getState().mode, "break");
  assert.equal(store.getState().breakEndsAt, deadline);
  assert.equal(store.getState().remainingSeconds, 240);
  assert.equal(store.getState().sessionId, "session");
  assert.equal(calls.finishBreak.length, 0);
});

test("restart after both timers expired caps focus and break at their deadlines", async () => {
  now += 1900_000;
  await store.getState().initialize();
  assert.equal(store.getState().completionHeld, true);
  assert.equal(session.focusedMilliseconds, 1500_000);
  assert.equal(calls.finishBreak[0].endedAt, epoch + 1800_000);
  assert.equal(calls.complete.length, 0);
});

test("restart preserves the unanswered post-break choice", async () => {
  await expireFocus();
  await expireBreak();
  store.setState(initial, true);
  now += 120_000;
  await store.getState().initialize();
  assert.equal(store.getState().completionHeld, true);
  assert.equal(store.getState().sessionId, "session");
  assert.equal(calls.start, 1);
});

test("a failed break save leaves the timer retryable and the session open", async () => {
  await expireFocus();
  const finish = breakService.finish;
  breakService.finish = async () => { throw new Error("save failed"); };
  await assert.rejects(store.getState().endBreak(), /save failed/);
  assert.equal(store.getState().mode, "break");
  assert.equal(store.getState().timerTransitioning, false);
  breakService.finish = finish;
  await expireBreak();
  assert.equal(store.getState().completionHeld, true);
});

test("continued interval restores its chosen duration instead of the default or cumulative target", async () => {
  await expireFocus();
  await expireBreak();
  await store.getState().extendSession(25);
  now += 5 * 60_000;
  settings["focus.defaultDuration"] = 50;
  settings["focus.rememberLastDuration"] = false;
  store.setState(initial, true);
  await store.getState().initialize();
  assert.equal(store.getState().selectedDuration, 25);
  assert.equal(store.getState().totalSeconds, 1500);
  assert.equal(store.getState().remainingSeconds, 1200);
  store.getState().tick();
  assert.equal(store.getState().remainingSeconds, 1200);
});

test("changing a continued interval duration leaves prior focus time out of the countdown", async () => {
  await expireFocus();
  await expireBreak();
  await store.getState().extendSession(25);
  now += 5 * 60_000;
  store.getState().setDuration(50);
  assert.equal(store.getState().remainingSeconds, 45 * 60);
  await store.getState().initialize();
  assert.equal(store.getState().selectedDuration, 50);
  assert.equal(store.getState().remainingSeconds, 45 * 60);
  store.getState().setDuration(25);
  store.getState().tick();
  assert.equal(store.getState().remainingSeconds, 20 * 60);
});

test("continuing after an early break starts an exact interval even with fractional focus seconds", async () => {
  await store.getState().initialize();
  now += 123_456;
  await store.getState().requestCompletion();
  await expireBreak();
  await store.getState().extendSession(25);
  assert.equal(store.getState().totalSeconds, 1500);
  assert.equal(store.getState().remainingSeconds, 1500);
  now += 1500_000;
  store.getState().tick();
  await settleTimer();
  assert.equal(store.getState().mode, "break");
  assert.equal(session.focusedMilliseconds, 1623_456);
});

test("all open tasks are selectable beyond the six recent tasks", async () => {
  const record = useTaskStore.getState().tasks[0];
  useTaskStore.setState({ tasks: [
    ...Array.from({ length: 8 }, (_, index) => ({ ...record, id: `existing-${index}` })),
    { ...record, id: "new-task", status: "todo", title: "New task" },
    ...["completed", "cancelled", "archived"].map((status) => ({ ...record, id: status, status })),
  ] });
  await store.getState().refreshDashboard();
  assert.equal(store.getState().recentTasks.length, 6);
  assert.equal(store.getState().availableTasks.length, 9);
  const newTask = store.getState().availableTasks.find((item) => item.id === "new-task");
  assert.ok(newTask);
  store.getState().selectTask(newTask);
  assert.equal(store.getState().currentTask.id, "new-task");
  assert.equal(store.getState().mode, "ready");
});

test("create and focus can select a new task outside the recent task list", async (context) => {
  const record = useTaskStore.getState().tasks[0];
  useTaskStore.setState({ tasks: Array.from({ length: 8 }, (_, index) => ({ ...record, id: `existing-${index}` })) });
  context.mock.method(taskRepository, "create", async (input) => {
    useTaskStore.setState({ tasks: [...useTaskStore.getState().tasks, { ...record, id: "new-task", title: input.title }] });
    return "new-task";
  });
  settings["focus.startBehavior"] = "ask";
  await store.getState().captureTask(true, "Newly created task");
  assert.equal(store.getState().currentTask.id, "new-task");
  assert.equal(store.getState().mode, "ready");
  assert.equal(store.getState().availableTasks.length, 9);
});
