INSERT INTO app_settings (key, value_json, updated_at) VALUES
    ('notifications.breakSound', 'true', 0),
    ('notifications.focusSoundStyle', '"chime"', 0),
    ('notifications.breakSoundStyle', '"gentle"', 0)
ON CONFLICT(key) DO NOTHING;
