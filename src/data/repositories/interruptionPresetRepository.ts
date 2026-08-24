import { createId, execute, nowUtcMs, select } from "../database";

export type InterruptionPresetRecord = {
  id: string;
  name: string;
  sort_order: number;
  is_enabled: number;
  is_default: number;
};

export const interruptionPresetRepository = {
  list(enabledOnly = true) {
    return select<InterruptionPresetRecord>(
      `SELECT id, name, sort_order, is_enabled, is_default FROM interruption_presets
       ${enabledOnly ? "WHERE is_enabled = 1" : ""} ORDER BY sort_order, name`,
    );
  },
  async ensureByName(name: string) {
    const cleanName = name.trim() || "Other";
    const [existing] = await select<InterruptionPresetRecord>(
      "SELECT id, name, sort_order, is_enabled, is_default FROM interruption_presets WHERE name = ?1 COLLATE NOCASE LIMIT 1",
      [cleanName],
    );
    if (existing) return existing.id;
    const [{ next_order = 0 } = {}] = await select<{ next_order: number }>("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM interruption_presets");
    const id = createId("preset");
    const now = nowUtcMs();
    await execute(
      "INSERT INTO interruption_presets (id, name, sort_order, is_enabled, is_default, created_at, updated_at) VALUES (?1, ?2, ?3, 1, 0, ?4, ?4)",
      [id, cleanName, next_order, now],
    );
    return id;
  },
  setEnabled(id: string, enabled: boolean) {
    return execute("UPDATE interruption_presets SET is_enabled = ?2, updated_at = ?3 WHERE id = ?1", [id, enabled, nowUtcMs()]);
  },
  rename(id: string, name: string) {
    return execute("UPDATE interruption_presets SET name = ?2, updated_at = ?3 WHERE id = ?1 AND is_default = 0", [id, name.trim(), nowUtcMs()]);
  },
  deleteCustom(id: string) {
    return execute("DELETE FROM interruption_presets WHERE id = ?1 AND is_default = 0", [id]);
  },
  async reorder(ids: string[]) {
    await Promise.all(ids.map((id, index) => execute("UPDATE interruption_presets SET sort_order = ?2, updated_at = ?3 WHERE id = ?1", [id, index, nowUtcMs()])));
  },
};
