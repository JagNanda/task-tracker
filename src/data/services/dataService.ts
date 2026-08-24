import { invoke } from "@tauri-apps/api/core";

export const dataService = {
  deleteAllData(confirmation: string) {
    return invoke<void>("database_delete_all_data", { confirmation });
  },
};
