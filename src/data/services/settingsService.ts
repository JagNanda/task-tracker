import { invoke } from "@tauri-apps/api/core";
import { settingsRepository } from "../repositories/settingsRepository";
import { defaultSettings, type SettingKey, type SettingsState } from "../../features/settings/settingsDefaults";

const hexColor = /^#[0-9a-f]{6}$/i;

export const settingsService = {
  get: settingsRepository.get,
  async all(): Promise<SettingsState> {
    const saved = await settingsRepository.all();
    return { ...defaultSettings, ...saved } as unknown as SettingsState;
  },
  set<K extends SettingKey>(key: K, value: SettingsState[K]) {
    return settingsRepository.set(key, value);
  },
  setAccent(color: string) {
    if (!hexColor.test(color)) throw new Error("Accent color must be a six-digit hex color");
    return settingsRepository.set("appearance.accent", color.toUpperCase());
  },
  setBackground(color: string) {
    if (!hexColor.test(color)) throw new Error("Background color must be a six-digit hex color");
    return settingsRepository.set("appearance.background", color.toUpperCase());
  },
  resetTheme() {
    return invoke<void>("database_reset_theme");
  },
  resetAll() {
    return invoke<void>("database_reset_settings");
  },
};
