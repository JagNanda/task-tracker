import {
  BarChart3,
  CalendarDays,
  History,
  Lightbulb,
  ListChecks,
  Settings,
  Shield,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const navItems: Array<{ label: string; icon: LucideIcon }> = [
  { label: "Today", icon: CalendarDays },
  { label: "Tasks", icon: ListChecks },
  { label: "Timeline", icon: History },
  { label: "Reports", icon: BarChart3 },
  { label: "Insights", icon: Lightbulb },
  { label: "Settings", icon: Settings },
];

export function Logo() {
  return (
    <div className="app-logo" aria-label="flowo">
      <span className="app-logo__mark"><Shield size={22} strokeWidth={2.8} /></span>
      <span>flowo</span>
    </div>
  );
}

export function NavItem({
  label,
  icon: Icon,
  selected = false,
  onSelect,
}: {
  label: string;
  icon: LucideIcon;
  selected?: boolean;
  onSelect?: (label: string) => void;
}) {
  return (
    <button
      className={`nav-item ${selected ? "is-selected" : ""}`}
      aria-current={selected ? "page" : undefined}
      onClick={() => onSelect?.(label)}
    >
      <Icon size={20} strokeWidth={1.7} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

export function AppSidebar({
  selected = "Today",
  onNavigate,
}: {
  selected?: string;
  onNavigate?: (label: string) => void;
}) {
  return (
    <aside className="app-sidebar">
      <Logo />
      <nav aria-label="Primary navigation">
        {navItems.map((item) => (
          <NavItem
            key={item.label}
            {...item}
            selected={item.label === selected}
            onSelect={onNavigate}
          />
        ))}
      </nav>
    </aside>
  );
}

export function MobileNavigation({ selected = "Today", onNavigate }: { selected?: string; onNavigate?: (label: string) => void }) {
  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      {navItems.map(({ label, icon: Icon }) => (
        <button key={label} className={selected === label ? "is-selected" : ""} aria-label={label} onClick={() => onNavigate?.(label)}>
          <Icon size={19} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
