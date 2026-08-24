DROP TRIGGER IF EXISTS cancel_future_reminders_after_task_terminal;

CREATE TRIGGER cancel_future_reminders_after_task_terminal
AFTER UPDATE OF status ON tasks
WHEN NEW.status IN ('completed', 'cancelled', 'archived')
 AND COALESCE(
      (SELECT value_json = 'true'
         FROM app_settings
        WHERE key = 'reminders.dismissOnTerminalTask'),
      1
    )
BEGIN
    UPDATE task_reminders
       SET status = 'cancelled', updated_at = NEW.updated_at
     WHERE task_id = NEW.id AND status = 'active';
END;
