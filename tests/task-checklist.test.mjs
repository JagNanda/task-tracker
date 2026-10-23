import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { after, beforeEach, test } from "node:test";
import { createServer } from "vite";

// Runs the real checklist store and repositories against an in-memory SQLite database built from the
// app's own migrations. Only the Tauri IPC boundary is replaced.
let DatabaseSync = null;
try {
  ({ DatabaseSync } = await import("node:sqlite"));
} catch {
  DatabaseSync = null;
}
const skip = DatabaseSync ? false : "node:sqlite is not available in this Node.js version";

let db;
let failNextWrite = false;
const migrationsDirectory = new URL("../src-tauri/migrations/", import.meta.url);
const sqlValue = (value) => (typeof value === "boolean" ? Number(value) : value);

// The app's SQL uses numbered placeholders (?1, ?2, ...), which Rust binds by position. Node's
// sqlite only binds those positionally from Node 24 on, so rename them to :p1, :p2, ... and bind by
// name, which works on every Node version that has node:sqlite.
function prepare(sql, params) {
  const values = params.map(sqlValue);
  if (!/\?\d+/.test(sql)) return { statement: db.prepare(sql), bind: values };
  const named = Object.fromEntries(values.map((value, index) => [`:p${index + 1}`, value]));
  return { statement: db.prepare(sql.replace(/\?(\d+)/g, ":p$1")), bind: [named] };
}

globalThis.window ??= globalThis;
window.__TAURI_INTERNALS__ = {
  invoke: async (command, args) => {
    const { statement, bind } = prepare(args.sql, args.params ?? []);
    if (command === "database_select") return statement.all(...bind);
    if (command === "database_execute") {
      if (failNextWrite) {
        failNextWrite = false;
        throw new Error("disk is full");
      }
      return { rowsAffected: Number(statement.run(...bind).changes) };
    }
    throw new Error(`Unexpected Tauri command in test: ${command}`);
  },
};

// ws: false so this server doesn't fight the other test file's server for Vite's HMR port.
const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: "custom", logLevel: "error", optimizeDeps: { noDiscovery: true } });
after(() => server.close());
const load = (path) => server.ssrLoadModule(`/src/${path}`);
const { useChecklistStore } = await load("features/tasks/checklistStore.ts");
const { useTaskStore } = await load("features/tasks/taskStore.ts");
const { taskRepository } = await load("data/repositories/taskRepository.ts");
const { planChecklistSync } = await load("data/repositories/taskChecklistRepository.ts");
const { checklistLinesFromText } = await load("features/tasks/TaskChecklist.tsx");

const rows = (taskId) => db.prepare("SELECT body, is_completed, sort_order, completed_at FROM task_checklist_items WHERE task_id = ? ORDER BY sort_order").all(taskId).map((row) => ({ ...row }));
const progress = (taskId) => {
  const task = useTaskStore.getState().tasks.find((item) => item.id === taskId);
  return { done: task.checklistDone, total: task.checklistTotal };
};

let taskId;
beforeEach(async () => {
  if (skip) return;
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  for (const file of readdirSync(migrationsDirectory).filter((name) => name.endsWith(".sql")).sort()) {
    db.exec(readFileSync(new URL(file, migrationsDirectory), "utf8"));
  }
  failNextWrite = false;
  useChecklistStore.setState({ itemsByTask: {} });
  taskId = await taskRepository.create({ title: "Ship the release" });
  await useTaskStore.getState().load();
});

test("adding and ticking items persists them and updates the task list progress", { skip }, async () => {
  const store = useChecklistStore.getState();
  await store.addItem(taskId, "Write changelog");
  await store.addItem(taskId, "  Tag the build  ");
  await store.addItem(taskId, "   ");
  const [first] = useChecklistStore.getState().itemsByTask[taskId];
  await store.toggleItem(taskId, first.id);

  assert.deepEqual(rows(taskId).map(({ body, is_completed, sort_order }) => [body, is_completed, sort_order]), [
    ["Write changelog", 1, 0],
    ["Tag the build", 0, 1],
  ]);
  assert.ok(rows(taskId)[0].completed_at !== null);
  assert.deepEqual(progress(taskId), { done: 1, total: 2 });

  await useTaskStore.getState().load();
  assert.deepEqual(progress(taskId), { done: 1, total: 2 }, "progress also comes back from the task query");

  await store.toggleItem(taskId, first.id);
  assert.equal(rows(taskId)[0].completed_at, null);
  assert.deepEqual(progress(taskId), { done: 0, total: 2 });
});

test("ticking the last item does not complete the task", { skip }, async () => {
  const store = useChecklistStore.getState();
  await store.addItem(taskId, "Only step");
  await store.toggleItem(taskId, useChecklistStore.getState().itemsByTask[taskId][0].id);
  await useTaskStore.getState().load();
  const task = useTaskStore.getState().tasks.find((item) => item.id === taskId);
  assert.equal(task.status, "todo");
  assert.deepEqual(progress(taskId), { done: 1, total: 1 });
});

test("items can be reordered, renamed and removed", { skip }, async () => {
  const store = useChecklistStore.getState();
  for (const body of ["One", "Two", "Three"]) await store.addItem(taskId, body);
  const [one, two, three] = useChecklistStore.getState().itemsByTask[taskId];

  await store.moveItem(taskId, one.id, 1);
  await store.moveItem(taskId, one.id, 1);
  await store.moveItem(taskId, one.id, 1); // already last: no-op
  await store.renameItem(taskId, two.id, "Two (renamed)");
  await store.removeItem(taskId, three.id);

  assert.deepEqual(rows(taskId).map((row) => row.body), ["Two (renamed)", "One"]);
  const reloaded = await store.loadTask(taskId);
  assert.deepEqual(reloaded.map((item) => item.body), ["Two (renamed)", "One"]);
  assert.deepEqual(progress(taskId), { done: 0, total: 2 });
});

test("the task form saves a whole edited checklist in one go", { skip }, async () => {
  const store = useChecklistStore.getState();
  for (const body of ["Keep", "Drop", "Rename me"]) await store.addItem(taskId, body);
  const [keep, , rename] = useChecklistStore.getState().itemsByTask[taskId];

  await store.replaceTask(taskId, [
    { id: "check_new", body: "Brand new", completed: true },
    { ...rename, body: "Renamed" },
    { ...keep, completed: true },
    { id: "check_blank", body: "   ", completed: false },
  ]);

  assert.deepEqual(rows(taskId).map(({ body, is_completed }) => [body, is_completed]), [
    ["Brand new", 1],
    ["Renamed", 0],
    ["Keep", 1],
  ]);
  assert.deepEqual(progress(taskId), { done: 2, total: 3 });
});

test("only changed items are written when the form saves", () => {
  const saved = [
    { id: "a", body: "A", is_completed: 0, sort_order: 0 },
    { id: "b", body: "B", is_completed: 1, sort_order: 1 },
    { id: "c", body: "C", is_completed: 0, sort_order: 2 },
  ];
  const plan = planChecklistSync(saved, [
    { id: "a", body: "A", completed: false },
    { id: "c", body: "C", completed: true },
    { id: "d", body: " D ", completed: false },
  ]);
  assert.deepEqual(plan.deletes, ["b"]);
  assert.deepEqual(plan.updates.map(({ id, sortOrder, completed }) => [id, sortOrder, completed]), [["c", 1, true]]);
  assert.deepEqual(plan.inserts.map(({ id, body, sortOrder }) => [id, body, sortOrder]), [["d", "D", 2]]);
});

test("a failed write puts back what is actually saved", { skip }, async () => {
  const store = useChecklistStore.getState();
  await store.addItem(taskId, "Fragile");
  const [item] = useChecklistStore.getState().itemsByTask[taskId];

  failNextWrite = true;
  await assert.rejects(store.toggleItem(taskId, item.id), /disk is full/);
  assert.equal(useChecklistStore.getState().itemsByTask[taskId][0].completed, false);
  assert.deepEqual(progress(taskId), { done: 0, total: 1 });
});

test("pasted lists become one item per line", () => {
  assert.deepEqual(checklistLinesFromText("- [ ] Write tests\n- [x] Fix bug\n\n* Deploy\n1. Announce\nPlain line"), [
    "Write tests",
    "Fix bug",
    "Deploy",
    "Announce",
    "Plain line",
  ]);
});
