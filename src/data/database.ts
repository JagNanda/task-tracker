import { invoke } from "@tauri-apps/api/core";

export type SqlParameter = string | number | boolean | null | Record<string, unknown> | unknown[];

export type DatabaseHealth = {
  databasePath: string;
  screenshotsPath: string;
  schemaVersion: number;
  integrity: string;
};

export function isDesktopRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function select<T>(sql: string, params: SqlParameter[] = []): Promise<T[]> {
  return invoke<T[]>("database_select", { sql, params });
}

export async function execute(sql: string, params: SqlParameter[] = []) {
  return invoke<{ rowsAffected: number }>("database_execute", { sql, params });
}

export async function health() {
  return invoke<DatabaseHealth>("database_health");
}

export function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function nowUtcMs() {
  return Date.now();
}
