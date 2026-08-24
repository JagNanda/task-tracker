import { invoke } from "@tauri-apps/api/core";
import { interruptionPresetRepository } from "../repositories/interruptionPresetRepository";

export const interruptionService = {
  listPresets: interruptionPresetRepository.list,
  ensurePreset: interruptionPresetRepository.ensureByName,
  setEnabled: interruptionPresetRepository.setEnabled,
  rename: interruptionPresetRepository.rename,
  deleteCustom: interruptionPresetRepository.deleteCustom,
  reorder: interruptionPresetRepository.reorder,
  restoreDefaults: () => invoke<void>("database_restore_interruption_defaults"),
};
