mod database;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, LogicalSize, Manager, PhysicalPosition, WebviewWindow, Window, WindowEvent,
};

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn restore_window_placement(window: &WebviewWindow, placement: database::StoredWindowPlacement) {
    let width = placement.width.clamp(820.0, 3840.0);
    let height = placement.height.clamp(680.0, 2160.0);
    let _ = window.set_size(LogicalSize::new(width, height));

    let physical_width = (width * placement.scale_factor.max(0.5)) as i32;
    let physical_height = (height * placement.scale_factor.max(0.5)) as i32;
    let is_visible = window.available_monitors().map_or(true, |monitors| {
        monitors.iter().any(|monitor| {
            let position = monitor.position();
            let size = monitor.size();
            let right = placement.x.saturating_add(physical_width);
            let bottom = placement.y.saturating_add(physical_height);
            let monitor_right = position.x.saturating_add(size.width as i32);
            let monitor_bottom = position.y.saturating_add(size.height as i32);
            right > position.x + 100
                && placement.x < monitor_right - 100
                && bottom > position.y + 80
                && placement.y < monitor_bottom - 80
        })
    });
    if is_visible {
        let _ = window.set_position(PhysicalPosition::new(placement.x, placement.y));
    } else {
        let _ = window.center();
    }
}

fn save_window_placement(window: &Window, state: &database::DatabaseState) {
    if !database::setting_bool(state, "desktop.restoreWindowState", true)
        || window.is_minimized().unwrap_or(false)
        || window.is_maximized().unwrap_or(false)
    {
        return;
    }
    let Ok(position) = window.outer_position() else {
        return;
    };
    let Ok(size) = window.inner_size() else {
        return;
    };
    let scale_factor = window.scale_factor().unwrap_or(1.0);
    let logical_size = size.to_logical::<f64>(scale_factor);
    let _ = database::save_window_placement(
        state,
        &database::StoredWindowPlacement {
            x: position.x,
            y: position.y,
            width: logical_size.width,
            height: logical_size.height,
            scale_factor,
        },
    );
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show Flowo", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Flowo", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;
    let mut builder = TrayIconBuilder::with_id("flowo-tray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("Flowo")
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } | TrayIconEvent::DoubleClick {
                    button: MouseButton::Left,
                    ..
                }
            ) {
                show_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

#[tauri::command]
fn desktop_set_tray_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id("flowo-tray") {
        return tray.set_visible(visible).map_err(|error| error.to_string());
    }
    if visible {
        build_tray(&app).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let state = database::initialize(app.handle()).map_err(|error| {
                std::io::Error::other(format!("failed to initialize Flowo database: {error}"))
            })?;
            let show_tray = database::setting_bool(&state, "desktop.showTrayIcon", true);
            let launch_at_startup =
                database::setting_bool(&state, "desktop.launchAtStartup", false);
            let start_minimized = database::setting_bool(&state, "desktop.startMinimized", false);
            let restore_window_state =
                database::setting_bool(&state, "desktop.restoreWindowState", true);
            let window_placement = if restore_window_state {
                database::window_placement(&state)
            } else {
                None
            };
            app.manage(state);
            if let (Some(window), Some(placement)) =
                (app.get_webview_window("main"), window_placement)
            {
                restore_window_placement(&window, placement);
            }
            if show_tray {
                build_tray(app.handle())?;
            }
            if launch_at_startup
                && start_minimized
                && std::env::args().any(|argument| argument == "--autostart")
            {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            let app = window.app_handle();
            let state = app.state::<database::DatabaseState>();
            let tray_enabled = database::setting_bool(&state, "desktop.showTrayIcon", true);
            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    save_window_placement(window, &state);
                    if tray_enabled
                        && database::setting_string(&state, "desktop.closeBehavior", "tray")
                            == "tray"
                    {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                }
                WindowEvent::Resized(_) if tray_enabled => {
                    let minimize_to_tray =
                        database::setting_bool(&state, "desktop.minimizeToTray", false);
                    if minimize_to_tray && window.is_minimized().unwrap_or(false) {
                        let _ = window.hide();
                    }
                }
                WindowEvent::Focused(false) => save_window_placement(window, &state),
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            desktop_set_tray_visible,
            database::database_execute,
            database::database_select,
            database::database_health,
            database::database_export_backup,
            database::database_import_backup,
            database::database_list_task_notes,
            database::database_save_task_note,
            database::database_delete_task_note,
            database::database_delete_task,
            database::database_delete_all_data,
            database::database_reset_theme,
            database::database_reset_settings,
            database::database_restore_interruption_defaults,
            database::focus_get_active,
            database::focus_start,
            database::focus_switch_task,
            database::focus_start_interruption,
            database::focus_resume_interruption,
            database::focus_pause,
            database::focus_resume_pause,
            database::focus_complete,
            database::focus_cancel,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Flowo");
}
