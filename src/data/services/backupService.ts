import { invoke } from "@tauri-apps/api/core";
import { bootstrapApplicationData } from "../bootstrap";
import { settingsService } from "./settingsService";

export type ImportBackupResult = {
  safetyBackupPath: string;
  schemaVersion: number;
};

export const backupService = {
  async export(destination: string) {
    const path = await invoke<string>("database_export_backup", { destination });
    await settingsService.set("backup.lastAt", Date.now()).catch(() => undefined);
    return path;
  },
  async import(source: string) {
    const result = await invoke<ImportBackupResult>("database_import_backup", { source });
    await bootstrapApplicationData(true);
    return result;
  },
};
