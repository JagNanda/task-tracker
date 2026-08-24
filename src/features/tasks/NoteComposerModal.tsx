import {
  Bold,
  CheckSquare2,
  ChevronDown,
  Clipboard,
  Code2,
  Image as ImageIcon,
  ImagePlus,
  Italic,
  Link,
  List,
  ListOrdered,
  RemoveFormatting,
  Save,
  Target,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge, Button, IconButton } from "../../cdk";

export type NoteAttachment = {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
};

export type NoteComposerNote = {
  id: string;
  body: string;
  attachments: NoteAttachment[];
};

export type NoteComposerTask = {
  id: string;
  title: string;
  context: string;
  color: string;
};

type NoteComposerModalProps = {
  mode: "create" | "edit";
  initialTaskId: string;
  tasks: NoteComposerTask[];
  note?: NoteComposerNote;
  onClose: () => void;
  onSave: (value: { taskId: string; body: string; attachments: NoteAttachment[] }) => void;
};

const acceptedImageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const maxAttachmentBytes = 5 * 1024 * 1024;
const maxAttachments = 4;

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function stripMarkdown(value: string) {
  return value
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*(?:[-*+] |\d+\. |\[[ xX]\] )/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_~`>#]/g, "")
    .trim();
}

function deriveSummary(body: string) {
  const lines = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const keyPoints = lines
    .map((line) => line.match(/^(?:[-*+] |\d+\. )(?:\[[ xX]\]\s*)?(.+)/)?.[1])
    .filter((line): line is string => Boolean(line))
    .slice(0, 4)
    .map(stripMarkdown);
  const focusLine = lines.find((line) => !/^(?:[-*+] |\d+\. )/.test(line));
  const focus = stripMarkdown(focusLine ?? lines[0] ?? "No note content yet");
  return {
    focus: focus.length > 90 ? `${focus.slice(0, 87)}…` : focus,
    keyPoints: keyPoints.length ? keyPoints : ["Add bullet points to generate key points"],
  };
}

export function NoteComposerModal({ mode, initialTaskId, tasks, note, onClose, onSave }: NoteComposerModalProps) {
  const [taskId, setTaskId] = useState(initialTaskId);
  const [body, setBody] = useState(note?.body ?? "");
  const [attachments, setAttachments] = useState<NoteAttachment[]>(note?.attachments ?? []);
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedTask = tasks.find((task) => task.id === taskId) ?? tasks[0];
  const initialAttachmentIds = (note?.attachments ?? []).map((attachment) => attachment.id).join("|");
  const currentAttachmentIds = attachments.map((attachment) => attachment.id).join("|");
  const dirty = body !== (note?.body ?? "") || currentAttachmentIds !== initialAttachmentIds || taskId !== initialTaskId;
  const canSave = Boolean(selectedTask && body.trim());
  const summary = useMemo(() => deriveSummary(body), [body]);

  const saveNote = useCallback(() => {
    if (!selectedTask || !canSave) return;
    onSave({ taskId: selectedTask.id, body: body.trim(), attachments });
  }, [attachments, body, canSave, onSave, selectedTask]);

  const requestClose = useCallback(() => {
    if (dirty) setDiscardConfirm(true);
    else onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (discardConfirm) setDiscardConfirm(false);
        else requestClose();
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        saveNote();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [discardConfirm, requestClose, saveNote]);

  const replaceRange = (
    replacement: string,
    rangeStart: number,
    rangeEnd: number,
    selectionStart = rangeStart,
    selectionEnd = rangeStart + replacement.length,
  ) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const next = `${body.slice(0, rangeStart)}${replacement}${body.slice(rangeEnd)}`;
    setBody(next);
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(selectionStart, selectionEnd);
    });
  };

  const wrapSelection = (before: string, after: string, placeholder: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selection = body.slice(start, end) || placeholder;
    const replacement = `${before}${selection}${after}`;
    replaceRange(replacement, start, end, start + before.length, start + before.length + selection.length);
  };

  const formatLines = (kind: "bullet" | "ordered" | "checklist") => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const lineStart = body.lastIndexOf("\n", Math.max(0, textarea.selectionStart - 1)) + 1;
    const nextNewline = body.indexOf("\n", textarea.selectionEnd);
    const lineEnd = nextNewline === -1 ? body.length : nextNewline;
    const lines = body.slice(lineStart, lineEnd).split("\n");
    const formatted = lines.map((line, index) => `${kind === "ordered" ? `${index + 1}. ` : kind === "checklist" ? "- [ ] " : "- "}${line.replace(/^\s*(?:[-*+] |\d+\. |\[[ xX]\] )/, "")}`).join("\n");
    replaceRange(formatted, lineStart, lineEnd, lineStart, lineStart + formatted.length);
  };

  const applyBlockStyle = (style: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const lineStart = body.lastIndexOf("\n", Math.max(0, textarea.selectionStart - 1)) + 1;
    const nextNewline = body.indexOf("\n", textarea.selectionEnd);
    const lineEnd = nextNewline === -1 ? body.length : nextNewline;
    const content = body.slice(lineStart, lineEnd).replace(/^#{1,3}\s+/, "");
    const prefix = style === "h1" ? "# " : style === "h2" ? "## " : style === "h3" ? "### " : "";
    replaceRange(`${prefix}${content}`, lineStart, lineEnd, lineStart + prefix.length, lineStart + prefix.length + content.length);
  };

  const clearFormatting = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (start === end) {
      const cleaned = stripMarkdown(body);
      setBody(cleaned);
      window.requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(0, cleaned.length);
      });
      return;
    }
    const cleaned = stripMarkdown(body.slice(start, end));
    replaceRange(cleaned, start, end, start, start + cleaned.length);
  };

  const addFiles = async (files: File[]) => {
    setError("");
    const invalidType = files.find((file) => !acceptedImageTypes.has(file.type));
    if (invalidType) {
      setError("Only PNG, JPEG, and WebP screenshots are supported.");
      return;
    }
    const oversized = files.find((file) => file.size > maxAttachmentBytes);
    if (oversized) {
      setError(`${oversized.name} is larger than 5 MB.`);
      return;
    }
    const available = maxAttachments - attachments.length;
    if (available <= 0) {
      setError("A note can contain up to four screenshots.");
      return;
    }
    if (files.length > available) setError(`Only the first ${available} screenshot${available === 1 ? "" : "s"} were added.`);
    const accepted = files.slice(0, available);
    const nextAttachments = await Promise.all(accepted.map(async (file) => ({
      id: `attachment-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: file.name || `Pasted screenshot ${attachments.length + 1}`,
      mimeType: file.type,
      dataUrl: await readFileAsDataUrl(file),
    })));
    setAttachments((current) => [...current, ...nextAttachments]);
  };

  const pasteFromClipboard = async () => {
    setError("");
    try {
      if (!navigator.clipboard?.read) throw new Error("Clipboard images are unavailable");
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      for (const item of items) {
        const imageType = item.types.find((type) => acceptedImageTypes.has(type));
        if (!imageType) continue;
        const blob = await item.getType(imageType);
        files.push(new File([blob], `Pasted screenshot ${files.length + 1}.${imageType.split("/")[1]}`, { type: imageType }));
      }
      if (!files.length) throw new Error("No screenshot found");
      await addFiles(files);
    } catch {
      setError("Clipboard access was unavailable. Focus the editor and press Ctrl+V to paste a screenshot.");
      textareaRef.current?.focus();
    }
  };

  if (!selectedTask) return null;

  return createPortal(
    <div className="note-composer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && requestClose()}>
      <section className="note-composer" role="dialog" aria-modal="true" aria-labelledby="note-composer-title">
        <header className="note-composer__header">
          <div><h2 id="note-composer-title">{mode === "edit" ? "Edit Note" : "Add Note"}</h2><p>{mode === "edit" ? "Update this task note" : "Create a note for this task"}</p></div>
          <IconButton label="Close note composer" onClick={requestClose}><X size={19} /></IconButton>
        </header>

        <div className="note-composer__layout">
          <div className="note-composer__editor-column">
            <div className="note-composer__task-field">
              <span className="note-composer__label">TASK</span>
              <div className="note-composer__task-row">
                <i style={{ background: selectedTask.color }} />
                <strong>{selectedTask.title}</strong>
                {selectedTask.context.split(" / ").map((tag) => <Badge key={tag}>{tag}</Badge>)}
                {mode === "create" && <Button size="sm" onClick={() => setTaskPickerOpen((open) => !open)}>Change</Button>}
              </div>
              {taskPickerOpen && mode === "create" && (
                <div className="note-composer__task-picker">
                  {tasks.map((task) => <button key={task.id} type="button" className={task.id === taskId ? "is-selected" : ""} onClick={() => { setTaskId(task.id); setTaskPickerOpen(false); }}><i style={{ background: task.color }} /><span>{task.title}<small>{task.context}</small></span></button>)}
                </div>
              )}
            </div>

            <div className="note-composer__content-field">
              <label className="note-composer__label" htmlFor="note-composer-content">NOTE CONTENT</label>
              <textarea
                id="note-composer-content"
                ref={textareaRef}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                onPaste={(event) => {
                  const files = Array.from(event.clipboardData.items).filter((item) => item.kind === "file" && item.type.startsWith("image/")).map((item) => item.getAsFile()).filter((file): file is File => Boolean(file));
                  if (files.length) { event.preventDefault(); void addFiles(files); }
                }}
                placeholder="Capture context, requirements, decisions, or your next step…"
                autoFocus
              />
              <div className="note-composer__toolbar" aria-label="Note formatting toolbar">
                <label><span className="sr-only">Text style</span><select defaultValue="normal" onChange={(event) => { applyBlockStyle(event.target.value); event.target.value = "normal"; }}><option value="normal">Normal</option><option value="h1">Heading 1</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option></select><ChevronDown size={13} /></label>
                <button type="button" aria-label="Bold" title="Bold" onClick={() => wrapSelection("**", "**", "bold text")}><Bold size={16} /></button>
                <button type="button" aria-label="Italic" title="Italic" onClick={() => wrapSelection("_", "_", "italic text")}><Italic size={16} /></button>
                <button type="button" aria-label="Inline code" title="Inline code" onClick={() => wrapSelection("`", "`", "code")}><Code2 size={16} /></button>
                <span className="note-composer__toolbar-divider" />
                <button type="button" aria-label="Bulleted list" title="Bulleted list" onClick={() => formatLines("bullet")}><List size={16} /></button>
                <button type="button" aria-label="Numbered list" title="Numbered list" onClick={() => formatLines("ordered")}><ListOrdered size={16} /></button>
                <button type="button" aria-label="Checklist" title="Checklist" onClick={() => formatLines("checklist")}><CheckSquare2 size={16} /></button>
                <button type="button" aria-label="Link" title="Link" onClick={() => wrapSelection("[", "](https://)", "link text")}><Link size={16} /></button>
                <button type="button" aria-label="Clear formatting" title="Clear formatting" onClick={clearFormatting}><RemoveFormatting size={16} /></button>
              </div>
            </div>

            <div className="note-composer__attachments">
              <span className="note-composer__label">ADD SCREENSHOT</span>
              <div className="note-composer__attachment-actions">
                <Button size="sm" onClick={() => void pasteFromClipboard()}><Clipboard size={15} /> Paste Screenshot</Button>
                <Button size="sm" onClick={() => fileInputRef.current?.click()}><Upload size={15} /> Upload Screenshot</Button>
                <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(event) => { void addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
              </div>
              <div className="note-composer__attachment-grid">
                {attachments.map((attachment) => <figure key={attachment.id}><img src={attachment.dataUrl} alt={attachment.name} /><IconButton label={`Remove ${attachment.name}`} onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}><X size={13} /></IconButton><figcaption>{attachment.name}</figcaption></figure>)}
                {attachments.length < maxAttachments && <button className="note-composer__add-tile" type="button" aria-label="Upload another screenshot" onClick={() => fileInputRef.current?.click()}><ImagePlus size={23} /></button>}
              </div>
              {error && <p className="note-composer__error" role="alert">{error}</p>}
              <small>You can paste with Ctrl + V while the editor is focused. Maximum four images, 5 MB each.</small>
            </div>
          </div>

          <aside className="note-composer__preview-column">
            <span className="note-composer__label">PREVIEW</span>
            <div className="note-composer__preview-card">
              <header><i style={{ background: selectedTask.color }} /><div><strong>{selectedTask.title}</strong><span>{selectedTask.context.split(" / ").map((tag) => <Badge key={tag}>{tag}</Badge>)}</span></div></header>
              <div className="note-composer__markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{body || "_Your formatted note preview will appear here._"}</ReactMarkdown></div>
              {attachments.length > 0 && <div className="note-composer__preview-attachments"><strong>Attached Screenshots ({attachments.length})</strong><div>{attachments.map((attachment) => <img key={attachment.id} src={attachment.dataUrl} alt={attachment.name} />)}</div></div>}
            </div>

            <div className="note-composer__summary">
              <span className="note-composer__label">NOTE SUMMARY</span>
              <div><i><Target size={16} /></i><p><strong>Focus</strong><span>{summary.focus}</span></p></div>
              <div><i><List size={16} /></i><p><strong>Key Points</strong><span>{summary.keyPoints.join(", ")}</span></p></div>
              <div><i><ImageIcon size={16} /></i><p><strong>Screenshots</strong><span>{attachments.length} screenshot{attachments.length === 1 ? "" : "s"} attached</span></p></div>
            </div>
          </aside>
        </div>

        <footer className="note-composer__footer">
          {discardConfirm && <div className="note-composer__discard"><span>Discard unsaved changes?</span><Button size="sm" onClick={() => setDiscardConfirm(false)}>Keep Editing</Button><Button size="sm" className="is-danger" onClick={onClose}>Discard</Button></div>}
          <Button onClick={requestClose}>Cancel</Button>
          <Button tone="primary" disabled={!canSave} onClick={saveNote}><Save size={15} /> {mode === "edit" ? "Save Changes" : "Save Note"} <kbd>Ctrl + Enter</kbd></Button>
        </footer>
      </section>
    </div>,
    document.getElementById("modal-root")!,
  );
}
