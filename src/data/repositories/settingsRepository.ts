import { execute, nowUtcMs, select } from "../database";

type SettingRow = { key: string; value_json: string };

export const settingsRepository = {
  async get<T>(key: string): Promise<T | undefined> {
    const [row] = await select<SettingRow>("SELECT key, value_json FROM app_settings WHERE key = ?1", [key]);
    return row ? JSON.parse(row.value_json) as T : undefined;
  },
  async all() {
    const rows = await select<SettingRow>("SELECT key, value_json FROM app_settings ORDER BY key");
    return Object.fromEntries(rows.map((row) => [row.key, JSON.parse(row.value_json)]));
  },
  set(key: string, value: unknown) {
    return execute(
      `INSERT INTO app_settings (key, value_json, updated_at) VALUES (?1, ?2, ?3)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
      [key, JSON.stringify(value), nowUtcMs()],
    );
  },
};
