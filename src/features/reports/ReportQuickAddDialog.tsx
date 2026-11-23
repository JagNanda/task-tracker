import { useState } from "react";
import { Button, Modal } from "../../cdk";
import { createId } from "../../data/database";
import { useTaskNotesStore } from "../tasks/notesStore";
import { taskLabel } from "../tasks/taskStore";
import type { FlowoTask } from "../tasks/TasksPage";

export function ReportQuickAddDialog({ date, tasks, onSaved, onClose }: {
  date: string;
  tasks: FlowoTask[];
  onSaved: (task: FlowoTask, body: string) => void;
  onClose: () => void;
}) {
  const addNote = useTaskNotesStore((state) => state.addNote);
  const [id] = useState(() => createId("note"));
  const [taskId, setTaskId] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const task = tasks.find((item) => item.id === taskId);
  const dateLabel = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date(`${date}T00:00:00`));

  const save = async () => {
    const note = body.trim();
    if (saving || !task || !note) return;
    setSaving(true);
    setError("");
    try {
      await addNote(task.id, { id, body: note, attachments: [], reportDate: date });
    } catch (error) {
      setError(`Couldn't save work notes. ${error instanceof Error ? error.message : String(error)}`);
      setSaving(false);
      return;
    }
    onSaved(task, note);
    onClose();
  };

  return (
    <Modal open title="Quick Add" onClose={onClose} dismissible={!saving}>
      <p className="modal-description">{dateLabel}</p>
      <form className="task-create-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <label>
          <span>Task</span>
          <select autoFocus required value={taskId} disabled={saving || !tasks.length} onChange={(event) => setTaskId(event.target.value)}>
            <option value="" disabled>{tasks.length ? "Choose a task" : "Create a task to add work notes"}</option>
            {tasks.map((task) => <option key={task.id} value={task.id}>{taskLabel(task)}</option>)}
          </select>
        </label>
        <label>
          <span>What did you complete?</span>
          <textarea required rows={5} value={body} disabled={saving || !tasks.length} onChange={(event) => setBody(event.target.value)} placeholder="Add a line for each piece of work." />
        </label>
        {error && <p className="modal-description" role="alert">{error}</p>}
        <div className="modal-actions">
          <Button type="button" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" tone="primary" disabled={saving || !task || !body.trim()}>{saving ? "Saving…" : "Add Work Notes"}</Button>
        </div>
      </form>
    </Modal>
  );
}
