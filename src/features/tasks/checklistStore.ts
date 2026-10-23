import { create } from "zustand";
import {
  taskChecklistRepository,
  type ChecklistDraftItem,
  type TaskChecklistItemRecord,
} from "../../data/repositories/taskChecklistRepository";
import { useTaskStore } from "./taskStore";

export type ChecklistItem = ChecklistDraftItem;

export function checklistProgress(items: ChecklistItem[]) {
  return { done: items.filter((item) => item.completed).length, total: items.length };
}

export function moveChecklistItem<T extends { id: string }>(items: T[], itemId: string, direction: -1 | 1): T[] {
  const index = items.findIndex((item) => item.id === itemId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= items.length) return items;
  const next = items.slice();
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function toChecklistItem(record: TaskChecklistItemRecord): ChecklistItem {
  return { id: record.id, body: record.body, completed: record.is_completed === 1 };
}

type ChecklistState = {
  itemsByTask: Record<string, ChecklistItem[]>;
  loadTask: (taskId: string) => Promise<ChecklistItem[]>;
  addItem: (taskId: string, body: string) => Promise<void>;
  toggleItem: (taskId: string, itemId: string) => Promise<void>;
  renameItem: (taskId: string, itemId: string, body: string) => Promise<void>;
  removeItem: (taskId: string, itemId: string) => Promise<void>;
  moveItem: (taskId: string, itemId: string, direction: -1 | 1) => Promise<void>;
  replaceTask: (taskId: string, drafts: ChecklistItem[]) => Promise<void>;
};

export const useChecklistStore = create<ChecklistState>((set, get) => {
  // Keeps the cached list and the task list's progress badge in step.
  const commit = (taskId: string, items: ChecklistItem[]) => {
    set((state) => ({ itemsByTask: { ...state.itemsByTask, [taskId]: items } }));
    const { done, total } = checklistProgress(items);
    useTaskStore.getState().setChecklistProgress?.(taskId, done, total);
  };

  // Writes are applied optimistically; if one fails, reload what is actually saved and surface the error.
  const persist = async (taskId: string, write: () => Promise<unknown>) => {
    try {
      await write();
    } catch (error) {
      await get().loadTask(taskId).catch(() => undefined);
      throw error;
    }
  };

  const itemsFor = (taskId: string) => get().itemsByTask[taskId] ?? [];

  return {
    itemsByTask: {},

    loadTask: async (taskId) => {
      const items = (await taskChecklistRepository.list(taskId)).map(toChecklistItem);
      commit(taskId, items);
      return items;
    },

    addItem: async (taskId, body) => {
      const text = body.trim();
      if (!text) return;
      const id = await taskChecklistRepository.add(taskId, text);
      commit(taskId, [...itemsFor(taskId), { id, body: text, completed: false }]);
    },

    toggleItem: async (taskId, itemId) => {
      const item = itemsFor(taskId).find((entry) => entry.id === itemId);
      if (!item) return;
      const completed = !item.completed;
      commit(taskId, itemsFor(taskId).map((entry) => entry.id === itemId ? { ...entry, completed } : entry));
      await persist(taskId, () => taskChecklistRepository.setCompleted(itemId, completed));
    },

    renameItem: async (taskId, itemId, body) => {
      const text = body.trim();
      if (!text) return;
      commit(taskId, itemsFor(taskId).map((entry) => entry.id === itemId ? { ...entry, body: text } : entry));
      await persist(taskId, () => taskChecklistRepository.rename(itemId, text));
    },

    removeItem: async (taskId, itemId) => {
      commit(taskId, itemsFor(taskId).filter((entry) => entry.id !== itemId));
      await persist(taskId, () => taskChecklistRepository.remove(itemId));
    },

    moveItem: async (taskId, itemId, direction) => {
      const current = itemsFor(taskId);
      const next = moveChecklistItem(current, itemId, direction);
      if (next === current) return;
      commit(taskId, next);
      await persist(taskId, () => taskChecklistRepository.reorder(taskId, next.map((entry) => entry.id)));
    },

    replaceTask: async (taskId, drafts) => {
      await persist(taskId, () => taskChecklistRepository.replace(taskId, drafts));
      await get().loadTask(taskId);
    },
  };
});
