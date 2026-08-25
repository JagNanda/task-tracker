import {
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, X } from "lucide-react";

const cx = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(" ");

export type ButtonTone = "primary" | "orange" | "outline" | "subtle" | "ghost";

export function Button({
  tone = "outline",
  size = "md",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone; size?: "sm" | "md" | "lg" }) {
  return (
    <button className={cx("cdk-button", `cdk-button--${tone}`, `cdk-button--${size}`, className)} {...props}>
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button aria-label={label} title={label} className={cx("cdk-icon-button", className)} {...props}>
      {children}
    </button>
  );
}

export function Card({ className, children, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section className={cx("cdk-card", className)} {...props}>
      {children}
    </section>
  );
}

export function Badge({ className, children, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cx("cdk-badge", className)} {...props}>
      {children}
    </span>
  );
}

export function Pill({
  selected,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button className={cx("cdk-pill", selected && "is-selected", className)} aria-pressed={selected} {...props}>
      {children}
    </button>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx("cdk-input", className)} {...props} />;
}

export function Toggle({
  checked,
  onChange,
  label,
  className,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={cx("cdk-toggle", checked && "is-checked", className)}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

export function Divider({ className, ...props }: HTMLAttributes<HTMLHRElement>) {
  return <hr className={cx("cdk-divider", className)} {...props} />;
}

export function Select({
  label,
  value,
  options,
  onChange,
  className,
  disabled,
}: {
  label: string;
  value: string | number;
  options: Array<string | { value: string | number; label: string }>;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <label className={cx("cdk-select", className)}>
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
        {options.map((option) => {
          const item = typeof option === "string" ? { value: option, label: option } : option;
          return <option key={String(item.value)} value={item.value}>{item.label}</option>;
        })}
      </select>
      <ChevronDown aria-hidden="true" size={15} />
    </label>
  );
}

export function Avatar({ name, src, size = 34 }: { name: string; src?: string; size?: number }) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
  return (
    <span className="cdk-avatar" style={{ width: size, height: size }} aria-label={name}>
      {src ? <img src={src} alt="" /> : initials}
    </span>
  );
}

export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <span className="cdk-tooltip" data-tooltip={text}>
      {children}
    </span>
  );
}

export function Popover({
  label,
  trigger,
  children,
  align = "end",
}: {
  label: string;
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="cdk-popover" ref={ref}>
      <span onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={label}>
        {trigger}
      </span>
      {open && (
        <div
          className={cx("cdk-popover__panel", `cdk-popover__panel--${align}`)}
          role="menu"
          onClick={(event) => {
            if ((event.target as Element).closest("button")) setOpen(false);
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function Dropdown({
  label,
  items,
}: {
  label: ReactNode;
  items: Array<{ label: string; onSelect: () => void }>;
}) {
  return (
    <Popover label="Open menu" trigger={label}>
      {items.map((item) => (
        <button key={item.label} className="cdk-menu-item" role="menuitem" onClick={item.onSelect}>
          {item.label}
        </button>
      ))}
    </Popover>
  );
}

export function ProgressRing({
  value,
  size = 350,
  strokeWidth = 8,
  muted = false,
  interruption = false,
  children,
  label,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  muted?: boolean;
  interruption?: boolean;
  children: ReactNode;
  label: string;
}) {
  const gradientId = useId().replace(/:/g, "");
  const radius = (size - strokeWidth) / 2;
  const circumference = Math.PI * 2 * radius;
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <div className={cx("cdk-progress-ring", muted && "is-muted", interruption && "is-interruption")} style={{ "--ring-size": `${size}px` } as React.CSSProperties} role="img" aria-label={label}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={interruption ? "#ff9a34" : "#2388ff"} />
            <stop offset="100%" stopColor={interruption ? "#ff6700" : "#20c7f5"} />
          </linearGradient>
        </defs>
        <circle className="cdk-progress-ring__track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={strokeWidth} />
        <circle
          className="cdk-progress-ring__value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          stroke={`url(#${gradientId})`}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
        />
      </svg>
      <div className="cdk-progress-ring__content">{children}</div>
    </div>
  );
}

export function Modal({
  open,
  title,
  children,
  onClose,
  className,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="cdk-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={cx("cdk-modal", className)} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header>
          <h2 id="modal-title">{title}</h2>
          <IconButton label="Close dialog" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>
        {children}
      </div>
    </div>,
    document.getElementById("modal-root")!,
  );
}
