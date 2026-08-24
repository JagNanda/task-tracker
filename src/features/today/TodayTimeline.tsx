import { useMemo, useState } from "react";
import { ChevronDown, Coffee, Info, SlidersHorizontal, Zap } from "lucide-react";
import { Badge, Button, Card, Popover, Select } from "../../cdk";
import { useTodayStore } from "./store";
import type { TimelineEntry } from "./types";
import { formatClock, formatDuration, localDateKey, useTimelineStore } from "../timeline/timelineStore";

type FilterValue = "All" | "Focus" | "Interruptions" | "Breaks";

export function TimelineToolbar({ filter, onFilter }: { filter: FilterValue; onFilter: (filter: FilterValue) => void }) {
  const [period, setPeriod] = useState("Day");
  return (
    <div className="timeline-toolbar">
      <Popover
        label="Filter timeline"
        trigger={<Button size="sm"><SlidersHorizontal size={14} /> Filter{filter !== "All" && <Badge>{filter}</Badge>}</Button>}
      >
        {(["All", "Focus", "Interruptions", "Breaks"] as FilterValue[]).map((item) => (
          <button key={item} role="menuitemradio" aria-checked={filter === item} className="cdk-menu-item" onClick={() => onFilter(item)}>
            <span className={`filter-dot filter-dot--${item.toLowerCase()}`} /> {item}
          </button>
        ))}
      </Popover>
      <Select label="Timeline range" value={period} options={["Day"]} onChange={setPeriod} />
    </div>
  );
}

export function TimelineRow({ entry }: { entry: TimelineEntry }) {
  return (
    <div className={`timeline-row timeline-row--${entry.type.toLowerCase()}`}>
      <time>{entry.time}</time>
      <span className="timeline-row__marker">
        {entry.type === "Interrupt" ? <Zap size={14} fill="currentColor" /> : entry.type === "Break" ? <Coffee size={14} /> : <i />}
      </span>
      <div className="timeline-row__details">
        <span>{entry.type}{entry.title && <> <b>•</b> {entry.title}</>}</span>
        <Badge>{entry.tag}</Badge>
      </div>
      <span className="timeline-row__duration">{entry.duration}</span>
    </div>
  );
}

export function TodayTimeline() {
  const fallbackEntries = useTodayStore((state) => state.timeline);
  const activityEntries = useTimelineStore((state) => state.entries);
  const entries = useMemo<TimelineEntry[]>(() => {
    const todayEntries = activityEntries.filter((entry) => entry.date === localDateKey() && !entry.cancelled);
    if (!todayEntries.length) return fallbackEntries;
    return todayEntries.sort((a, b) => a.startMinutes - b.startMinutes).map((entry) => ({
      id: entry.id,
      time: formatClock(entry.startMinutes),
      type: entry.type === "focus" ? "Focus" : entry.type === "interruption" ? "Interrupt" : "Break",
      title: entry.type === "focus" ? entry.taskName ?? "Unassigned" : entry.reason,
      tag: entry.context ?? (entry.type === "break" ? "Intentional" : "Interruption"),
      duration: formatDuration(entry.endMinutes - entry.startMinutes),
    }));
  }, [activityEntries, fallbackEntries]);
  const [filter, setFilter] = useState<FilterValue>("All");
  const [expanded, setExpanded] = useState(false);
  const filtered = useMemo(() => entries.filter((entry) => {
    if (filter === "All") return true;
    if (filter === "Interruptions") return entry.type === "Interrupt";
    if (filter === "Breaks") return entry.type === "Break";
    return entry.type === "Focus";
  }), [entries, filter]);

  return (
    <Card className="timeline-card">
      <header className="timeline-card__header">
        <h2>Today Timeline <Info size={15} aria-label="A chronological view of today's work" /></h2>
        <TimelineToolbar filter={filter} onFilter={setFilter} />
      </header>
      <div className="timeline-list">
        {filtered.map((entry) => <TimelineRow key={entry.id} entry={entry} />)}
      </div>
      <button className="show-more" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        {expanded ? "Show less" : "Show more"} <ChevronDown size={16} className={expanded ? "is-rotated" : ""} />
      </button>
      {expanded && <p className="timeline-empty">No earlier entries in this prototype.</p>}
    </Card>
  );
}
