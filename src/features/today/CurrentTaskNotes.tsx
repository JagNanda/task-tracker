import { ChevronDown, Image as ImageIcon, MessageSquareText, Pencil, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge, Button, Card, IconButton, Modal } from "../../cdk";
import { NoteComposerModal, type NoteAttachment } from "../tasks/NoteComposerModal";
import { useTaskNotesStore } from "../tasks/notesStore";
import { useTodayStore } from "./store";

export function CurrentTaskNotes() {
  const currentTask = useTodayStore((state) => state.currentTask);
  const notesByTask = useTaskNotesStore((state) => state.notesByTask);
  const updateNote = useTaskNotesStore((state) => state.updateNote);
  const removeNote = useTaskNotesStore((state) => state.removeNote);
  const [expanded, setExpanded] = useState(true);
  const [expandedNoteIds, setExpandedNoteIds] = useState<Set<string>>(new Set());
  const [activeImage, setActiveImage] = useState<NoteAttachment | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [deleteNoteId, setDeleteNoteId] = useState<string | null>(null);
  const notes = currentTask ? notesByTask[currentTask.id] ?? [] : [];

  useEffect(() => {
    setExpanded(true);
    setExpandedNoteIds(notes[0] ? new Set([notes[0].id]) : new Set());
    setActiveImage(null);
    setEditingNoteId(null);
    setDeleteNoteId(null);
    // Notes are reset when the selected task changes; later note edits preserve disclosure state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTask?.id]);

  useEffect(() => {
    if (!activeImage) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveImage(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeImage]);

  if (!currentTask) return null;

  const modalRoot = document.getElementById("modal-root");
  const editingNote = editingNoteId ? notes.find((note) => note.id === editingNoteId) : undefined;
  const deleteNote = deleteNoteId ? notes.find((note) => note.id === deleteNoteId) : undefined;

  const toggleNote = (noteId: string) => {
    setExpandedNoteIds((current) => {
      const next = new Set(current);
      if (next.has(noteId)) next.delete(noteId);
      else next.add(noteId);
      return next;
    });
  };

  const saveEditedNote = ({ body, attachments }: { taskId: string; body: string; attachments: NoteAttachment[] }) => {
    if (!editingNoteId) return;
    updateNote(currentTask.id, editingNoteId, { body, attachments, updatedAt: "Just now" });
    setExpandedNoteIds((current) => new Set(current).add(editingNoteId));
    setEditingNoteId(null);
  };

  const confirmDelete = () => {
    if (!deleteNoteId) return;
    removeNote(currentTask.id, deleteNoteId);
    setExpandedNoteIds((current) => {
      const next = new Set(current);
      next.delete(deleteNoteId);
      return next;
    });
    setDeleteNoteId(null);
  };

  return (
    <>
      <Card className="current-task-notes">
        <button
          className="current-task-notes__toggle"
          type="button"
          aria-expanded={expanded}
          aria-controls="current-task-notes-content"
          onClick={() => setExpanded((value) => !value)}
        >
          <span className="current-task-notes__heading">
            <span className="current-task-notes__icon"><MessageSquareText size={16} /></span>
            <span><strong>Notes</strong><small>{currentTask.title}</small></span>
          </span>
          <span className="current-task-notes__meta">
            <Badge>{notes.length}</Badge>
            <ChevronDown size={17} className={expanded ? "is-rotated" : ""} />
          </span>
        </button>

        {expanded && (
          <div className="current-task-notes__content" id="current-task-notes-content">
            {notes.map((note, index) => {
              const noteExpanded = expandedNoteIds.has(note.id);
              const contentId = `current-task-note-content-${note.id}`;
              return (
                <article className={`current-task-note${noteExpanded ? " is-expanded" : ""}`} key={note.id}>
                  <div className="current-task-note__header">
                    <button
                      className="current-task-note__toggle"
                      type="button"
                      aria-expanded={noteExpanded}
                      aria-controls={contentId}
                      onClick={() => toggleNote(note.id)}
                    >
                      <span><ChevronDown size={15} className={noteExpanded ? "is-rotated" : ""} /><strong>Note {notes.length - index}</strong></span>
                      <span>{note.attachments.length > 0 && <small><ImageIcon size={12} /> {note.attachments.length}</small>}<time>{note.updatedAt}</time></span>
                    </button>
                    <div className="current-task-note__actions">
                      <IconButton label={`Edit note ${notes.length - index}`} onClick={() => setEditingNoteId(note.id)}><Pencil size={13} /></IconButton>
                      <IconButton label={`Delete note ${notes.length - index}`} onClick={() => setDeleteNoteId(note.id)}><Trash2 size={13} /></IconButton>
                    </div>
                  </div>
                  {noteExpanded && (
                    <div id={contentId}>
                      <div className="current-task-note__markdown">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{note.body || "_No text content._"}</ReactMarkdown>
                      </div>
                      {note.attachments.length > 0 && (
                        <div className="current-task-note__attachments">
                          <div className="current-task-note__attachments-label"><ImageIcon size={13} /> Screenshots</div>
                          <div className="current-task-note__image-grid">
                            {note.attachments.map((attachment) => (
                              <button
                                type="button"
                                key={attachment.id}
                                onClick={() => setActiveImage(attachment)}
                                aria-label={`Open ${attachment.name} at full resolution`}
                              >
                                <img src={attachment.dataUrl} alt={attachment.name} />
                                <span>{attachment.name}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
            {!notes.length && (
              <div className="current-task-notes__empty">
                <MessageSquareText size={22} />
                <span>No notes for this task yet.</span>
              </div>
            )}
          </div>
        )}
      </Card>

      {editingNote && (
        <NoteComposerModal
          key={`today-edit-${currentTask.id}-${editingNote.id}`}
          mode="edit"
          initialTaskId={currentTask.id}
          tasks={[{
            id: currentTask.id,
            title: currentTask.title,
            context: `${currentTask.category} / ${currentTask.tag}`,
            color: currentTask.color,
          }]}
          note={editingNote}
          onClose={() => setEditingNoteId(null)}
          onSave={saveEditedNote}
        />
      )}

      <Modal open={Boolean(deleteNote)} title="Delete note?" onClose={() => setDeleteNoteId(null)}>
        <p className="modal-description">This permanently removes the note and its screenshot attachments from this session.</p>
        <div className="modal-actions">
          <Button onClick={() => setDeleteNoteId(null)}>Keep Note</Button>
          <Button tone="orange" onClick={confirmDelete}><Trash2 size={14} /> Delete Note</Button>
        </div>
      </Modal>

      {activeImage && modalRoot && createPortal(
        <div className="note-image-lightbox" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setActiveImage(null)}>
          <div className="note-image-lightbox__content" role="dialog" aria-modal="true" aria-label={activeImage.name}>
            <header>
              <div><ImageIcon size={16} /><strong>{activeImage.name}</strong></div>
              <IconButton label="Close image" onClick={() => setActiveImage(null)}><X size={20} /></IconButton>
            </header>
            <div><img src={activeImage.dataUrl} alt={activeImage.name} /></div>
          </div>
        </div>,
        modalRoot,
      )}
    </>
  );
}
