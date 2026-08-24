import { taskRepository, type SaveTaskInput, type TaskStatus } from "../repositories/taskRepository";
import { taskReminderRepository } from "../repositories/taskReminderRepository";

export const taskService = {
  list: taskRepository.list,
  create: taskRepository.create,
  update: taskRepository.update,
  completeTask: (id: string) => taskRepository.setStatus(id, "completed"),
  cancelTask: (id: string) => taskRepository.setStatus(id, "cancelled"),
  setStatus: (id: string, status: TaskStatus) => taskRepository.setStatus(id, status),
  deletePermanently: taskRepository.deletePermanently,
  addReminder: taskReminderRepository.create,
  snoozeReminder: taskReminderRepository.snooze,
};

export type { SaveTaskInput };
