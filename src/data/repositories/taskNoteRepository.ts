import { invoke } from "@tauri-apps/api/core";
import type { NoteAttachment } from "../../features/tasks/NoteComposerModal";

export type TaskNoteRecord = {
  id: string;
  taskId: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  attachments: Array<NoteAttachment & {
    relativePath: string;
    width: number;
    height: number;
    fileSize: number;
  }>;
};

export const taskNoteRepository = {
  list(taskId: string) {
    return invoke<TaskNoteRecord[]>("database_list_task_notes", { taskId });
  },

  save(input: { id: string; taskId: string; body: string; attachments: NoteAttachment[] }) {
    return invoke<TaskNoteRecord[]>("database_save_task_note", {
      input: { ...input, now: Date.now() },
    });
  },

  delete(noteId: string) {
    return invoke<void>("database_delete_task_note", { noteId });
  },
};
