import { create } from "zustand";
import { taskNoteRepository, type TaskNoteRecord } from "../../data/repositories/taskNoteRepository";
import type { NoteAttachment } from "./NoteComposerModal";

export type TaskNote = {
  id: string;
  body: string;
  reportDate?: string;
  createdAt: string;
  updatedAt: string;
  attachments: NoteAttachment[];
};

function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: new Date(timestamp).getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function toTaskNote(note: TaskNoteRecord): TaskNote {
  return {
    id: note.id,
    body: note.body,
    reportDate: note.reportDate ?? undefined,
    createdAt: formatTimestamp(note.createdAt),
    updatedAt: formatTimestamp(note.updatedAt),
    attachments: note.attachments.map(({ id, name, mimeType, dataUrl }) => ({ id, name, mimeType, dataUrl })),
  };
}

type TaskNotesState = {
  notesByTask: Record<string, TaskNote[]>;
  loaded: boolean;
  loadTask: (taskId: string) => Promise<void>;
  loadTasks: (taskIds: string[]) => Promise<void>;
  addNote: (taskId: string, note: Pick<TaskNote, "id" | "body" | "attachments" | "reportDate">) => Promise<void>;
  updateNote: (taskId: string, noteId: string, changes: Pick<TaskNote, "body" | "attachments" | "updatedAt">) => Promise<void>;
  removeNote: (taskId: string, noteId: string) => Promise<void>;
};

export const useTaskNotesStore = create<TaskNotesState>((set, get) => ({
  notesByTask: {},
  loaded: false,
  loadTask: async (taskId) => {
    const notes = (await taskNoteRepository.list(taskId)).map(toTaskNote);
    set((state) => ({ notesByTask: { ...state.notesByTask, [taskId]: notes } }));
  },
  loadTasks: async (taskIds) => {
    const entries = await Promise.all(taskIds.map(async (taskId) => [taskId, (await taskNoteRepository.list(taskId)).map(toTaskNote)] as const));
    set({ notesByTask: Object.fromEntries(entries), loaded: true });
  },
  addNote: async (taskId, note) => {
    const notes = await taskNoteRepository.save({ id: note.id, taskId, body: note.body, attachments: note.attachments, reportDate: note.reportDate });
    set((state) => ({ notesByTask: { ...state.notesByTask, [taskId]: notes.map(toTaskNote) } }));
  },
  updateNote: async (taskId, noteId, changes) => {
    const notes = await taskNoteRepository.save({ id: noteId, taskId, body: changes.body, attachments: changes.attachments });
    set((state) => ({ notesByTask: { ...state.notesByTask, [taskId]: notes.map(toTaskNote) } }));
  },
  removeNote: async (taskId, noteId) => {
    await taskNoteRepository.delete(noteId);
    await get().loadTask(taskId);
  },
}));
