import { createId, execute, nowUtcMs, select } from "../database";

export type TaskChecklistItemRecord = {
  id: string;
  task_id: string;
  body: string;
  is_completed: number;
  sort_order: number;
  completed_at: number | null;
  created_at: number;
  updated_at: number;
};

export type ChecklistDraftItem = {
  id: string;
  body: string;
  completed: boolean;
};

export type ChecklistSyncPlan = {
  inserts: Array<ChecklistDraftItem & { sortOrder: number }>;
  updates: Array<ChecklistDraftItem & { sortOrder: number }>;
  deletes: string[];
};

/** Works out the smallest set of writes that turns the saved checklist into the edited draft list. */
export function planChecklistSync(existing: TaskChecklistItemRecord[], drafts: ChecklistDraftItem[]): ChecklistSyncPlan {
  const saved = new Map(existing.map((item) => [item.id, item]));
  const kept = drafts
    .map((draft) => ({ ...draft, body: draft.body.trim() }))
    .filter((draft) => draft.body.length > 0);
  const keptIds = new Set(kept.map((draft) => draft.id));
  const plan: ChecklistSyncPlan = {
    inserts: [],
    updates: [],
    deletes: existing.filter((item) => !keptIds.has(item.id)).map((item) => item.id),
  };
  kept.forEach((draft, sortOrder) => {
    const current = saved.get(draft.id);
    if (!current) {
      plan.inserts.push({ ...draft, sortOrder });
      return;
    }
    if (current.body !== draft.body || Boolean(current.is_completed) !== draft.completed || current.sort_order !== sortOrder) {
      plan.updates.push({ ...draft, sortOrder });
    }
  });
  return plan;
}

const insertSql = `INSERT INTO task_checklist_items (id, task_id, body, is_completed, sort_order, completed_at, created_at, updated_at)
  VALUES (?1, ?2, ?3, ?4, ?5, CASE WHEN ?4 = 1 THEN ?6 ELSE NULL END, ?6, ?6)`;

export const taskChecklistRepository = {
  list(taskId: string) {
    return select<TaskChecklistItemRecord>(
      `SELECT * FROM task_checklist_items WHERE task_id = ?1 ORDER BY sort_order, created_at, id`,
      [taskId],
    );
  },

  async add(taskId: string, body: string) {
    const id = createId("check");
    await execute(
      `INSERT INTO task_checklist_items (id, task_id, body, is_completed, sort_order, completed_at, created_at, updated_at)
       VALUES (?1, ?2, ?3, 0, (SELECT COALESCE(MAX(sort_order) + 1, 0) FROM task_checklist_items WHERE task_id = ?2), NULL, ?4, ?4)`,
      [id, taskId, body.trim(), nowUtcMs()],
    );
    return id;
  },

  async setCompleted(id: string, completed: boolean) {
    await execute(
      `UPDATE task_checklist_items SET is_completed = ?2,
         completed_at = CASE WHEN ?2 = 1 THEN MAX(created_at, ?3) ELSE NULL END,
         updated_at = MAX(created_at, ?3)
       WHERE id = ?1`,
      [id, completed ? 1 : 0, nowUtcMs()],
    );
  },

  async rename(id: string, body: string) {
    await execute(
      `UPDATE task_checklist_items SET body = ?2, updated_at = MAX(created_at, ?3) WHERE id = ?1`,
      [id, body.trim(), nowUtcMs()],
    );
  },

  async remove(id: string) {
    await execute(`DELETE FROM task_checklist_items WHERE id = ?1`, [id]);
  },

  async reorder(taskId: string, orderedIds: string[]) {
    const now = nowUtcMs();
    for (const [sortOrder, id] of orderedIds.entries()) {
      await execute(
        `UPDATE task_checklist_items SET sort_order = ?3, updated_at = MAX(created_at, ?4)
         WHERE id = ?1 AND task_id = ?2 AND sort_order <> ?3`,
        [id, taskId, sortOrder, now],
      );
    }
  },

  /** Saves a full edited checklist (used by the create / edit task form). */
  async replace(taskId: string, drafts: ChecklistDraftItem[]) {
    const plan = planChecklistSync(await taskChecklistRepository.list(taskId), drafts);
    const now = nowUtcMs();
    for (const id of plan.deletes) await taskChecklistRepository.remove(id);
    for (const item of plan.updates) {
      await execute(
        `UPDATE task_checklist_items SET body = ?2, is_completed = ?3, sort_order = ?4,
           completed_at = CASE WHEN ?3 = 1 THEN COALESCE(completed_at, MAX(created_at, ?5)) ELSE NULL END,
           updated_at = MAX(created_at, ?5)
         WHERE id = ?1`,
        [item.id, item.body, item.completed ? 1 : 0, item.sortOrder, now],
      );
    }
    for (const item of plan.inserts) {
      await execute(insertSql, [item.id, taskId, item.body, item.completed ? 1 : 0, item.sortOrder, now]);
    }
  },
};
