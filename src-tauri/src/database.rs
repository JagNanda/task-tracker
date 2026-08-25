use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use image::GenericImageView;
use rusqlite::{
    backup::Progress,
    params, params_from_iter,
    types::{Value as SqlValue, ValueRef},
    Connection, DatabaseName, OptionalExtension, Transaction, TransactionBehavior,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value as JsonValue};
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

const MIGRATIONS: &[(i64, &str, &str)] = &[
    (1, "initial", include_str!("../migrations/001_initial.sql")),
    (
        2,
        "settings defaults",
        include_str!("../migrations/002_settings_defaults.sql"),
    ),
    (
        3,
        "settings-driven behaviour",
        include_str!("../migrations/003_settings_behaviour.sql"),
    ),
    (
        4,
        "automatic break timer",
        include_str!("../migrations/004_automatic_break_timer.sql"),
    ),
    (
        5,
        "completion sounds",
        include_str!("../migrations/005_completion_sounds.sql"),
    ),
    (
        6,
        "activity corrections",
        include_str!("../migrations/006_activity_corrections.sql"),
    ),
];
const DEFAULT_SETTINGS_SQL: &str = include_str!("../sql/default_settings.sql");
const RESET_THEME_SQL: &str = "
    INSERT INTO app_settings (key, value_json, updated_at)
    VALUES ('appearance.accent', '\"#2388FF\"', unixepoch('subsec') * 1000)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at;
    INSERT INTO app_settings (key, value_json, updated_at)
    VALUES ('appearance.background', '\"#050B14\"', unixepoch('subsec') * 1000)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at;
";
const RESTORE_INTERRUPTION_DEFAULTS_SQL: &str = "
    UPDATE interruption_presets SET is_enabled = 0, updated_at = 0 WHERE is_default = 0;
    INSERT INTO interruption_presets
      (id, name, sort_order, is_enabled, is_default, created_at, updated_at)
    VALUES
      ('preset_meeting', 'Meeting', 0, 1, 1, 0, 0),
      ('preset_coworker', 'Coworker', 1, 1, 1, 0, 0),
      ('preset_production_issue', 'Production Issue', 2, 1, 1, 0, 0),
      ('preset_washroom', 'Washroom', 3, 1, 1, 0, 0),
      ('preset_family_issue', 'Family Issue', 4, 1, 1, 0, 0),
      ('preset_other', 'Other', 5, 1, 1, 0, 0)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      sort_order = excluded.sort_order,
      is_enabled = excluded.is_enabled,
      is_default = excluded.is_default,
      updated_at = excluded.updated_at;
";

pub struct DatabaseState {
    connection: Mutex<Option<Connection>>,
    app_data_dir: PathBuf,
    database_path: PathBuf,
    screenshots_dir: PathBuf,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseHealth {
    database_path: String,
    screenshots_path: String,
    schema_version: i64,
    integrity: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredWindowPlacement {
    pub x: i32,
    pub y: i32,
    pub width: f64,
    pub height: f64,
    pub scale_factor: f64,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupManifest {
    format: String,
    format_version: i64,
    database_schema_version: i64,
    created_at: i64,
    app_version: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    safety_backup_path: String,
    schema_version: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteResult {
    rows_affected: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteAttachmentInput {
    pub id: Option<String>,
    pub name: String,
    pub mime_type: String,
    pub data_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveTaskNoteInput {
    pub id: String,
    pub task_id: String,
    pub body: String,
    pub attachments: Vec<NoteAttachmentInput>,
    pub now: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteAttachmentRecord {
    id: String,
    name: String,
    mime_type: String,
    relative_path: String,
    width: i64,
    height: i64,
    file_size: i64,
    data_url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskNoteRecord {
    id: String,
    task_id: String,
    body: String,
    created_at: i64,
    updated_at: i64,
    attachments: Vec<NoteAttachmentRecord>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionNoteInput {
    pub task_id: Option<String>,
    pub body: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusMutationResult {
    session_id: String,
    status: String,
    current_task_id: Option<String>,
    target_duration_seconds: i64,
    started_at: i64,
    ended_at: Option<i64>,
    focused_milliseconds: i64,
    open_activity: Option<JsonValue>,
}

struct StoredScreenshot {
    id: String,
    relative_path: String,
    original_filename: String,
    mime_type: String,
    width: i64,
    height: i64,
    file_size: i64,
    sort_order: i64,
    created_at: i64,
}

pub fn initialize(app: &AppHandle) -> Result<DatabaseState, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let data_dir = app_data_dir.join("data");
    let screenshots_dir = app_data_dir.join("screenshots");
    fs::create_dir_all(&data_dir).map_err(|error| error.to_string())?;
    fs::create_dir_all(&screenshots_dir).map_err(|error| error.to_string())?;

    let database_path = data_dir.join("flowo.sqlite");
    let mut connection = open_connection(&database_path)?;
    run_migrations(&mut connection)?;

    Ok(DatabaseState {
        connection: Mutex::new(Some(connection)),
        app_data_dir,
        database_path,
        screenshots_dir,
    })
}

pub fn setting_bool(state: &DatabaseState, key: &str, fallback: bool) -> bool {
    let Ok(guard) = state.connection.lock() else {
        return fallback;
    };
    let Some(connection) = guard.as_ref() else {
        return fallback;
    };
    let value = connection
        .query_row(
            "SELECT value_json FROM app_settings WHERE key = ?1",
            [key],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .ok()
        .flatten();
    value
        .and_then(|value| serde_json::from_str::<bool>(&value).ok())
        .unwrap_or(fallback)
}

pub fn setting_string(state: &DatabaseState, key: &str, fallback: &str) -> String {
    let Ok(guard) = state.connection.lock() else {
        return fallback.to_string();
    };
    let Some(connection) = guard.as_ref() else {
        return fallback.to_string();
    };
    let value = connection
        .query_row(
            "SELECT value_json FROM app_settings WHERE key = ?1",
            [key],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .ok()
        .flatten();
    value
        .and_then(|value| serde_json::from_str::<String>(&value).ok())
        .unwrap_or_else(|| fallback.to_string())
}

pub fn window_placement(state: &DatabaseState) -> Option<StoredWindowPlacement> {
    let guard = state.connection.lock().ok()?;
    let connection = guard.as_ref()?;
    let value = connection
        .query_row(
            "SELECT value_json FROM app_settings WHERE key = 'desktop.windowPlacement'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .ok()??;
    serde_json::from_str(&value).ok()
}

pub fn save_window_placement(
    state: &DatabaseState,
    placement: &StoredWindowPlacement,
) -> Result<(), String> {
    let value = serde_json::to_string(placement).map_err(|error| error.to_string())?;
    let guard = state
        .connection
        .lock()
        .map_err(|_| "database connection lock was poisoned".to_string())?;
    let connection = guard
        .as_ref()
        .ok_or("database is temporarily unavailable")?;
    connection
        .execute(
            "INSERT INTO app_settings (key, value_json, updated_at)
             VALUES ('desktop.windowPlacement', ?1, unixepoch('subsec') * 1000)
             ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
            [value],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn open_connection(path: &Path) -> Result<Connection, String> {
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    connection
        .busy_timeout(Duration::from_millis(5_000))
        .map_err(|error| error.to_string())?;
    connection
        .execute_batch(
            "PRAGMA foreign_keys = ON;\nPRAGMA journal_mode = WAL;\nPRAGMA busy_timeout = 5000;",
        )
        .map_err(|error| error.to_string())?;
    Ok(connection)
}

fn run_migrations(connection: &mut Connection) -> Result<(), String> {
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS _flowo_migrations (\n\
                version INTEGER PRIMARY KEY NOT NULL,\n\
                description TEXT NOT NULL,\n\
                applied_at INTEGER NOT NULL\n\
             );",
        )
        .map_err(|error| error.to_string())?;

    for (version, description, sql) in MIGRATIONS {
        let applied = connection
            .query_row(
                "SELECT 1 FROM _flowo_migrations WHERE version = ?1",
                [version],
                |_| Ok(()),
            )
            .optional()
            .map_err(|error| error.to_string())?
            .is_some();
        if applied {
            continue;
        }

        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|error| error.to_string())?;
        transaction
            .execute_batch(sql)
            .map_err(|error| format!("migration {version} ({description}) failed: {error}"))?;
        transaction
            .execute(
                "INSERT INTO _flowo_migrations (version, description, applied_at) VALUES (?1, ?2, unixepoch('subsec') * 1000)",
                params![version, description],
            )
            .map_err(|error| error.to_string())?;
        transaction.commit().map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn schema_version(connection: &Connection) -> Result<i64, String> {
    connection
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM _flowo_migrations",
            [],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())
}

fn sql_parameter(value: JsonValue) -> Result<SqlValue, String> {
    match value {
        JsonValue::Null => Ok(SqlValue::Null),
        JsonValue::Bool(value) => Ok(SqlValue::Integer(i64::from(value))),
        JsonValue::Number(value) => value
            .as_i64()
            .map(SqlValue::Integer)
            .or_else(|| value.as_f64().map(SqlValue::Real))
            .ok_or_else(|| "SQL number is outside the supported range".to_string()),
        JsonValue::String(value) => Ok(SqlValue::Text(value)),
        JsonValue::Array(_) | JsonValue::Object(_) => serde_json::to_string(&value)
            .map(SqlValue::Text)
            .map_err(|error| error.to_string()),
    }
}

fn json_column(value: ValueRef<'_>) -> JsonValue {
    match value {
        ValueRef::Null => JsonValue::Null,
        ValueRef::Integer(value) => value.into(),
        ValueRef::Real(value) => json!(value),
        ValueRef::Text(value) => JsonValue::String(String::from_utf8_lossy(value).into_owned()),
        ValueRef::Blob(value) => JsonValue::String(BASE64.encode(value)),
    }
}

fn state_connection<'a>(
    state: &'a State<'_, DatabaseState>,
) -> Result<std::sync::MutexGuard<'a, Option<Connection>>, String> {
    state
        .connection
        .lock()
        .map_err(|_| "database connection lock was poisoned".to_string())
}

fn starts_with_keyword(sql: &str, allowed: &[&str]) -> bool {
    let keyword = sql
        .trim_start()
        .split(|character: char| character.is_whitespace() || character == '(')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    allowed.iter().any(|allowed| keyword == *allowed)
}

fn validate_identifier(value: &str, label: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 128
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '_' | '-'))
    {
        return Err(format!("invalid {label}"));
    }
    Ok(())
}

#[tauri::command]
pub fn database_execute(
    state: State<'_, DatabaseState>,
    sql: String,
    params: Vec<JsonValue>,
) -> Result<ExecuteResult, String> {
    if !starts_with_keyword(&sql, &["INSERT", "UPDATE", "DELETE"]) {
        return Err("database_execute only accepts parameterized data mutations".to_string());
    }
    let values = params
        .into_iter()
        .map(sql_parameter)
        .collect::<Result<Vec<_>, _>>()?;
    let guard = state_connection(&state)?;
    let connection = guard
        .as_ref()
        .ok_or("database is temporarily unavailable")?;
    let rows_affected = connection
        .execute(&sql, params_from_iter(values))
        .map_err(|error| error.to_string())?;
    Ok(ExecuteResult { rows_affected })
}

#[tauri::command]
pub fn database_select(
    state: State<'_, DatabaseState>,
    sql: String,
    params: Vec<JsonValue>,
) -> Result<Vec<JsonValue>, String> {
    if !starts_with_keyword(&sql, &["SELECT"]) {
        return Err("database_select only accepts read queries".to_string());
    }
    let values = params
        .into_iter()
        .map(sql_parameter)
        .collect::<Result<Vec<_>, _>>()?;
    let guard = state_connection(&state)?;
    let connection = guard
        .as_ref()
        .ok_or("database is temporarily unavailable")?;
    let mut statement = connection
        .prepare(&sql)
        .map_err(|error| error.to_string())?;
    let names = statement
        .column_names()
        .iter()
        .map(|name| name.to_string())
        .collect::<Vec<_>>();
    let mut rows = statement
        .query(params_from_iter(values))
        .map_err(|error| error.to_string())?;
    let mut result = Vec::new();
    while let Some(row) = rows.next().map_err(|error| error.to_string())? {
        let mut object = Map::new();
        for (index, name) in names.iter().enumerate() {
            object.insert(
                name.clone(),
                json_column(row.get_ref(index).map_err(|error| error.to_string())?),
            );
        }
        result.push(JsonValue::Object(object));
    }
    Ok(result)
}

#[tauri::command]
pub fn database_health(state: State<'_, DatabaseState>) -> Result<DatabaseHealth, String> {
    let guard = state_connection(&state)?;
    let connection = guard
        .as_ref()
        .ok_or("database is temporarily unavailable")?;
    let schema_version = connection
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM _flowo_migrations",
            [],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    let integrity = connection
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    Ok(DatabaseHealth {
        database_path: state.database_path.to_string_lossy().into_owned(),
        screenshots_path: state.screenshots_dir.to_string_lossy().into_owned(),
        schema_version,
        integrity,
    })
}

fn collect_files(root: &Path) -> Result<Vec<PathBuf>, String> {
    if !root.exists() {
        return Ok(Vec::new());
    }
    let mut pending = vec![root.to_path_buf()];
    let mut files = Vec::new();
    while let Some(directory) = pending.pop() {
        for entry in fs::read_dir(&directory).map_err(|error| error.to_string())? {
            let entry = entry.map_err(|error| error.to_string())?;
            let file_type = entry.file_type().map_err(|error| error.to_string())?;
            if file_type.is_dir() {
                pending.push(entry.path());
            } else if file_type.is_file() {
                files.push(entry.path());
            }
        }
    }
    Ok(files)
}

fn export_backup_locked(
    connection: &Connection,
    state: &DatabaseState,
    destination: &Path,
) -> Result<(), String> {
    let destination_dir = destination.parent().unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(destination_dir).map_err(|error| error.to_string())?;
    let temporary = tempfile::tempdir().map_err(|error| error.to_string())?;
    let snapshot_path = temporary.path().join("flowo.sqlite");
    connection
        .backup(DatabaseName::Main, &snapshot_path, None)
        .map_err(|error| error.to_string())?;

    let manifest = BackupManifest {
        format: "flowo-backup".to_string(),
        format_version: 1,
        database_schema_version: schema_version(connection)?,
        created_at: now_milliseconds(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
    };
    let staged_archive =
        tempfile::NamedTempFile::new_in(destination_dir).map_err(|error| error.to_string())?;
    let archive_file = staged_archive.reopen().map_err(|error| error.to_string())?;
    let mut archive = ZipWriter::new(archive_file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    archive
        .start_file("manifest.json", options)
        .map_err(|error| error.to_string())?;
    archive
        .write_all(
            serde_json::to_string_pretty(&manifest)
                .map_err(|error| error.to_string())?
                .as_bytes(),
        )
        .map_err(|error| error.to_string())?;
    archive
        .start_file("flowo.sqlite", options)
        .map_err(|error| error.to_string())?;
    archive
        .write_all(&fs::read(&snapshot_path).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())?;

    let referenced = {
        let mut statement = connection
            .prepare("SELECT relative_path FROM note_screenshots ORDER BY relative_path")
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| error.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?
    };
    for relative_path in referenced {
        let path = path_for_relative(&state.screenshots_dir, &relative_path)?;
        if !path.is_file() {
            return Err(format!("referenced screenshot is missing: {relative_path}"));
        }
        archive
            .start_file(relative_path.replace('\\', "/"), options)
            .map_err(|error| error.to_string())?;
        archive
            .write_all(&fs::read(path).map_err(|error| error.to_string())?)
            .map_err(|error| error.to_string())?;
    }
    archive.finish().map_err(|error| error.to_string())?;
    staged_archive
        .persist(destination)
        .map_err(|error| error.error.to_string())?;
    Ok(())
}

fn now_milliseconds() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[tauri::command]
pub fn database_export_backup(
    state: State<'_, DatabaseState>,
    destination: String,
) -> Result<String, String> {
    let mut path = PathBuf::from(destination);
    if path.extension().and_then(|extension| extension.to_str()) != Some("flowo") {
        path.set_extension("flowo");
    }
    let guard = state_connection(&state)?;
    let connection = guard
        .as_ref()
        .ok_or("database is temporarily unavailable")?;
    export_backup_locked(connection, &state, &path)?;
    Ok(path.to_string_lossy().into_owned())
}

fn copy_directory(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(|error| error.to_string())?;
    for file in collect_files(source)? {
        let relative = file
            .strip_prefix(source)
            .map_err(|error| error.to_string())?;
        let target = destination.join(relative);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        fs::copy(&file, target).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn database_import_backup(
    state: State<'_, DatabaseState>,
    source: String,
) -> Result<ImportResult, String> {
    let source = PathBuf::from(source);
    if !source.is_file() {
        return Err("backup file was not found".to_string());
    }
    let temporary = tempfile::tempdir().map_err(|error| error.to_string())?;
    let archive_file = fs::File::open(&source).map_err(|error| error.to_string())?;
    let mut archive = ZipArchive::new(archive_file).map_err(|error| error.to_string())?;
    let mut expanded_size = 0_u64;
    for index in 0..archive.len() {
        let mut file = archive.by_index(index).map_err(|error| error.to_string())?;
        expanded_size = expanded_size.saturating_add(file.size());
        if expanded_size > 2 * 1024 * 1024 * 1024 {
            return Err("backup expands beyond the supported 2 GB limit".to_string());
        }
        let enclosed = file
            .enclosed_name()
            .ok_or("backup contains an unsafe path")?
            .to_path_buf();
        let normalized = enclosed.to_string_lossy().replace('\\', "/");
        if normalized != "manifest.json"
            && normalized != "flowo.sqlite"
            && !normalized.starts_with("screenshots/")
        {
            return Err(format!("backup contains an unexpected file: {normalized}"));
        }
        let destination = temporary.path().join(&enclosed);
        if file.is_dir() {
            fs::create_dir_all(&destination).map_err(|error| error.to_string())?;
            continue;
        }
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let mut output = fs::File::create(destination).map_err(|error| error.to_string())?;
        std::io::copy(&mut file, &mut output).map_err(|error| error.to_string())?;
    }

    let manifest: BackupManifest = serde_json::from_slice(
        &fs::read(temporary.path().join("manifest.json"))
            .map_err(|_| "backup manifest is missing")?,
    )
    .map_err(|error| format!("invalid backup manifest: {error}"))?;
    if manifest.format != "flowo-backup" || manifest.format_version != 1 {
        return Err("unsupported Flowo backup format".to_string());
    }
    if manifest.database_schema_version > MIGRATIONS.last().map(|item| item.0).unwrap_or(0) {
        return Err("backup was created by a newer, unsupported Flowo version".to_string());
    }

    let imported_database_path = temporary.path().join("flowo.sqlite");
    if !imported_database_path.is_file() {
        return Err("backup database is missing".to_string());
    }
    let mut imported = open_connection(&imported_database_path)?;
    run_migrations(&mut imported)?;
    let integrity: String = imported
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    if integrity != "ok" {
        return Err(format!(
            "backup database failed integrity validation: {integrity}"
        ));
    }
    let foreign_key_errors: i64 = imported
        .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
            row.get(0)
        })
        .map_err(|error| error.to_string())?;
    if foreign_key_errors != 0 {
        return Err("backup database contains invalid relationships".to_string());
    }
    let referenced = {
        let mut statement = imported
            .prepare("SELECT relative_path FROM note_screenshots")
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| error.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?
    };
    for relative_path in &referenced {
        let normalized = relative_path.replace('\\', "/");
        if !normalized.starts_with("screenshots/") || !temporary.path().join(&normalized).is_file()
        {
            return Err(format!(
                "backup screenshot is missing or invalid: {relative_path}"
            ));
        }
    }
    drop(imported);

    let import_id = Uuid::new_v4().to_string();
    let staged_screenshots = state
        .app_data_dir
        .join(format!("screenshots-importing-{import_id}"));
    copy_directory(&temporary.path().join("screenshots"), &staged_screenshots)?;
    let previous_screenshots = state
        .app_data_dir
        .join(format!("screenshots-previous-{import_id}"));
    let backups_dir = state.app_data_dir.join("backups");
    fs::create_dir_all(&backups_dir).map_err(|error| error.to_string())?;
    let safety_backup = backups_dir.join(format!("flowo-pre-import-{}.flowo", now_milliseconds()));

    let mut guard = state_connection(&state)?;
    let connection = guard
        .as_mut()
        .ok_or("database is temporarily unavailable")?;
    export_backup_locked(connection, &state, &safety_backup)?;
    if state.screenshots_dir.exists() {
        fs::rename(&state.screenshots_dir, &previous_screenshots)
            .map_err(|error| error.to_string())?;
    }
    if let Err(error) = fs::rename(&staged_screenshots, &state.screenshots_dir) {
        if previous_screenshots.exists() {
            let _ = fs::rename(&previous_screenshots, &state.screenshots_dir);
        }
        return Err(error.to_string());
    }

    let restore_result = connection.restore(
        DatabaseName::Main,
        &imported_database_path,
        None::<fn(Progress)>,
    );
    if let Err(error) = restore_result {
        let _ = fs::remove_dir_all(&state.screenshots_dir);
        if previous_screenshots.exists() {
            let _ = fs::rename(&previous_screenshots, &state.screenshots_dir);
        }
        return Err(format!(
            "backup restore failed; existing data was kept: {error}"
        ));
    }
    let _ = fs::remove_dir_all(previous_screenshots);
    connection
        .execute_batch(
            "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;",
        )
        .map_err(|error| error.to_string())?;
    let schema_version = schema_version(connection)?;
    Ok(ImportResult {
        safety_backup_path: safety_backup.to_string_lossy().into_owned(),
        schema_version,
    })
}

fn parse_data_url(data_url: &str, declared_mime: &str) -> Result<(Vec<u8>, &'static str), String> {
    let (header, encoded) = data_url
        .split_once(',')
        .ok_or("screenshot data must be a base64 data URL")?;
    if !header.ends_with(";base64") || !header.starts_with("data:") {
        return Err("screenshot data must be a base64 data URL".to_string());
    }
    let header_mime = header
        .trim_start_matches("data:")
        .trim_end_matches(";base64");
    if header_mime != declared_mime {
        return Err("screenshot MIME type does not match its data".to_string());
    }
    let extension = match declared_mime {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/webp" => "webp",
        _ => return Err("only PNG, JPEG, and WebP screenshots are supported".to_string()),
    };
    let bytes = BASE64
        .decode(encoded)
        .map_err(|_| "invalid screenshot base64 data".to_string())?;
    if bytes.is_empty() || bytes.len() > 5 * 1024 * 1024 {
        return Err("screenshots must be between 1 byte and 5 MB".to_string());
    }
    let format =
        image::guess_format(&bytes).map_err(|_| "unsupported screenshot data".to_string())?;
    let format_matches = matches!(
        (declared_mime, format),
        ("image/png", image::ImageFormat::Png)
            | ("image/jpeg", image::ImageFormat::Jpeg)
            | ("image/webp", image::ImageFormat::WebP)
    );
    if !format_matches {
        return Err("screenshot file contents do not match the declared MIME type".to_string());
    }
    Ok((bytes, extension))
}

fn path_for_relative(screenshots_dir: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let normalized = relative_path.replace('\\', "/");
    let relative = Path::new(&normalized);
    if relative.is_absolute()
        || normalized.contains(':')
        || relative
            .components()
            .any(|part| matches!(part, std::path::Component::ParentDir))
        || !normalized.starts_with("screenshots/")
    {
        return Err("invalid screenshot relative path".to_string());
    }
    let without_root = normalized.trim_start_matches("screenshots/");
    Ok(screenshots_dir.join(without_root))
}

fn data_url_for_file(screenshots_dir: &Path, relative_path: &str, mime_type: &str) -> String {
    path_for_relative(screenshots_dir, relative_path)
        .ok()
        .and_then(|path| fs::read(path).ok())
        .map(|bytes| format!("data:{mime_type};base64,{}", BASE64.encode(bytes)))
        .unwrap_or_default()
}

fn load_task_notes(
    connection: &Connection,
    screenshots_dir: &Path,
    task_id: &str,
) -> Result<Vec<TaskNoteRecord>, String> {
    let mut note_statement = connection
        .prepare(
            "SELECT id, task_id, body, created_at, updated_at\n\
               FROM task_notes WHERE task_id = ?1 ORDER BY created_at DESC",
        )
        .map_err(|error| error.to_string())?;
    let note_rows = note_statement
        .query_map([task_id], |row| {
            Ok(TaskNoteRecord {
                id: row.get(0)?,
                task_id: row.get(1)?,
                body: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
                attachments: Vec::new(),
            })
        })
        .map_err(|error| error.to_string())?;
    let mut notes = note_rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    let mut attachment_statement = connection
        .prepare(
            "SELECT id, original_filename, mime_type, relative_path, width, height, file_size\n\
               FROM note_screenshots WHERE note_id = ?1 ORDER BY sort_order, created_at",
        )
        .map_err(|error| error.to_string())?;
    for note in &mut notes {
        let rows = attachment_statement
            .query_map([&note.id], |row| {
                let mime_type: String = row.get(2)?;
                let relative_path: String = row.get(3)?;
                Ok(NoteAttachmentRecord {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    mime_type: mime_type.clone(),
                    relative_path: relative_path.clone(),
                    width: row.get(4)?,
                    height: row.get(5)?,
                    file_size: row.get(6)?,
                    data_url: data_url_for_file(screenshots_dir, &relative_path, &mime_type),
                })
            })
            .map_err(|error| error.to_string())?;
        note.attachments = rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;
    }
    Ok(notes)
}

#[tauri::command]
pub fn database_list_task_notes(
    state: State<'_, DatabaseState>,
    task_id: String,
) -> Result<Vec<TaskNoteRecord>, String> {
    let guard = state_connection(&state)?;
    let connection = guard
        .as_ref()
        .ok_or("database is temporarily unavailable")?;
    load_task_notes(connection, &state.screenshots_dir, &task_id)
}

#[tauri::command]
pub fn database_save_task_note(
    state: State<'_, DatabaseState>,
    input: SaveTaskNoteInput,
) -> Result<Vec<TaskNoteRecord>, String> {
    validate_identifier(&input.id, "note id")?;
    validate_identifier(&input.task_id, "task id")?;
    if input.body.trim().is_empty() {
        return Err("note body cannot be empty".to_string());
    }
    if input.attachments.len() > 4 {
        return Err("a note can contain at most four screenshots".to_string());
    }

    let mut guard = state_connection(&state)?;
    let connection = guard
        .as_mut()
        .ok_or("database is temporarily unavailable")?;
    let existing = {
        let mut statement = connection
            .prepare(
                "SELECT id, relative_path, original_filename, mime_type, width, height, file_size, sort_order, created_at\n\
                   FROM note_screenshots WHERE note_id = ?1",
            )
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map([&input.id], |row| {
                Ok(StoredScreenshot {
                    id: row.get(0)?,
                    relative_path: row.get(1)?,
                    original_filename: row.get(2)?,
                    mime_type: row.get(3)?,
                    width: row.get(4)?,
                    height: row.get(5)?,
                    file_size: row.get(6)?,
                    sort_order: row.get(7)?,
                    created_at: row.get(8)?,
                })
            })
            .map_err(|error| error.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?
    };
    let mut existing_by_id = existing
        .into_iter()
        .map(|attachment| (attachment.id.clone(), attachment))
        .collect::<HashMap<_, _>>();
    let note_directory = state.screenshots_dir.join(&input.id);
    fs::create_dir_all(&note_directory).map_err(|error| error.to_string())?;

    let mut records = Vec::new();
    let mut created_files = Vec::new();
    for (sort_order, attachment) in input.attachments.iter().enumerate() {
        if let Some(existing) = attachment
            .id
            .as_ref()
            .and_then(|id| existing_by_id.remove(id))
        {
            records.push(StoredScreenshot {
                sort_order: sort_order as i64,
                ..existing
            });
            continue;
        }

        let data_url = attachment
            .data_url
            .as_deref()
            .ok_or("new screenshots must include image data")?;
        let (bytes, extension) = parse_data_url(data_url, &attachment.mime_type)?;
        let image =
            image::load_from_memory(&bytes).map_err(|_| "invalid screenshot image".to_string())?;
        let (width, height) = image.dimensions();
        let screenshot_id = format!("screenshot_{}", Uuid::new_v4());
        let relative_path = format!("screenshots/{}/{}.{}", input.id, screenshot_id, extension);
        let absolute_path = path_for_relative(&state.screenshots_dir, &relative_path)?;
        fs::write(&absolute_path, &bytes).map_err(|error| error.to_string())?;
        created_files.push(absolute_path);
        records.push(StoredScreenshot {
            id: screenshot_id,
            relative_path,
            original_filename: attachment.name.clone(),
            mime_type: attachment.mime_type.clone(),
            width: i64::from(width),
            height: i64::from(height),
            file_size: bytes.len() as i64,
            sort_order: sort_order as i64,
            created_at: input.now,
        });
    }

    let removed_paths = existing_by_id
        .values()
        .map(|attachment| attachment.relative_path.clone())
        .collect::<Vec<_>>();
    let transaction_result = (|| -> Result<(), String> {
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|error| error.to_string())?;
        transaction
            .execute(
                "INSERT INTO task_notes (id, task_id, body, created_at, updated_at)\n\
                 VALUES (?1, ?2, ?3, ?4, ?4)\n\
                 ON CONFLICT(id) DO UPDATE SET task_id = excluded.task_id, body = excluded.body, updated_at = excluded.updated_at",
                params![input.id, input.task_id, input.body.trim(), input.now],
            )
            .map_err(|error| error.to_string())?;
        transaction
            .execute(
                "DELETE FROM note_screenshots WHERE note_id = ?1",
                [&input.id],
            )
            .map_err(|error| error.to_string())?;
        for record in &records {
            transaction
                .execute(
                    "INSERT INTO note_screenshots\n\
                     (id, note_id, relative_path, original_filename, mime_type, width, height, file_size, sort_order, created_at)\n\
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                    params![
                        record.id,
                        input.id,
                        record.relative_path,
                        record.original_filename,
                        record.mime_type,
                        record.width,
                        record.height,
                        record.file_size,
                        record.sort_order,
                        record.created_at,
                    ],
                )
                .map_err(|error| error.to_string())?;
        }
        transaction.commit().map_err(|error| error.to_string())
    })();

    if let Err(error) = transaction_result {
        for path in created_files {
            let _ = fs::remove_file(path);
        }
        return Err(error);
    }
    for relative_path in removed_paths {
        if let Ok(path) = path_for_relative(&state.screenshots_dir, &relative_path) {
            let _ = fs::remove_file(path);
        }
    }
    let _ = fs::remove_dir(&note_directory);
    load_task_notes(connection, &state.screenshots_dir, &input.task_id)
}

fn screenshot_paths_for_query(
    connection: &Connection,
    query: &str,
    id: &str,
) -> Result<Vec<String>, String> {
    let mut statement = connection
        .prepare(query)
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([id], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn remove_screenshot_files(screenshots_dir: &Path, paths: Vec<String>) {
    let mut parent_dirs = HashSet::new();
    for relative_path in paths {
        if let Ok(path) = path_for_relative(screenshots_dir, &relative_path) {
            if let Some(parent) = path.parent() {
                parent_dirs.insert(parent.to_path_buf());
            }
            let _ = fs::remove_file(path);
        }
    }
    for directory in parent_dirs {
        let _ = fs::remove_dir(directory);
    }
}

#[tauri::command]
pub fn database_delete_task_note(
    state: State<'_, DatabaseState>,
    note_id: String,
) -> Result<(), String> {
    let guard = state_connection(&state)?;
    let connection = guard
        .as_ref()
        .ok_or("database is temporarily unavailable")?;
    let paths = screenshot_paths_for_query(
        connection,
        "SELECT relative_path FROM note_screenshots WHERE note_id = ?1",
        &note_id,
    )?;
    connection
        .execute("DELETE FROM task_notes WHERE id = ?1", [&note_id])
        .map_err(|error| error.to_string())?;
    remove_screenshot_files(&state.screenshots_dir, paths);
    Ok(())
}

#[tauri::command]
pub fn database_delete_task(
    state: State<'_, DatabaseState>,
    task_id: String,
) -> Result<(), String> {
    let mut guard = state_connection(&state)?;
    let connection = guard
        .as_mut()
        .ok_or("database is temporarily unavailable")?;
    let paths = screenshot_paths_for_query(
        connection,
        "SELECT shot.relative_path FROM note_screenshots shot\n\
         JOIN task_notes note ON note.id = shot.note_id WHERE note.task_id = ?1",
        &task_id,
    )?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    transaction
        .execute("DELETE FROM tasks WHERE id = ?1", [&task_id])
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;
    remove_screenshot_files(&state.screenshots_dir, paths);
    Ok(())
}

fn new_id(prefix: &str) -> String {
    format!("{prefix}_{}", Uuid::new_v4())
}

fn ensure_no_open_activity(transaction: &Transaction<'_>, session_id: &str) -> Result<(), String> {
    let count: i64 = transaction
        .query_row(
            "SELECT\n\
                (SELECT COUNT(*) FROM work_segments WHERE focus_session_id = ?1 AND ended_at IS NULL) +\n\
                (SELECT COUNT(*) FROM interruptions WHERE focus_session_id = ?1 AND ended_at IS NULL) +\n\
                (SELECT COUNT(*) FROM breaks WHERE focus_session_id = ?1 AND ended_at IS NULL)",
            [session_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if count > 0 {
        Err("focus session already has an open activity".to_string())
    } else {
        Ok(())
    }
}

fn close_all_open_activity(
    transaction: &Transaction<'_>,
    session_id: &str,
    now: i64,
) -> Result<(), String> {
    for table in ["work_segments", "interruptions", "breaks"] {
        transaction
            .execute(
                &format!(
                    "UPDATE {table} SET ended_at = MAX(?1, started_at + 1) WHERE focus_session_id = ?2 AND ended_at IS NULL"
                ),
                params![now, session_id],
            )
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn session_status(transaction: &Transaction<'_>, session_id: &str) -> Result<String, String> {
    transaction
        .query_row(
            "SELECT status FROM focus_sessions WHERE id = ?1",
            [session_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "focus session was not found".to_string())
}

fn focus_result(
    connection: &Connection,
    session_id: &str,
    now: i64,
) -> Result<FocusMutationResult, String> {
    let (status, current_task_id, target_duration_seconds, started_at, ended_at) = connection
        .query_row(
            "SELECT status, current_task_id, target_duration_seconds, started_at, ended_at\n\
             FROM focus_sessions WHERE id = ?1",
            [session_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            },
        )
        .optional()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "focus session was not found".to_string())?;
    let focused_milliseconds = connection
        .query_row(
            "SELECT COALESCE(SUM(MAX(0, COALESCE(ended_at, ?2) - started_at)), 0)\n\
             FROM work_segments WHERE focus_session_id = ?1",
            params![session_id, now],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    let open_activity = connection
        .query_row(
            "SELECT type, id, started_at, task_id, preset_id, note FROM (\n\
                 SELECT 'focus' AS type, id, started_at, task_id, NULL AS preset_id, NULL AS note\n\
                   FROM work_segments WHERE focus_session_id = ?1 AND ended_at IS NULL\n\
                 UNION ALL\n\
                 SELECT 'interruption', id, started_at, NULL, preset_id, note\n\
                   FROM interruptions WHERE focus_session_id = ?1 AND ended_at IS NULL\n\
                 UNION ALL\n\
                 SELECT 'break', id, started_at, NULL, NULL, note\n\
                   FROM breaks WHERE focus_session_id = ?1 AND ended_at IS NULL\n\
             ) LIMIT 1",
            [session_id],
            |row| {
                Ok(json!({
                    "type": row.get::<_, String>(0)?,
                    "id": row.get::<_, String>(1)?,
                    "startedAt": row.get::<_, i64>(2)?,
                    "taskId": row.get::<_, Option<String>>(3)?,
                    "presetId": row.get::<_, Option<String>>(4)?,
                    "note": row.get::<_, Option<String>>(5)?,
                }))
            },
        )
        .optional()
        .map_err(|error| error.to_string())?;
    Ok(FocusMutationResult {
        session_id: session_id.to_string(),
        status,
        current_task_id,
        target_duration_seconds,
        started_at,
        ended_at,
        focused_milliseconds,
        open_activity,
    })
}

#[tauri::command]
pub fn focus_get_active(
    state: State<'_, DatabaseState>,
    now: i64,
) -> Result<Option<FocusMutationResult>, String> {
    let guard = state_connection(&state)?;
    let connection = guard
        .as_ref()
        .ok_or("database is temporarily unavailable")?;
    let id = connection
        .query_row(
            "SELECT id FROM focus_sessions WHERE status IN ('active', 'paused', 'interrupted') LIMIT 1",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    id.map(|id| focus_result(connection, &id, now)).transpose()
}

#[tauri::command]
pub fn focus_start(
    state: State<'_, DatabaseState>,
    task_id: Option<String>,
    target_duration_seconds: i64,
    now: i64,
) -> Result<FocusMutationResult, String> {
    if target_duration_seconds <= 0 {
        return Err("focus duration must be greater than zero".to_string());
    }
    let mut guard = state_connection(&state)?;
    let connection = guard
        .as_mut()
        .ok_or("database is temporarily unavailable")?;
    let session_id = new_id("session");
    let segment_id = new_id("segment");
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    let active_count: i64 = transaction
        .query_row(
            "SELECT COUNT(*) FROM focus_sessions WHERE status IN ('active', 'paused', 'interrupted')",
            [],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if active_count > 0 {
        return Err("another focus session is already active".to_string());
    }
    transaction
        .execute(
            "INSERT INTO focus_sessions\n\
             (id, current_task_id, target_duration_seconds, status, started_at, created_at, updated_at)\n\
             VALUES (?1, ?2, ?3, 'active', ?4, ?4, ?4)",
            params![session_id, task_id, target_duration_seconds, now],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "INSERT INTO work_segments (id, focus_session_id, task_id, started_at, source, created_at)\n\
             VALUES (?1, ?2, ?3, ?4, 'timer', ?4)",
            params![segment_id, session_id, task_id, now],
        )
        .map_err(|error| error.to_string())?;
    if let Some(task_id) = &task_id {
        transaction
            .execute(
                "UPDATE tasks SET status = CASE WHEN status = 'todo' THEN 'in_progress' ELSE status END, updated_at = ?2 WHERE id = ?1",
                params![task_id, now],
            )
            .map_err(|error| error.to_string())?;
    }
    transaction.commit().map_err(|error| error.to_string())?;
    focus_result(connection, &session_id, now)
}

#[tauri::command]
pub fn focus_switch_task(
    state: State<'_, DatabaseState>,
    session_id: String,
    task_id: Option<String>,
    now: i64,
) -> Result<FocusMutationResult, String> {
    let mut guard = state_connection(&state)?;
    let connection = guard
        .as_mut()
        .ok_or("database is temporarily unavailable")?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    let status = session_status(&transaction, &session_id)?;
    if !matches!(status.as_str(), "active" | "paused" | "interrupted") {
        return Err("tasks can only be switched during a running focus session".to_string());
    }
    if status == "active" {
        close_all_open_activity(&transaction, &session_id, now)?;
        ensure_no_open_activity(&transaction, &session_id)?;
    }
    transaction
        .execute(
            "UPDATE focus_sessions SET current_task_id = ?2, updated_at = ?3 WHERE id = ?1",
            params![session_id, task_id, now],
        )
        .map_err(|error| error.to_string())?;
    if status == "active" {
        transaction
            .execute(
                "INSERT INTO work_segments (id, focus_session_id, task_id, started_at, source, created_at)\n\
                 VALUES (?1, ?2, ?3, ?4, 'timer', ?4)",
                params![new_id("segment"), session_id, task_id, now],
            )
            .map_err(|error| error.to_string())?;
    }
    transaction.commit().map_err(|error| error.to_string())?;
    focus_result(connection, &session_id, now)
}

#[tauri::command]
pub fn focus_start_interruption(
    state: State<'_, DatabaseState>,
    session_id: String,
    preset_id: Option<String>,
    note: Option<String>,
    now: i64,
) -> Result<FocusMutationResult, String> {
    let mut guard = state_connection(&state)?;
    let connection = guard
        .as_mut()
        .ok_or("database is temporarily unavailable")?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    if session_status(&transaction, &session_id)? != "active" {
        return Err("only an active focus session can be interrupted".to_string());
    }
    close_all_open_activity(&transaction, &session_id, now)?;
    ensure_no_open_activity(&transaction, &session_id)?;
    transaction
        .execute(
            "INSERT INTO interruptions (id, focus_session_id, preset_id, started_at, note, source, created_at)\n\
             VALUES (?1, ?2, ?3, ?4, ?5, 'timer', ?4)",
            params![new_id("interruption"), session_id, preset_id, now, note],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "UPDATE focus_sessions SET status = 'interrupted', updated_at = ?2 WHERE id = ?1",
            params![session_id, now],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;
    focus_result(connection, &session_id, now)
}

#[tauri::command]
pub fn focus_resume_interruption(
    state: State<'_, DatabaseState>,
    session_id: String,
    preset_id: Option<String>,
    note: Option<String>,
    now: i64,
) -> Result<FocusMutationResult, String> {
    resume_with_activity(
        &state,
        &session_id,
        now,
        "interrupted",
        "interruptions",
        Some((preset_id, note)),
    )
}

#[tauri::command]
pub fn focus_pause(
    state: State<'_, DatabaseState>,
    session_id: String,
    note: Option<String>,
    now: i64,
) -> Result<FocusMutationResult, String> {
    let mut guard = state_connection(&state)?;
    let connection = guard
        .as_mut()
        .ok_or("database is temporarily unavailable")?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    if session_status(&transaction, &session_id)? != "active" {
        return Err("only an active focus session can be paused".to_string());
    }
    close_all_open_activity(&transaction, &session_id, now)?;
    ensure_no_open_activity(&transaction, &session_id)?;
    transaction
        .execute(
            "INSERT INTO breaks (id, focus_session_id, started_at, note, source, created_at)\n\
             VALUES (?1, ?2, ?3, ?4, 'timer', ?3)",
            params![new_id("break"), session_id, now, note],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "UPDATE focus_sessions SET status = 'paused', updated_at = ?2 WHERE id = ?1",
            params![session_id, now],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;
    focus_result(connection, &session_id, now)
}

fn resume_with_activity(
    state: &State<'_, DatabaseState>,
    session_id: &str,
    now: i64,
    expected_status: &str,
    activity_table: &str,
    interruption_details: Option<(Option<String>, Option<String>)>,
) -> Result<FocusMutationResult, String> {
    let mut guard = state_connection(state)?;
    let connection = guard
        .as_mut()
        .ok_or("database is temporarily unavailable")?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    if session_status(&transaction, session_id)? != expected_status {
        return Err(format!("focus session is not {expected_status}"));
    }
    if let Some((preset_id, note)) = interruption_details {
        transaction
            .execute(
                "UPDATE interruptions SET preset_id = COALESCE(?2, preset_id), note = COALESCE(?3, note)\n\
                 WHERE focus_session_id = ?1 AND ended_at IS NULL",
                params![session_id, preset_id, note],
            )
            .map_err(|error| error.to_string())?;
    }
    let changed = transaction
        .execute(
            &format!(
                "UPDATE {activity_table} SET ended_at = MAX(?1, started_at + 1) WHERE focus_session_id = ?2 AND ended_at IS NULL"
            ),
            params![now, session_id],
        )
        .map_err(|error| error.to_string())?;
    if changed != 1 {
        return Err(format!("expected one open {expected_status} activity"));
    }
    ensure_no_open_activity(&transaction, session_id)?;
    let task_id: Option<String> = transaction
        .query_row(
            "SELECT current_task_id FROM focus_sessions WHERE id = ?1",
            [session_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "UPDATE focus_sessions SET status = 'active', updated_at = ?2 WHERE id = ?1",
            params![session_id, now],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "INSERT INTO work_segments (id, focus_session_id, task_id, started_at, source, created_at)\n\
             VALUES (?1, ?2, ?3, ?4, 'timer', ?4)",
            params![new_id("segment"), session_id, task_id, now],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;
    focus_result(connection, session_id, now)
}

#[tauri::command]
pub fn focus_resume_pause(
    state: State<'_, DatabaseState>,
    session_id: String,
    now: i64,
) -> Result<FocusMutationResult, String> {
    resume_with_activity(&state, &session_id, now, "paused", "breaks", None)
}

#[tauri::command]
pub fn focus_complete(
    state: State<'_, DatabaseState>,
    session_id: String,
    notes: Vec<CompletionNoteInput>,
    now: i64,
) -> Result<FocusMutationResult, String> {
    let notes = notes
        .into_iter()
        .filter(|note| !note.body.trim().is_empty())
        .collect::<Vec<_>>();
    if notes.is_empty() && setting_bool(&state, "focus.requireCompletionNote", true) {
        return Err("at least one completion note is required".to_string());
    }
    finish_focus(&state, &session_id, notes, now, "completed")
}

#[tauri::command]
pub fn focus_cancel(
    state: State<'_, DatabaseState>,
    session_id: String,
    now: i64,
) -> Result<FocusMutationResult, String> {
    finish_focus(&state, &session_id, Vec::new(), now, "cancelled")
}

fn finish_focus(
    state: &State<'_, DatabaseState>,
    session_id: &str,
    notes: Vec<CompletionNoteInput>,
    now: i64,
    final_status: &str,
) -> Result<FocusMutationResult, String> {
    let mut guard = state_connection(state)?;
    let connection = guard
        .as_mut()
        .ok_or("database is temporarily unavailable")?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    let status = session_status(&transaction, session_id)?;
    if !matches!(status.as_str(), "active" | "paused" | "interrupted") {
        return Err("focus session has already ended".to_string());
    }
    close_all_open_activity(&transaction, session_id, now)?;
    ensure_no_open_activity(&transaction, session_id)?;
    transaction
        .execute(
            "UPDATE focus_sessions SET status = ?2, ended_at = ?3, updated_at = ?3 WHERE id = ?1",
            params![session_id, final_status, now],
        )
        .map_err(|error| error.to_string())?;
    for note in notes {
        transaction
            .execute(
                "INSERT INTO focus_session_notes (id, focus_session_id, task_id, body, created_at, updated_at)\n\
                 VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
                params![new_id("session_note"), session_id, note.task_id, note.body.trim(), now],
            )
            .map_err(|error| error.to_string())?;
    }
    transaction.commit().map_err(|error| error.to_string())?;
    focus_result(connection, session_id, now)
}

#[tauri::command]
pub fn database_delete_all_data(
    state: State<'_, DatabaseState>,
    confirmation: String,
) -> Result<(), String> {
    if confirmation != "DELETE ALL DATA" {
        return Err("type DELETE ALL DATA to confirm".to_string());
    }
    let mut guard = state_connection(&state)?;
    let connection = guard
        .as_mut()
        .ok_or("database is temporarily unavailable")?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    for table in [
        "saved_reports",
        "focus_session_notes",
        "work_segments",
        "interruptions",
        "breaks",
        "focus_sessions",
        "task_reminders",
        "note_screenshots",
        "task_notes",
        "tasks",
    ] {
        transaction
            .execute(&format!("DELETE FROM {table}"), [])
            .map_err(|error| error.to_string())?;
    }
    transaction
        .execute_batch("DELETE FROM interruption_presets; DELETE FROM app_settings;")
        .map_err(|error| error.to_string())?;
    transaction
        .execute_batch(RESTORE_INTERRUPTION_DEFAULTS_SQL)
        .map_err(|error| error.to_string())?;
    transaction
        .execute_batch(DEFAULT_SETTINGS_SQL)
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;
    if state.screenshots_dir.exists() {
        fs::remove_dir_all(&state.screenshots_dir).map_err(|error| error.to_string())?;
    }
    fs::create_dir_all(&state.screenshots_dir).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn database_reset_theme(state: State<'_, DatabaseState>) -> Result<(), String> {
    let mut guard = state_connection(&state)?;
    let connection = guard
        .as_mut()
        .ok_or("database is temporarily unavailable")?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    transaction
        .execute_batch(RESET_THEME_SQL)
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn database_restore_interruption_defaults(
    state: State<'_, DatabaseState>,
) -> Result<(), String> {
    let mut guard = state_connection(&state)?;
    let connection = guard
        .as_mut()
        .ok_or("database is temporarily unavailable")?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    transaction
        .execute_batch(RESTORE_INTERRUPTION_DEFAULTS_SQL)
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn database_reset_settings(state: State<'_, DatabaseState>) -> Result<(), String> {
    let mut guard = state_connection(&state)?;
    let connection = guard
        .as_mut()
        .ok_or("database is temporarily unavailable")?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    transaction
        .execute("DELETE FROM app_settings", [])
        .map_err(|error| error.to_string())?;
    transaction
        .execute_batch(DEFAULT_SETTINGS_SQL)
        .map_err(|error| error.to_string())?;
    transaction
        .execute_batch(RESTORE_INTERRUPTION_DEFAULTS_SQL)
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn migrated_connection() -> Connection {
        let mut connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch("PRAGMA foreign_keys = ON;")
            .unwrap();
        run_migrations(&mut connection).unwrap();
        connection
    }

    #[test]
    fn migration_builds_the_required_schema_and_seeds() {
        let connection = migrated_connection();
        let tables: HashSet<String> = connection
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        for table in [
            "tasks",
            "task_notes",
            "note_screenshots",
            "task_reminders",
            "focus_sessions",
            "work_segments",
            "focus_session_notes",
            "interruptions",
            "interruption_presets",
            "breaks",
            "saved_reports",
            "app_settings",
        ] {
            assert!(tables.contains(table), "missing table {table}");
        }
        let presets: i64 = connection
            .query_row("SELECT COUNT(*) FROM interruption_presets", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(presets, 6);
        let report_interruptions: String = connection
            .query_row(
                "SELECT value_json FROM app_settings WHERE key = 'reports.includeInterruptions'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let report_breaks: String = connection
            .query_row(
                "SELECT value_json FROM app_settings WHERE key = 'reports.includeBreaks'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(report_interruptions, "false");
        assert_eq!(report_breaks, "false");
    }

    #[test]
    fn theme_reset_does_not_change_other_preferences() {
        let connection = migrated_connection();
        connection
            .execute(
                "UPDATE app_settings SET value_json = '\"#FF0000\"' WHERE key = 'appearance.accent'",
                [],
            )
            .unwrap();
        connection
            .execute(
                "UPDATE app_settings SET value_json = '50' WHERE key = 'focus.defaultDuration'",
                [],
            )
            .unwrap();
        connection.execute_batch(RESET_THEME_SQL).unwrap();
        let accent: String = connection
            .query_row(
                "SELECT value_json FROM app_settings WHERE key = 'appearance.accent'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let duration: String = connection
            .query_row(
                "SELECT value_json FROM app_settings WHERE key = 'focus.defaultDuration'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(accent, "\"#2388FF\"");
        assert_eq!(duration, "50");
    }

    #[test]
    fn settings_reset_keeps_tasks_and_history() {
        let mut connection = migrated_connection();
        connection.execute("INSERT INTO tasks (id, title, status, created_at, updated_at) VALUES ('task', 'Preserved task', 'todo', 1, 1)", []).unwrap();
        connection.execute("INSERT INTO focus_sessions (id, target_duration_seconds, status, started_at, ended_at, created_at, updated_at) VALUES ('session', 1500, 'completed', 1, 2, 1, 2)", []).unwrap();
        let transaction = connection.transaction().unwrap();
        transaction.execute("DELETE FROM app_settings", []).unwrap();
        transaction.execute_batch(DEFAULT_SETTINGS_SQL).unwrap();
        transaction
            .execute_batch(RESTORE_INTERRUPTION_DEFAULTS_SQL)
            .unwrap();
        transaction.commit().unwrap();
        let tasks: i64 = connection
            .query_row("SELECT COUNT(*) FROM tasks", [], |row| row.get(0))
            .unwrap();
        let sessions: i64 = connection
            .query_row("SELECT COUNT(*) FROM focus_sessions", [], |row| row.get(0))
            .unwrap();
        assert_eq!(tasks, 1);
        assert_eq!(sessions, 1);
    }

    #[test]
    fn only_one_running_focus_session_is_allowed() {
        let connection = migrated_connection();
        connection.execute(
            "INSERT INTO focus_sessions (id, target_duration_seconds, status, started_at, created_at, updated_at) VALUES ('one', 1500, 'active', 1, 1, 1)",
            [],
        ).unwrap();
        assert!(connection.execute(
            "INSERT INTO focus_sessions (id, target_duration_seconds, status, started_at, created_at, updated_at) VALUES ('two', 1500, 'paused', 2, 2, 2)",
            [],
        ).is_err());
    }

    #[test]
    fn task_deletion_preserves_historical_work_as_unassigned() {
        let connection = migrated_connection();
        connection.execute("INSERT INTO tasks (id, title, status, created_at, updated_at) VALUES ('task', 'Task', 'todo', 1, 1)", []).unwrap();
        connection.execute("INSERT INTO work_segments (id, task_id, started_at, ended_at, source, created_at) VALUES ('segment', 'task', 1, 2, 'manual', 1)", []).unwrap();
        connection
            .execute("DELETE FROM tasks WHERE id = 'task'", [])
            .unwrap();
        let task_id: Option<String> = connection
            .query_row(
                "SELECT task_id FROM work_segments WHERE id = 'segment'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(task_id, None);
    }

    #[test]
    fn terminal_task_status_cancels_future_reminders() {
        let connection = migrated_connection();
        connection.execute("INSERT INTO tasks (id, title, status, created_at, updated_at) VALUES ('task', 'Task', 'todo', 1, 1)", []).unwrap();
        connection.execute("INSERT INTO task_reminders (id, task_id, scheduled_for, original_scheduled_for, status, created_at, updated_at) VALUES ('reminder', 'task', 100, 100, 'active', 1, 1)", []).unwrap();
        connection.execute("UPDATE tasks SET status = 'completed', completed_at = 10, updated_at = 10 WHERE id = 'task'", []).unwrap();
        let status: String = connection
            .query_row(
                "SELECT status FROM task_reminders WHERE id = 'reminder'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(status, "cancelled");
    }

    #[test]
    fn reminder_auto_dismiss_can_be_disabled() {
        let connection = migrated_connection();
        connection.execute("UPDATE app_settings SET value_json = 'false' WHERE key = 'reminders.dismissOnTerminalTask'", []).unwrap();
        connection.execute("INSERT INTO tasks (id, title, status, created_at, updated_at) VALUES ('task', 'Task', 'todo', 1, 1)", []).unwrap();
        connection.execute("INSERT INTO task_reminders (id, task_id, scheduled_for, original_scheduled_for, status, created_at, updated_at) VALUES ('reminder', 'task', 100, 100, 'active', 1, 1)", []).unwrap();
        connection.execute("UPDATE tasks SET status = 'completed', completed_at = 10, updated_at = 10 WHERE id = 'task'", []).unwrap();
        let status: String = connection
            .query_row(
                "SELECT status FROM task_reminders WHERE id = 'reminder'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(status, "active");
    }

    #[test]
    fn focused_time_is_derived_from_work_segments_only() {
        let connection = migrated_connection();
        connection.execute("INSERT INTO focus_sessions (id, target_duration_seconds, status, started_at, created_at, updated_at) VALUES ('session', 1500, 'completed', 1_000, 1_000, 20_000)", []).unwrap();
        connection
            .execute(
                "UPDATE focus_sessions SET ended_at = 20_000 WHERE id = 'session'",
                [],
            )
            .unwrap();
        connection.execute("INSERT INTO work_segments (id, focus_session_id, started_at, ended_at, source, created_at) VALUES ('one', 'session', 1_000, 6_000, 'timer', 1_000)", []).unwrap();
        connection.execute("INSERT INTO interruptions (id, focus_session_id, started_at, ended_at, source, created_at) VALUES ('interrupt', 'session', 6_000, 12_000, 'timer', 6_000)", []).unwrap();
        connection.execute("INSERT INTO work_segments (id, focus_session_id, started_at, ended_at, source, created_at) VALUES ('two', 'session', 12_000, 20_000, 'timer', 12_000)", []).unwrap();
        let result = focus_result(&connection, "session", 20_000).unwrap();
        assert_eq!(result.focused_milliseconds, 13_000);
    }

    #[test]
    fn backup_contains_a_consistent_database_snapshot_and_manifest() {
        let temporary = tempfile::tempdir().unwrap();
        let app_data_dir = temporary.path().join("Flowo");
        let data_dir = app_data_dir.join("data");
        let screenshots_dir = app_data_dir.join("screenshots");
        fs::create_dir_all(&data_dir).unwrap();
        fs::create_dir_all(&screenshots_dir).unwrap();
        let database_path = data_dir.join("flowo.sqlite");
        let mut connection = open_connection(&database_path).unwrap();
        run_migrations(&mut connection).unwrap();
        connection.execute("INSERT INTO tasks (id, title, status, created_at, updated_at) VALUES ('task', 'Backed up task', 'todo', 1, 1)", []).unwrap();
        let state = DatabaseState {
            connection: Mutex::new(None),
            app_data_dir,
            database_path,
            screenshots_dir,
        };
        let backup_path = temporary.path().join("test.flowo");
        export_backup_locked(&connection, &state, &backup_path).unwrap();

        let mut archive = ZipArchive::new(fs::File::open(backup_path).unwrap()).unwrap();
        let manifest: BackupManifest = {
            let mut entry = archive.by_name("manifest.json").unwrap();
            let mut contents = String::new();
            std::io::Read::read_to_string(&mut entry, &mut contents).unwrap();
            serde_json::from_str(&contents).unwrap()
        };
        assert_eq!(manifest.format, "flowo-backup");
        assert_eq!(manifest.format_version, 1);
        assert_eq!(
            manifest.database_schema_version,
            MIGRATIONS.last().unwrap().0
        );
        assert!(archive.by_name("flowo.sqlite").is_ok());
    }
}
