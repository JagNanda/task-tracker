import { Image as ImageIcon, Pencil, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge, Button, IconButton } from "../../cdk";
import type { NoteAttachment, NoteComposerTask } from "./NoteComposerModal";

export type NotesViewerNote = {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  attachments: NoteAttachment[];
};

type NotesViewerModalProps = {
  task: NoteComposerTask;
  notes: NotesViewerNote[];
  onClose: () => void;
  onAddNote: () => void;
  onEditNote: (noteId: string) => void;
};

export function NotesViewerModal({ task, notes, onClose, onAddNote, onEditNote }: NotesViewerModalProps) {
  const [activeImage, setActiveImage] = useState<NoteAttachment | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (activeImage) setActiveImage(null);
      else onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeImage, onClose]);

  return createPortal(
    <div className="notes-viewer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="notes-viewer" role="dialog" aria-modal="true" aria-labelledby="notes-viewer-title">
        <header className="notes-viewer__header">
          <div>
            <span className="notes-viewer__eyebrow">TASK NOTES</span>
            <div className="notes-viewer__title-row"><i style={{ background: task.color }} /><h2 id="notes-viewer-title">{task.title}</h2><Badge>{notes.length} notes</Badge></div>
            <div className="notes-viewer__tags">{task.context.split(" / ").map((tag) => <Badge key={tag}>{tag}</Badge>)}</div>
          </div>
          <div className="notes-viewer__header-actions"><Button tone="primary" onClick={onAddNote}><Plus size={15} /> Add Note</Button><IconButton label="Close notes" onClick={onClose}><X size={19} /></IconButton></div>
        </header>

        <div className="notes-viewer__list">
          {notes.map((note, index) => (
            <article className="notes-viewer__note" key={note.id}>
              <header>
                <div><strong>Note {notes.length - index}</strong><span>{note.updatedAt === note.createdAt ? `Created ${note.createdAt}` : `Updated ${note.updatedAt}`}</span></div>
                <Button size="sm" onClick={() => onEditNote(note.id)}><Pencil size={13} /> Edit</Button>
              </header>
              <div className="notes-viewer__markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{note.body || "_No text content._"}</ReactMarkdown></div>
              {note.attachments.length > 0 && (
                <div className="notes-viewer__attachments">
                  <div className="notes-viewer__attachments-label"><ImageIcon size={14} /><span>{note.attachments.length} screenshot{note.attachments.length === 1 ? "" : "s"}</span><small>Click an image to view it at full resolution</small></div>
                  <div className="notes-viewer__image-grid">
                    {note.attachments.map((attachment) => (
                      <button key={attachment.id} type="button" onClick={() => setActiveImage(attachment)} aria-label={`Open ${attachment.name} at full resolution`}>
                        <img src={attachment.dataUrl} alt={attachment.name} />
                        <span>{attachment.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </article>
          ))}
          {!notes.length && (
            <div className="notes-viewer__empty"><ImageIcon size={30} /><h3>No notes yet</h3><p>Add context, decisions, or screenshots for this task.</p><Button tone="primary" onClick={onAddNote}><Plus size={15} /> Add First Note</Button></div>
          )}
        </div>
      </section>

      {activeImage && (
        <div className="note-image-lightbox" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setActiveImage(null)}>
          <div className="note-image-lightbox__content" role="dialog" aria-modal="true" aria-label={activeImage.name}>
            <header><div><ImageIcon size={16} /><strong>{activeImage.name}</strong></div><IconButton label="Close image" onClick={() => setActiveImage(null)}><X size={20} /></IconButton></header>
            <div><img src={activeImage.dataUrl} alt={activeImage.name} /></div>
          </div>
        </div>
      )}
    </div>,
    document.getElementById("modal-root")!,
  );
}
