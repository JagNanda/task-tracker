import { ChevronDown, ListChecks } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Card } from "../../cdk";
import { checklistProgress } from "../tasks/checklistStore";
import { ChecklistEditor, ChecklistProgressBar, useTaskChecklist } from "../tasks/TaskChecklist";
import { useTodayStore } from "./store";

/** Checklist for the task currently in focus on Today, so steps can be ticked off mid-session. */
export function CurrentTaskChecklist() {
  const currentTask = useTodayStore((state) => state.currentTask);
  const { items, error, handlers } = useTaskChecklist(currentTask?.id);
  // null = follow the default (open when the task has steps, closed when it has none).
  const [expandedChoice, setExpandedChoice] = useState<boolean | null>(null);

  useEffect(() => {
    setExpandedChoice(null);
  }, [currentTask?.id]);

  if (!currentTask || !handlers) return null;

  const { done, total } = checklistProgress(items);
  const expanded = expandedChoice ?? total > 0;
  const summary = !total ? "Add steps for this task" : done === total ? "All steps done" : `${total - done} of ${total} steps left`;

  return (
    <Card className="current-task-checklist">
      <button
        className="current-task-notes__toggle"
        type="button"
        aria-expanded={expanded}
        aria-controls="current-task-checklist-content"
        onClick={() => setExpandedChoice(!expanded)}
      >
        <span className="current-task-notes__heading">
          <span className="current-task-notes__icon current-task-checklist__icon"><ListChecks size={16} /></span>
          <span><strong>Checklist</strong><small>{summary}</small></span>
        </span>
        <span className="current-task-notes__meta">
          <Badge className={total > 0 && done === total ? "is-complete" : undefined}>{done}/{total}</Badge>
          <ChevronDown size={17} className={expanded ? "is-rotated" : ""} />
        </span>
      </button>

      {expanded && (
        <div className="current-task-checklist__content" id="current-task-checklist-content">
          {total > 0 && <ChecklistProgressBar done={done} total={total} />}
          <ChecklistEditor items={items} {...handlers} />
          {error && <p className="checklist__error" role="alert">{error}</p>}
        </div>
      )}
    </Card>
  );
}
