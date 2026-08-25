import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { disable as disableAutostart, enable as enableAutostart, isEnabled as isAutostartEnabled } from "@tauri-apps/plugin-autostart";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  ArrowDown,
  ArrowUp,
  Bell,
  BellRing,
  Check,
  CircleCheck,
  Clock3,
  Copy,
  Database,
  Download,
  FileBarChart,
  FileText,
  GripVertical,
  HardDrive,
  History,
  Info,
  Keyboard,
  ListChecks,
  LockKeyhole,
  Monitor,
  MoreHorizontal,
  Paintbrush,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings2,
  Timer,
  Trash2,
  Upload,
  Volume2,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { Button, Divider, IconButton, Input, Modal, Toggle } from "../../cdk";
import { bootstrapApplicationData } from "../../data/bootstrap";
import { health, type DatabaseHealth } from "../../data/database";
import type { InterruptionPresetRecord } from "../../data/repositories/interruptionPresetRepository";
import { backupService } from "../../data/services/backupService";
import { dataService } from "../../data/services/dataService";
import { interruptionService } from "../../data/services/interruptionService";
import { settingsService } from "../../data/services/settingsService";
import { AppSidebar } from "../today/AppSidebar";
import {
  ColorValueInput,
  NativeSelect,
  NumberPresetEditor,
  SettingRow,
  SettingsSection,
  ToggleRow,
} from "./SettingsComponents";
import { defaultSettings, type SettingKey, type SettingsState } from "./settingsDefaults";
import { applyAppTheme, contrastRatio, readableText } from "../../theme";
import { completionSoundOptions, playCompletionSound } from "../../audio/completionSounds";

type SettingsCategory = "appearance" | "focus" | "interruptions" | "reminders" | "reports" | "notifications" | "desktop" | "shortcuts" | "data" | "tasks" | "timeline" | "about";
type UpdateSetting = <K extends SettingKey>(key: K, value: SettingsState[K]) => Promise<void>;
type SectionProps = { values: SettingsState; update: UpdateSetting; notify: (message: string, error?: boolean) => void };

const settingsNavigation: Array<{ id: SettingsCategory; label: string; icon: LucideIcon }> = [
  { id: "appearance", label: "Appearance", icon: Paintbrush },
  { id: "focus", label: "Focus & Timer", icon: Timer },
  { id: "interruptions", label: "Interruptions", icon: Zap },
  { id: "reminders", label: "Reminders", icon: Bell },
  { id: "reports", label: "Reports", icon: FileBarChart },
  { id: "notifications", label: "Notifications", icon: BellRing },
  { id: "desktop", label: "Desktop Behaviour", icon: Monitor },
  { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
  { id: "data", label: "Data & Backup", icon: Database },
  { id: "tasks", label: "Task Behaviour", icon: ListChecks },
  { id: "timeline", label: "Timeline", icon: History },
  { id: "about", label: "About", icon: Info },
];

const backgroundPresets = ["#050B14", "#02060B", "#0B1724", "#0B2130", "#102238", "#131D2A"];
const accentPresets = ["#2388FF", "#0875FF", "#8247E5", "#11B981", "#FF9F0A", "#F43F5E", "#16A8E0"];

function backupFilename() {
  const date = new Date();
  return `flowo-backup-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}.flowo`;
}

async function syncDesktopIntegrations(settings: SettingsState) {
  if (settings["desktop.launchAtStartup"]) await enableAutostart(); else await disableAutostart();
  await invoke("desktop_set_tray_visible", { visible: settings["desktop.showTrayIcon"] });
}

function ColorPresets({ label, values, selected, onSelect }: { label: string; values: string[]; selected: string; onSelect: (value: string) => void }) {
  return (
    <div className="color-presets" role="radiogroup" aria-label={label}>
      {values.map((color) => (
        <button key={color} type="button" role="radio" aria-checked={selected.toUpperCase() === color} aria-label={`${label} ${color}`} className={selected.toUpperCase() === color ? "is-selected" : ""} style={{ background: color }} onClick={() => onSelect(color)}>
          {selected.toUpperCase() === color && <Check size={15} />}
        </button>
      ))}
    </div>
  );
}

function ThemePreview({ background, accent }: { background: string; accent: string }) {
  return (
    <div className="theme-preview" style={{ "--preview-background": background, "--preview-accent": accent, "--preview-accent-text": readableText(accent) } as CSSProperties}>
      <span>Preview</span>
      <div className="theme-preview__surface">
        <article><i className="theme-preview__focus"><Play size={12} fill="currentColor" /></i><div><small>Focus Session</small><strong>Implement authentication</strong></div><b>13m 42s</b></article>
        <article><i className="theme-preview__interrupt"><Zap size={12} fill="currentColor" /></i><div><strong>Meeting</strong></div><b>5m 18s</b></article>
        <article><i className="theme-preview__complete"><Check size={13} /></i><div><small>Completed</small><strong>Finish integration tests</strong></div></article>
        <button type="button">Selected action</button>
      </div>
    </div>
  );
}

function AppearanceSettings({ values, update, notify }: SectionProps) {
  const background = values["appearance.background"];
  const accent = values["appearance.accent"];
  const weakAccent = contrastRatio(accent, background) < 3;
  const changeTheme = async (key: "appearance.background" | "appearance.accent", value: string) => {
    if (key === "appearance.background" && contrastRatio(value, "#FFFFFF") < 4.5) {
      notify("Choose a darker background so text and controls remain readable.", true);
      return;
    }
    const nextBackground = key === "appearance.background" ? value : background;
    const nextAccent = key === "appearance.accent" ? value : accent;
    applyAppTheme(nextBackground, nextAccent);
    try {
      await update(key, value);
    } catch {
      applyAppTheme(background, accent);
    }
  };
  const reset = async () => {
    try {
      await settingsService.resetTheme();
      applyAppTheme(defaultSettings["appearance.background"], defaultSettings["appearance.accent"]);
      await Promise.all([
        update("appearance.background", defaultSettings["appearance.background"]),
        update("appearance.accent", defaultSettings["appearance.accent"]),
      ]);
      notify("Theme reset to defaults.");
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    }
  };
  return (
    <SettingsSection title="Appearance" description="Customize how Flowo looks.">
      <div className="appearance-layout">
        <div className="appearance-controls">
          <div className="setting-group theme-color-group"><h3>Background color</h3><p>Changes the canvas, sidebar, cards, inputs, and borders as one coordinated palette.</p><ColorPresets label="Background preset" values={backgroundPresets} selected={background} onSelect={(value) => void changeTheme("appearance.background", value)} /></div>
          <div className="setting-group theme-color-group"><h3>Accent color</h3><p>Changes primary actions, selected states, links, and focus indicators. Status colors stay unchanged.</p><ColorPresets label="Accent preset" values={accentPresets} selected={accent} onSelect={(value) => void changeTheme("appearance.accent", value)} /></div>
          <div className="setting-group"><h3>Custom colors</h3><div className="custom-colors"><ColorValueInput label="Background" value={background} onCommit={(value) => void changeTheme("appearance.background", value)} /><ColorValueInput label="Accent" value={accent} onCommit={(value) => void changeTheme("appearance.accent", value)} /></div></div>
          {weakAccent && <p className="theme-contrast-warning">This accent has low contrast against the selected background. Flowo will use a readable foreground color on accent controls.</p>}
        </div>
        <ThemePreview background={background} accent={accent} />
      </div>
      <Divider />
      <div className="settings-inline-actions"><Button onClick={() => void reset()}><RotateCcw size={14} /> Reset to default theme</Button></div>
    </SettingsSection>
  );
}

function FocusSettings({ values, update }: SectionProps) {
  return (
    <SettingsSection title="Focus & Timer" description="Configure focus sessions and timer behaviour.">
      <div className="settings-two-column">
        <div className="setting-group">
          <SettingRow title="Default focus duration" description="Used when a new focus session starts."><NativeSelect label="Default focus duration" value={values["focus.defaultDuration"]} options={[15, 25, 50, 75, 90].map((value) => ({ value, label: `${value} minutes` }))} onChange={(value) => void update("focus.defaultDuration", Number(value))} /></SettingRow>
          <SettingRow title="Break after each session" description="Starts automatically when a focus session is completed."><NativeSelect label="Automatic break duration" value={values["focus.breakDuration"]} options={[1, 5, 10, 15, 20, 30, 45, 60].map((value) => ({ value, label: `${value} minute${value === 1 ? "" : "s"}` }))} onChange={(value) => void update("focus.breakDuration", Number(value))} /></SettingRow>
          <SettingRow title="Session summary" description="Every focus session requires a short summary before it can be completed."><span className="setting-required-label"><LockKeyhole size={13} /> Required</span></SettingRow>
          <ToggleRow title="Play sound when session ends" description="Play a sound when a focus session completes." checked={values["notifications.focusSound"]} onChange={(value) => void update("notifications.focusSound", value)} />
          <ToggleRow title="Show Windows notification when session ends" description="Display a native notification when focus completes." checked={values["notifications.focusComplete"]} onChange={(value) => void update("notifications.focusComplete", value)} />
        </div>
        <div className="setting-group">
          <h3>Quick duration presets</h3>
          <NumberPresetEditor values={values["focus.quickDurations"]} onChange={(value) => void update("focus.quickDurations", value)} />
          <SettingRow title="When starting a task"><NativeSelect label="When starting a task" value={values["focus.startBehavior"]} options={[{ value: "default", label: "Start immediately using default duration" }, { value: "ask", label: "Ask for duration first" }, { value: "last", label: "Use last-used duration" }]} onChange={(value) => void update("focus.startBehavior", value)} /></SettingRow>
          <ToggleRow title="Remember last-used duration" description="Use the last selected duration for the next session." checked={values["focus.rememberLastDuration"]} onChange={(value) => void update("focus.rememberLastDuration", value)} />
        </div>
      </div>
    </SettingsSection>
  );
}

function InterruptionSettings({ values, update, notify }: SectionProps) {
  const [presets, setPresets] = useState<InterruptionPresetRecord[]>([]);
  const [newPreset, setNewPreset] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const load = useCallback(() => interruptionService.listPresets(false).then(setPresets), []);
  useEffect(() => { void load(); }, [load]);
  const setEnabled = async (preset: InterruptionPresetRecord, enabled: boolean) => {
    await interruptionService.setEnabled(preset.id, enabled);
    await load();
  };
  const move = async (id: string, direction: -1 | 1) => {
    const index = presets.findIndex((preset) => preset.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= presets.length) return;
    const next = [...presets];
    [next[index], next[target]] = [next[target], next[index]];
    setPresets(next);
    await interruptionService.reorder(next.map((preset) => preset.id));
  };
  const drop = async (targetId: string) => {
    if (!dragging || dragging === targetId) return;
    const source = presets.find((preset) => preset.id === dragging);
    const targetIndex = presets.findIndex((preset) => preset.id === targetId);
    if (!source || targetIndex < 0) return;
    const next = presets.filter((preset) => preset.id !== dragging);
    next.splice(targetIndex, 0, source);
    setDragging(null);
    setPresets(next);
    await interruptionService.reorder(next.map((preset) => preset.id));
  };
  const add = async () => {
    if (!newPreset.trim()) return;
    await interruptionService.ensurePreset(newPreset);
    setNewPreset("");
    await load();
  };
  const rename = async (preset: InterruptionPresetRecord) => {
    const name = window.prompt("Rename interruption preset", preset.name)?.trim();
    if (!name || name === preset.name) return;
    await interruptionService.rename(preset.id, name);
    await load();
  };
  const restore = async () => {
    await interruptionService.restoreDefaults();
    await load();
    notify("Default interruption presets restored.");
  };
  return (
    <SettingsSection title="Interruptions" description="Manage interruption presets and behaviour.">
      <div className="settings-two-column settings-two-column--interruptions">
        <div className="setting-group">
          <h3>Quick interruption presets</h3>
          <div className="interruption-preset-list">
            {presets.map((preset, index) => (
              <div key={preset.id} className={!preset.is_enabled ? "is-disabled" : ""} draggable onDragStart={() => setDragging(preset.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => void drop(preset.id)}>
                <GripVertical size={15} aria-hidden="true" /><span>{index + 1}</span><strong>{preset.name}</strong>
                <Toggle label={`${preset.is_enabled ? "Disable" : "Enable"} ${preset.name}`} checked={Boolean(preset.is_enabled)} onChange={(value) => void setEnabled(preset, value)} />
                <IconButton label={`Move ${preset.name} up`} disabled={index === 0} onClick={() => void move(preset.id, -1)}><ArrowUp size={13} /></IconButton>
                <IconButton label={`Move ${preset.name} down`} disabled={index === presets.length - 1} onClick={() => void move(preset.id, 1)}><ArrowDown size={13} /></IconButton>
                {!preset.is_default ? <><IconButton label={`Rename ${preset.name}`} onClick={() => void rename(preset)}><Settings2 size={13} /></IconButton><IconButton label={`Delete ${preset.name}`} onClick={() => void interruptionService.deleteCustom(preset.id).then(load)}><Trash2 size={13} /></IconButton></> : <MoreHorizontal size={15} aria-hidden="true" />}
              </div>
            ))}
          </div>
          <div className="preset-add-row"><Input value={newPreset} onChange={(event) => setNewPreset(event.target.value)} placeholder="New preset name" onKeyDown={(event) => event.key === "Enter" && void add()} /><Button tone="primary" disabled={!newPreset.trim()} onClick={() => void add()}><Plus size={14} /> Add preset</Button></div>
        </div>
        <div className="setting-group">
          <SettingRow title="When to ask for interruption reason" description="An interruption can always begin without a category."><NativeSelect label="When to ask for interruption reason" value={values["interruptions.reasonPrompt"]} options={[{ value: "immediately", label: "Immediately when interruption starts" }, { value: "resume", label: "When resuming focus" }, { value: "never", label: "Do not automatically ask" }]} onChange={(value) => void update("interruptions.reasonPrompt", value)} /></SettingRow>
          <Button onClick={() => void restore()}><RefreshCw size={14} /> Restore defaults</Button>
        </div>
      </div>
    </SettingsSection>
  );
}

function ReminderSettings({ values, update }: SectionProps) {
  const snoozeLabels: Record<string, string> = { "5m": "5 minutes", "15m": "15 minutes", "30m": "30 minutes", "1h": "1 hour", tomorrow: "Tomorrow" };
  const [newSnooze, setNewSnooze] = useState("5m");
  const snoozeCandidates = ["5m", "15m", "30m", "1h", "tomorrow"].filter((value) => !values["reminders.snoozeOptions"].includes(value));
  const changeSnoozeOptions = async (options: string[]) => {
    if (!options.length) return;
    if (!options.includes(values["reminders.defaultSnooze"])) await update("reminders.defaultSnooze", options[0]);
    await update("reminders.snoozeOptions", options);
  };
  const moveSnooze = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= values["reminders.snoozeOptions"].length) return;
    const next = [...values["reminders.snoozeOptions"]];
    [next[index], next[target]] = [next[target], next[index]];
    void changeSnoozeOptions(next);
  };
  return (
    <SettingsSection title="Reminders" description="Configure task reminder notifications and snoozing.">
      <div className="setting-group">
        <ToggleRow title="Enable task reminder notifications" checked={values["notifications.reminders"]} onChange={(value) => void update("notifications.reminders", value)} />
        <ToggleRow title="Play reminder sound" checked={values["notifications.reminderSound"]} onChange={(value) => void update("notifications.reminderSound", value)} />
        <SettingRow title="Quick snooze choices" description="Shown when snoozing a reminder."><div className="snooze-editor"><div className="snooze-pills">{values["reminders.snoozeOptions"].map((value, index) => <span key={value}><b>{snoozeLabels[value] ?? value}</b><IconButton label={`Move ${snoozeLabels[value] ?? value} earlier`} disabled={index === 0} onClick={() => moveSnooze(index, -1)}><ArrowUp size={11} /></IconButton><IconButton label={`Move ${snoozeLabels[value] ?? value} later`} disabled={index === values["reminders.snoozeOptions"].length - 1} onClick={() => moveSnooze(index, 1)}><ArrowDown size={11} /></IconButton><IconButton label={`Remove ${snoozeLabels[value] ?? value}`} disabled={values["reminders.snoozeOptions"].length === 1} onClick={() => void changeSnoozeOptions(values["reminders.snoozeOptions"].filter((item) => item !== value))}><X size={11} /></IconButton></span>)}</div>{snoozeCandidates.length > 0 && <div className="snooze-add"><NativeSelect label="Snooze option to add" value={snoozeCandidates.includes(newSnooze) ? newSnooze : snoozeCandidates[0]} options={snoozeCandidates.map((value) => ({ value, label: snoozeLabels[value] ?? value }))} onChange={setNewSnooze} /><Button size="sm" onClick={() => { const choice = snoozeCandidates.includes(newSnooze) ? newSnooze : snoozeCandidates[0]; if (choice) void changeSnoozeOptions([...values["reminders.snoozeOptions"], choice]); }}><Plus size={12} /> Add</Button></div>}</div></SettingRow>
        <SettingRow title="Default snooze"><NativeSelect label="Default snooze" value={values["reminders.defaultSnooze"]} options={values["reminders.snoozeOptions"].map((value) => ({ value, label: snoozeLabels[value] ?? value }))} onChange={(value) => void update("reminders.defaultSnooze", value)} /></SettingRow>
        <SettingRow title="When opening a reminder"><NativeSelect label="When opening a reminder" value={values["reminders.openBehavior"]} options={[{ value: "popup", label: "Open task popup" }, { value: "tasks", label: "Open Tasks page" }]} onChange={(value) => void update("reminders.openBehavior", value)} /></SettingRow>
        <ToggleRow title="Dismiss future reminders when task is completed or cancelled" checked={values["reminders.dismissOnTerminalTask"]} onChange={(value) => void update("reminders.dismissOnTerminalTask", value)} />
      </div>
    </SettingsSection>
  );
}

function ReportSettings({ values, update }: SectionProps) {
  const toggles: Array<[SettingKey, string]> = [["reports.includeTotalFocusTime", "Include total focus time"], ["reports.includeTimePerTask", "Include time per task"], ["reports.includeCompleted", "Include completed tasks"], ["reports.includeWorkInProgress", "Include work in progress"], ["reports.includeInterruptions", "Include interruptions"], ["reports.includeBreaks", "Include breaks"]];
  return (
    <SettingsSection title="Reports" description="Set defaults for newly generated reports. Saved reports remain unchanged.">
      <div className="setting-group">
        {toggles.map(([key, label]) => <ToggleRow key={key} title={label} checked={Boolean(values[key])} onChange={(value) => void update(key, value as never)} />)}
        <SettingRow title="When opening Reports"><NativeSelect label="When opening Reports" value={values["reports.defaultPeriod"]} options={[{ value: "today", label: "Today" }, { value: "last", label: "Last-used period" }]} onChange={(value) => void update("reports.defaultPeriod", value)} /></SettingRow>
        <SettingRow title="Report detail"><NativeSelect label="Report detail" value={values["reports.detail"]} options={[{ value: "concise", label: "Concise" }, { value: "detailed", label: "Detailed" }]} onChange={(value) => void update("reports.detail", value)} /></SettingRow>
      </div>
    </SettingsSection>
  );
}

function NotificationSettings({ values, update, notify }: SectionProps) {
  const [available, setAvailable] = useState(true);
  useEffect(() => { void isPermissionGranted().catch(() => setAvailable(false)); }, []);
  const test = async () => {
    try {
      let granted = await isPermissionGranted();
      if (!granted) granted = (await requestPermission()) === "granted";
      if (!granted) return notify("Windows notification permission was not granted.", true);
      sendNotification({ title: "Flowo", body: "Notifications are working." });
      notify("Test notification sent.");
    } catch {
      setAvailable(false);
      notify("Native Windows notifications are unavailable in this environment.", true);
    }
  };
  return (
    <SettingsSection title="Notifications" description="Control native Windows notifications and sounds.">
      <div className="setting-group">
        <ToggleRow title="Focus completed" checked={values["notifications.focusComplete"]} onChange={(value) => void update("notifications.focusComplete", value)} disabled={!available} />
        <ToggleRow title="Task reminders" checked={values["notifications.reminders"]} onChange={(value) => void update("notifications.reminders", value)} disabled={!available} />
        <ToggleRow title="Focus completion sound" description="Play when a focus session is saved." checked={values["notifications.focusSound"]} onChange={(value) => void update("notifications.focusSound", value)} />
        <SettingRow title="Focus sound" description="Choose the sound used after a completed session." disabled={!values["notifications.focusSound"]}>
          <div className="completion-sound-control">
            <NativeSelect label="Focus completion sound" value={values["notifications.focusSoundStyle"]} options={[...completionSoundOptions]} onChange={(value) => void update("notifications.focusSoundStyle", value)} disabled={!values["notifications.focusSound"]} />
            <Button size="sm" disabled={!values["notifications.focusSound"]} onClick={() => void playCompletionSound(values["notifications.focusSoundStyle"])}><Volume2 size={13} /> Preview</Button>
          </div>
        </SettingRow>
        <ToggleRow title="Break completion sound" description="Play when the automatic break countdown finishes." checked={values["notifications.breakSound"]} onChange={(value) => void update("notifications.breakSound", value)} />
        <SettingRow title="Break sound" description="Choose a distinct sound for the end of a break." disabled={!values["notifications.breakSound"]}>
          <div className="completion-sound-control">
            <NativeSelect label="Break completion sound" value={values["notifications.breakSoundStyle"]} options={[...completionSoundOptions]} onChange={(value) => void update("notifications.breakSoundStyle", value)} disabled={!values["notifications.breakSound"]} />
            <Button size="sm" disabled={!values["notifications.breakSound"]} onClick={() => void playCompletionSound(values["notifications.breakSoundStyle"])}><Volume2 size={13} /> Preview</Button>
          </div>
        </SettingRow>
        <ToggleRow title="Reminder sound" checked={values["notifications.reminderSound"]} onChange={(value) => void update("notifications.reminderSound", value)} />
        <div className="settings-inline-actions"><Button disabled={!available} onClick={() => void test()}><BellRing size={14} /> Send test notification</Button>{!available && <small>Native notifications are unavailable in this environment.</small>}</div>
      </div>
    </SettingsSection>
  );
}

function DesktopSettings({ values, update, notify }: SectionProps) {
  const [autostartBusy, setAutostartBusy] = useState(false);
  useEffect(() => {
    void isAutostartEnabled().then((enabled) => { if (enabled !== values["desktop.launchAtStartup"]) void update("desktop.launchAtStartup", enabled); }).catch(() => undefined);
    // Read native state once when this section opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const changeAutostart = async (enabled: boolean) => {
    setAutostartBusy(true);
    try {
      if (enabled) await enableAutostart(); else await disableAutostart();
      await update("desktop.launchAtStartup", enabled);
    } catch (error) {
      notify(`Windows startup setting was not changed: ${error instanceof Error ? error.message : String(error)}`, true);
    } finally {
      setAutostartBusy(false);
    }
  };
  const changeTrayVisibility = async (visible: boolean) => {
    try {
      await invoke("desktop_set_tray_visible", { visible });
      await update("desktop.showTrayIcon", visible);
      if (!visible && values["desktop.closeBehavior"] === "tray") {
        await update("desktop.closeBehavior", "exit");
      }
    } catch (error) {
      notify(`Tray visibility was not changed: ${error instanceof Error ? error.message : String(error)}`, true);
    }
  };
  return (
    <SettingsSection title="Desktop Behaviour" description="Configure how Flowo behaves on Windows.">
      <div className="setting-group">
        <ToggleRow title="Launch Flowo when Windows starts" checked={values["desktop.launchAtStartup"]} onChange={(value) => void changeAutostart(value)} disabled={autostartBusy} />
        <ToggleRow title="Start minimized" description="Available when Windows startup is enabled." checked={values["desktop.startMinimized"]} onChange={(value) => void update("desktop.startMinimized", value)} disabled={!values["desktop.launchAtStartup"]} />
        <SettingRow title="When closing Flowo" description="Minimizing to the tray keeps timers and reminders available."><NativeSelect label="When closing Flowo" value={values["desktop.closeBehavior"]} options={[{ value: "tray", label: "Minimize to system tray" }, { value: "exit", label: "Exit Flowo" }]} onChange={(value) => void update("desktop.closeBehavior", value)} /></SettingRow>
        <ToggleRow title="Minimize to system tray when minimized" checked={values["desktop.minimizeToTray"]} onChange={(value) => void update("desktop.minimizeToTray", value)} />
        <ToggleRow title="Show system tray icon" checked={values["desktop.showTrayIcon"]} onChange={(value) => void changeTrayVisibility(value)} />
        <ToggleRow title="Keep timers running in tray" checked={values["desktop.keepTimersInTray"]} onChange={(value) => void update("desktop.keepTimersInTray", value)} />
        <ToggleRow title="Keep reminders active in tray" checked={values["desktop.keepRemindersInTray"]} onChange={(value) => void update("desktop.keepRemindersInTray", value)} />
        <ToggleRow title="Restore previous window size and position" description="Restores the last normal Windows laptop layout and DPI-aware position." checked={values["desktop.restoreWindowState"]} onChange={(value) => void update("desktop.restoreWindowState", value)} />
        <p className="settings-support-note">Flowo’s tray menu always includes an explicit Quit Flowo action when the tray is enabled.</p>
      </div>
    </SettingsSection>
  );
}

function ShortcutSettings({ values, update }: SectionProps) {
  const shortcuts = [["Ctrl + K", "Quick Capture"], ["Space", "Pause / Resume"], ["I", "Interrupt"], ["T", "Switch Task"], ["F", "Finish Focus"], ["N", "New Task"], ["Esc", "Close popup"]];
  return (
    <SettingsSection title="Shortcuts" description="Current keyboard mappings. Shortcuts never fire while you are typing in an editor.">
      <ToggleRow title="Enable keyboard shortcuts" checked={values["shortcuts.enabled"]} onChange={(value) => void update("shortcuts.enabled", value)} />
      <div className="shortcut-list">{shortcuts.map(([keys, action]) => <div key={keys}><kbd>{keys}</kbd><span>{action}</span></div>)}</div>
    </SettingsSection>
  );
}

function TaskBehaviourSettings({ values, update }: SectionProps) {
  return (
    <SettingsSection title="Task Behaviour" description="Choose defaults and safeguards for task management.">
      <div className="setting-group">
        <SettingRow title="Default new task status"><NativeSelect label="Default new task status" value={values["tasks.defaultStatus"]} options={[{ value: "todo", label: "To Do" }, { value: "in_progress", label: "In Progress" }]} onChange={(value) => void update("tasks.defaultStatus", value)} /></SettingRow>
        <ToggleRow title="Start focus after creating task" checked={values["tasks.startFocusAfterCreate"]} onChange={(value) => void update("tasks.startFocusAfterCreate", value)} />
        <ToggleRow title="Confirm before cancelling task" checked={values["tasks.confirmCancel"]} onChange={(value) => void update("tasks.confirmCancel", value)} />
        <ToggleRow title="Confirm before permanently deleting task" checked={values["tasks.confirmDelete"]} onChange={(value) => void update("tasks.confirmDelete", value)} />
        <ToggleRow title="Show Completed Today section on Tasks page" checked={values["tasks.showCompletedToday"]} onChange={(value) => void update("tasks.showCompletedToday", value)} />
        <SettingRow title="Default task sort"><NativeSelect label="Default task sort" value={values["tasks.defaultSort"]} options={[{ value: "recently-worked", label: "Recently Worked On" }, { value: "reminder", label: "Reminder Time" }, { value: "name", label: "Name" }, { value: "time", label: "Time Spent" }, { value: "created", label: "Recently Created" }]} onChange={(value) => void update("tasks.defaultSort", value)} /></SettingRow>
      </div>
    </SettingsSection>
  );
}

function TimelineSettings({ values, update }: SectionProps) {
  return (
    <SettingsSection title="Timeline" description="Set default Timeline presentation and safeguards.">
      <div className="setting-group">
        <SettingRow title="Default filter"><NativeSelect label="Default Timeline filter" value={values["timeline.defaultFilter"]} options={[{ value: "all", label: "All" }, { value: "focus", label: "Focus" }, { value: "interruption", label: "Interruptions" }, { value: "break", label: "Breaks" }]} onChange={(value) => void update("timeline.defaultFilter", value)} /></SettingRow>
        <ToggleRow title="Show session notes inline" checked={values["timeline.showNotesInline"]} onChange={(value) => void update("timeline.showNotesInline", value)} />
        <ToggleRow title="Collapse long notes by default" checked={values["timeline.collapseLongNotes"]} onChange={(value) => void update("timeline.collapseLongNotes", value)} />
        <ToggleRow title="Confirm before deleting timeline entry" checked={values["timeline.confirmDelete"]} onChange={(value) => void update("timeline.confirmDelete", value)} />
      </div>
    </SettingsSection>
  );
}

function DataBackupSettings({ values, database, busy, onExport, onImport, onOpenFolder, onDelete }: { values: SettingsState; database: DatabaseHealth | null; busy: boolean; onExport: () => void; onImport: () => void; onOpenFolder: () => void; onDelete: () => void }) {
  const contents = ["Tasks", "Notes", "Screenshots", "Reminders", "Timeline history", "Focus sessions", "Saved reports", "Settings", "Themes"];
  return (
    <SettingsSection title="Data & Backup" description="Move or protect all of your local Flowo data.">
      <div className="backup-summary"><HardDrive size={22} /><div><strong>A full .flowo backup contains</strong><p>{contents.join(" · ")}</p></div></div>
      <div className="settings-inline-actions"><Button tone="primary" disabled={busy} onClick={onExport}><Download size={15} /> Export Flowo Backup</Button><Button disabled={busy} onClick={onImport}><Upload size={15} /> Import Flowo Backup</Button><Button disabled={!database} onClick={onOpenFolder}><HardDrive size={15} /> Open Flowo data folder</Button></div>
      {values["backup.lastAt"] !== null && <SettingRow title="Last backup"><span>{new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeStyle: "short" }).format(new Date(values["backup.lastAt"]))}</span></SettingRow>}
      {database && <details className="database-details"><summary>Database information</summary><dl><div><dt>Location</dt><dd>{database.databasePath}</dd></div><div><dt>Schema version</dt><dd>{database.schemaVersion}</dd></div><div><dt>Integrity</dt><dd>{database.integrity}</dd></div></dl></details>}
      <Divider />
      <div className="danger-zone"><div><strong>Delete All Data</strong><p>Deletes tasks, notes, screenshots, reminders, focus history, timeline entries, reports, and preferences.</p></div><Button className="settings-danger-button" onClick={onDelete}><Trash2 size={14} /> Delete All Data</Button></div>
    </SettingsSection>
  );
}

function AboutSettings({ database, onOpenFolder, notify }: { database: DatabaseHealth | null; onOpenFolder: () => void; notify: (message: string, error?: boolean) => void }) {
  const [version, setVersion] = useState("0.1.0");
  useEffect(() => { void getVersion().then(setVersion).catch(() => undefined); }, []);
  const diagnostics = `Flowo ${version}\nDatabase schema: ${database?.schemaVersion ?? "unavailable"}\nDatabase integrity: ${database?.integrity ?? "unavailable"}\nDatabase: ${database?.databasePath ?? "unavailable"}`;
  return (
    <SettingsSection title="About" description="Flowo is a local-first focus and task tracker for Windows.">
      <div className="about-product"><span className="about-product__mark"><Clock3 size={24} /></span><div><h3>Flowo</h3><p>Version {version}</p><small>Database schema version {database?.schemaVersion ?? "—"}</small></div></div>
      <div className="settings-inline-actions"><Button disabled={!database} onClick={onOpenFolder}><HardDrive size={14} /> Open data folder</Button><Button onClick={() => void navigator.clipboard.writeText(diagnostics).then(() => notify("Diagnostic information copied."))}><Copy size={14} /> Copy diagnostic information</Button></div>
      <details className="license-details"><summary>View licenses</summary><p>Flowo includes open-source packages distributed under their respective licenses. Package license details are available with the installed application source.</p></details>
    </SettingsSection>
  );
}

export function SettingsPage({ onNavigate }: { onNavigate?: (label: string) => void }) {
  const [selected, setSelected] = useState<SettingsCategory>(() => {
    const requested = window.sessionStorage.getItem("flowo:settings-section");
    if (requested) window.sessionStorage.removeItem("flowo:settings-section");
    return settingsNavigation.some((item) => item.id === requested) ? requested as SettingsCategory : "appearance";
  });
  const [values, setValues] = useState<SettingsState>({ ...defaultSettings, "focus.quickDurations": [...defaultSettings["focus.quickDurations"]], "reminders.snoozeOptions": [...defaultSettings["reminders.snoozeOptions"]] });
  const [database, setDatabase] = useState<DatabaseHealth | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ message: string; error: boolean } | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  const notify = useCallback((message: string, error = false) => setNotice({ message, error }), []);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const load = useCallback(async () => {
    try {
      const [saved, databaseHealth] = await Promise.all([settingsService.all(), health()]);
      setValues(saved);
      setDatabase(databaseHealth);
      applyAppTheme(saved["appearance.background"], saved["appearance.accent"]);
      setLoaded(true);
    } catch (error) {
      notify(`Settings could not be loaded: ${error instanceof Error ? error.message : String(error)}`, true);
    }
  }, [notify]);
  useEffect(() => { void load(); }, [load]);

  const update: UpdateSetting = async (key, value) => {
    const previous = values[key];
    setValues((current) => ({ ...current, [key]: value }));
    try {
      await settingsService.set(key, value);
      setNotice({ message: "Saved", error: false });
    } catch (error) {
      setValues((current) => ({ ...current, [key]: previous }));
      notify(`Not saved: ${error instanceof Error ? error.message : String(error)}`, true);
      throw error;
    }
  };

  const exportBackup = async () => {
    const destination = await saveDialog({ title: "Export Flowo backup", defaultPath: backupFilename(), filters: [{ name: "Flowo backup", extensions: ["flowo"] }] });
    if (!destination) return;
    setBusy(true);
    try {
      const path = await backupService.export(destination);
      setValues((current) => ({ ...current, "backup.lastAt": Date.now() }));
      notify(`Backup exported to ${path}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    } finally { setBusy(false); }
  };

  const importBackup = async () => {
    const source = await openDialog({ title: "Import Flowo backup", multiple: false, directory: false, filters: [{ name: "Flowo backup", extensions: ["flowo"] }] });
    if (!source || Array.isArray(source)) return;
    if (!window.confirm("Import this backup? Flowo will create a safety backup of your current data first.")) return;
    setBusy(true);
    try {
      const result = await backupService.import(source);
      await syncDesktopIntegrations(await settingsService.all()).catch(() => undefined);
      await load();
      notify(`Backup restored. Previous data is safe at ${result.safetyBackupPath}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    } finally { setBusy(false); }
  };

  const openDataFolder = () => {
    if (database) void revealItemInDir(database.databasePath).catch((error) => notify(String(error), true));
  };

  const resetAll = async () => {
    setBusy(true);
    try {
      await settingsService.resetAll();
      await syncDesktopIntegrations(await settingsService.all()).catch(() => undefined);
      await load();
      setResetOpen(false);
      setSelected("appearance");
      notify("All preferences were restored. Tasks and history were not changed.");
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    } finally { setBusy(false); }
  };

  const deleteAll = async () => {
    if (deleteConfirmation !== "DELETE ALL DATA") return;
    setBusy(true);
    try {
      await dataService.deleteAllData(deleteConfirmation);
      await syncDesktopIntegrations(await settingsService.all()).catch(() => undefined);
      await bootstrapApplicationData(true);
      await load();
      setDeleteConfirmation("");
      setDeleteOpen(false);
      notify("All Flowo data was permanently deleted.");
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    } finally { setBusy(false); }
  };

  const sectionProps = useMemo(() => ({ values, update, notify }), [values, notify]);
  const content: Record<SettingsCategory, React.ReactNode> = {
    appearance: <AppearanceSettings {...sectionProps} />,
    focus: <FocusSettings {...sectionProps} />,
    interruptions: <InterruptionSettings {...sectionProps} />,
    reminders: <ReminderSettings {...sectionProps} />,
    reports: <ReportSettings {...sectionProps} />,
    notifications: <NotificationSettings {...sectionProps} />,
    desktop: <DesktopSettings {...sectionProps} />,
    shortcuts: <ShortcutSettings {...sectionProps} />,
    data: <DataBackupSettings values={values} database={database} busy={busy} onExport={() => void exportBackup()} onImport={() => void importBackup()} onOpenFolder={openDataFolder} onDelete={() => setDeleteOpen(true)} />,
    tasks: <TaskBehaviourSettings {...sectionProps} />,
    timeline: <TimelineSettings {...sectionProps} />,
    about: <AboutSettings database={database} onOpenFolder={openDataFolder} notify={notify} />,
  };

  return (
    <div className="app-shell settings-shell">
      <AppSidebar selected="Settings" onNavigate={onNavigate} />
      <main className={`settings-page ${loaded ? "is-loaded" : "is-loading"}`}>
        <header className="settings-page__header"><h1>Settings</h1><p>Customize Flowo to match your workflow.</p></header>
        <div className="settings-layout">
          <nav className="settings-local-nav" aria-label="Settings categories">
            {settingsNavigation.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={selected === id ? "is-selected" : ""} aria-current={selected === id ? "page" : undefined} onClick={() => setSelected(id)}><Icon size={18} /><span>{label}</span></button>)}
          </nav>
          <div className="settings-content" tabIndex={-1}>{content[selected]}</div>
          <aside className="settings-utility" aria-label="Settings information">
            <section><header><LockKeyhole size={16} /><strong>All data is stored locally</strong></header><p>Your Flowo data is stored on this computer. Flowo does not require an account or upload your work data to a cloud service.</p></section>
            <section><header><Info size={16} /><strong>Diagnostics</strong></header><p>Database schema {database?.schemaVersion ?? "—"}<br />Integrity: {database?.integrity ?? "checking"}</p><Button size="sm" onClick={() => setSelected("about")}>Open About</Button></section>
            <section className="settings-reset-panel"><header><RotateCcw size={16} /><strong>Reset all settings</strong></header><p>Restore preferences to their defaults without deleting tasks or history.</p><Button className="settings-danger-button" onClick={() => setResetOpen(true)}>Reset all settings</Button></section>
          </aside>
        </div>
      </main>
      {notice && <div className={`settings-toast ${notice.error ? "is-error" : ""}`} role={notice.error ? "alert" : "status"}><CircleCheck size={15} />{notice.message}</div>}
      <Modal open={resetOpen} title="Reset all settings?" onClose={() => setResetOpen(false)}><p className="modal-description">Appearance, timer, reminder, report, desktop, task, and Timeline preferences will return to defaults. Tasks, notes, history, screenshots, and reports will not be deleted.</p><div className="modal-actions"><Button onClick={() => setResetOpen(false)}>Cancel</Button><Button className="settings-danger-button" disabled={busy} onClick={() => void resetAll()}><RotateCcw size={14} /> Reset Settings</Button></div></Modal>
      <Modal open={deleteOpen} title="Permanently delete all Flowo data?" onClose={() => setDeleteOpen(false)}><p className="modal-description">This deletes tasks, notes, screenshots, reminders, focus history, timeline entries, saved reports, and settings. This cannot be undone.</p><label className="delete-confirmation"><span>Type DELETE ALL DATA to confirm</span><Input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} autoFocus /></label><div className="modal-actions"><Button onClick={() => setDeleteOpen(false)}>Cancel</Button><Button className="settings-danger-button" disabled={busy || deleteConfirmation !== "DELETE ALL DATA"} onClick={() => void deleteAll()}><Trash2 size={14} /> Delete All Data</Button></div></Modal>
    </div>
  );
}
