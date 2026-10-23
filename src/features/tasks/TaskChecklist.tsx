import { Check, ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";
import { type ClipboardEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { IconButton } from "../../cdk";
import { type ChecklistItem, checklistProgress, useChecklistStore } from "./checklistStore";

const EMPTY_ITEMS: ChecklistItem[] = [];

export type ChecklistHandlers = {
  onAdd: (body: string) => void | Promise<void>;
  onToggle: (itemId: string) => void | Promise<void>;
  onRename: (itemId: string, body: string) => void | Promise<void>;
  onRemove: (itemId: string) => void | Promise<void>;
  onMove: (itemId: string, direction: -1 | 1) => void | Promise<void>;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/** Turns pasted text (plain lines or a markdown list) into checklist entries. */
export function checklistLinesFromText(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*+•]|\d+[.)])?\s*(?:\[[ xX]\]\s*)?/, "").trim())
    .filter(Boolean);
}

export function ChecklistProgressBar({ done, total }: { done: number; total: number }) {
  const percent = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className={`checklist-progress${total > 0 && done === total ? " is-complete" : ""}`}>
      <div
        className="checklist-progress__track"
        role="progressbar"
        aria-label="Checklist progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      <small>{done} of {total} done</small>
    </div>
  );
}

export function ChecklistEditor({
  items,
  onAdd,
  onToggle,
  onRename,
  onRemove,
  onMove,
  emptyText,
  placeholder = "Add a step…",
  addOnBlur = false,
  className,
}: ChecklistHandlers & {
  items: ChecklistItem[];
  emptyText?: string;
  placeholder?: string;
  /** Add whatever is typed in the "Add a step" box when it loses focus, so it isn't lost on Save. */
  addOnBlur?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const addInput = useRef<HTMLInputElement>(null);

  const addLines = async (lines: string[], keepFocus = true) => {
    for (const line of lines) await onAdd(line);
    if (keepFocus) addInput.current?.focus();
  };

  const submitDraft = (keepFocus = true) => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void addLines([text], keepFocus);
  };

  const onAddKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      // Never submit a surrounding form (the create / edit task dialog).
      event.preventDefault();
      submitDraft();
    } else if (event.key === "Escape" && draft) {
      event.preventDefault();
      event.stopPropagation();
      setDraft("");
    }
  };

  const onAddPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text");
    if (!/\r?\n/.test(text.trim())) return;
    event.preventDefault();
    const lines = checklistLinesFromText(text);
    if (draft.trim()) lines.unshift(draft.trim());
    setDraft("");
    void addLines(lines);
  };

  // A ref (not just state) so a blur that follows Enter / Escape cannot save the edit a second time.
  const editingRef = useRef<string | null>(null);

  const startEditing = (item: ChecklistItem) => {
    editingRef.current = item.id;
    setEditingId(item.id);
    setEditText(item.body);
  };

  const finishEditing = (save: boolean) => {
    const id = editingRef.current;
    if (!id) return;
    editingRef.current = null;
    setEditingId(null);
    const item = items.find((entry) => entry.id === id);
    const text = editText.trim();
    if (save && item && text && text !== item.body) void onRename(item.id, text);
  };

  const onEditKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      finishEditing(true);
    } else if (event.key === "Escape") {
      // Cancel only the edit, not the dialog around it.
      event.preventDefault();
      event.stopPropagation();
      finishEditing(false);
    }
  };

  return (
    <div className={`checklist${className ? ` ${className}` : ""}`}>
      {items.length > 0 ? (
        <ul className="checklist__list">
          {items.map((item, index) => (
            <li key={item.id} className={`checklist__item${item.completed ? " is-done" : ""}${editingId === item.id ? " is-editing" : ""}`}>
              {editingId === item.id ? (
                <>
                  <span className="checklist__box" aria-hidden="true"><Check size={11} strokeWidth={3} /></span>
                  <input
                    className="checklist__edit"
                    autoFocus
                    value={editText}
                    aria-label="Edit checklist item"
                    onChange={(event) => setEditText(event.target.value)}
                    onKeyDown={onEditKeyDown}
                    onBlur={() => finishEditing(true)}
                  />
                </>
              ) : (
                <label className="checklist__label">
                  <input type="checkbox" checked={item.completed} onChange={() => void onToggle(item.id)} />
                  <span className="checklist__box" aria-hidden="true"><Check size={11} strokeWidth={3} /></span>
                  <span className="checklist__text">{item.body}</span>
                </label>
              )}
              <div className="checklist__actions">
                <IconButton type="button" label={`Move “${item.body}” up`} disabled={index === 0} onClick={() => void onMove(item.id, -1)}><ChevronUp size={14} /></IconButton>
                <IconButton type="button" label={`Move “${item.body}” down`} disabled={index === items.length - 1} onClick={() => void onMove(item.id, 1)}><ChevronDown size={14} /></IconButton>
                <IconButton type="button" label={`Edit “${item.body}”`} onClick={() => startEditing(item)}><Pencil size={13} /></IconButton>
                <IconButton type="button" className="checklist__delete" label={`Delete “${item.body}”`} onClick={() => void onRemove(item.id)}><Trash2 size={13} /></IconButton>
              </div>
            </li>
          ))}
        </ul>
      ) : emptyText ? <p className="checklist__empty">{emptyText}</p> : null}

      <div className="checklist__add">
        <Plus size={15} aria-hidden="true" />
        <input
          ref={addInput}
          value={draft}
          placeholder={placeholder}
          aria-label="New checklist item"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onAddKeyDown}
          onPaste={onAddPaste}
          onBlur={() => { if (addOnBlur) submitDraft(false); }}
        />
        <button type="button" disabled={!draft.trim()} onClick={() => submitDraft()}>Add</button>
      </div>
    </div>
  );
}

/** Loads a task's saved checklist and returns handlers that write straight to the database. */
export function useTaskChecklist(taskId: string | null | undefined) {
  const items = useChecklistStore((state) => (taskId ? state.itemsByTask[taskId] : undefined));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) return;
    setError(null);
    useChecklistStore.getState().loadTask(taskId).catch((loadError) => setError(errorMessage(loadError)));
  }, [taskId]);

  const run = (action: () => Promise<void>) => {
    setError(null);
    return action().catch((actionError) => setError(errorMessage(actionError)));
  };

  const store = useChecklistStore.getState();
  const handlers: ChecklistHandlers | null = taskId ? {
    onAdd: (body) => run(() => store.addItem(taskId, body)),
    onToggle: (itemId) => run(() => store.toggleItem(taskId, itemId)),
    onRename: (itemId, body) => run(() => store.renameItem(taskId, itemId, body)),
    onRemove: (itemId) => run(() => store.removeItem(taskId, itemId)),
    onMove: (itemId, direction) => run(() => store.moveItem(taskId, itemId, direction)),
  } : null;

  return { items: items ?? EMPTY_ITEMS, loaded: items !== undefined, error, handlers };
}

/** Checklist card shown in the task details popup (Tasks and Insights pages). */
export function TaskChecklistCard({ taskId }: { taskId: string }) {
  const { items, error, handlers } = useTaskChecklist(taskId);
  const { done, total } = checklistProgress(items);
  if (!handlers) return null;
  return (
    <section className="task-details-card task-details-checklist" aria-label="Checklist">
      <header>
        <h3>Checklist <small>{total ? `${done}/${total}` : 0}</small></h3>
        {total > 0 && <span className={`task-details-checklist__status${done === total ? " is-complete" : ""}`}>{done === total ? "All steps done" : `${total - done} left`}</span>}
      </header>
      {total > 0 && <ChecklistProgressBar done={done} total={total} />}
      <ChecklistEditor items={items} {...handlers} emptyText="Break this task into steps you can tick off as you go." />
      {error && <p className="checklist__error" role="alert">{error}</p>}
    </section>
  );
}
