import { Check, ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Button, IconButton, Input, Select, Toggle } from "../../cdk";

export function SettingsSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="settings-section" aria-labelledby={`settings-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
      <header className="settings-section__header">
        <h2 id={`settings-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>{title}</h2>
        {description && <p>{description}</p>}
      </header>
      {children}
    </section>
  );
}

export function SettingRow({
  title,
  description,
  children,
  disabled = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className={`setting-row ${disabled ? "is-disabled" : ""}`}>
      <div><strong>{title}</strong>{description && <small>{description}</small>}</div>
      <div className="setting-row__control">{children}</div>
    </div>
  );
}

export function ToggleRow({
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  title: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <SettingRow title={title} description={description} disabled={disabled}>
      <Toggle label={title} checked={checked} onChange={onChange} disabled={disabled} />
    </SettingRow>
  );
}

export function NativeSelect({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string | number;
  options: Array<{ value: string | number; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return <Select className="settings-select" label={label} value={value} options={options} onChange={onChange} disabled={disabled} />;
}

export function ColorValueInput({ value, label, onCommit }: { value: string; label: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => setDraft(value), [value]);
  const commit = (next = draft) => {
    const normalized = next.trim().toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(normalized)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setDraft(normalized);
    onCommit(normalized);
  };
  return (
    <div className={`color-value-input ${invalid ? "is-invalid" : ""}`}>
      <input type="color" aria-label={`${label} color picker`} value={/^#[0-9A-F]{6}$/i.test(draft) ? draft : value} onChange={(event) => { setDraft(event.target.value.toUpperCase()); commit(event.target.value); }} />
      <Input aria-label={`${label} hex value`} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => commit()} onKeyDown={(event) => event.key === "Enter" && commit()} />
      {invalid && <small>Use a six-digit hex color.</small>}
    </div>
  );
}

export function NumberPresetEditor({
  values,
  onChange,
  suffix = "m",
  min = 1,
  max = 480,
}: {
  values: number[];
  onChange: (values: number[]) => void;
  suffix?: string;
  min?: number;
  max?: number;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const add = () => {
    const value = Number(draft);
    if (!Number.isInteger(value) || value < min || value > max || values.includes(value)) return;
    onChange([...values, value]);
    setDraft("");
    setAdding(false);
  };
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= values.length) return;
    const next = [...values];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  return (
    <div className="number-presets">
      {values.map((value, index) => (
        <span className="number-preset" key={value}>
          <b>{value}{suffix}</b>
          <IconButton label={`Move ${value}${suffix} earlier`} disabled={index === 0} onClick={() => move(index, -1)}><ChevronUp size={11} /></IconButton>
          <IconButton label={`Move ${value}${suffix} later`} disabled={index === values.length - 1} onClick={() => move(index, 1)}><ChevronDown size={11} /></IconButton>
          <IconButton label={`Remove ${value}${suffix}`} onClick={() => onChange(values.filter((item) => item !== value))}><X size={11} /></IconButton>
        </span>
      ))}
      {adding ? (
        <span className="number-preset number-preset--adding">
          <Input type="number" min={min} max={max} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") add(); if (event.key === "Escape") setAdding(false); }} autoFocus />
          <IconButton label="Add duration" onClick={add}><Check size={12} /></IconButton>
        </span>
      ) : <Button size="sm" className="number-presets__add" onClick={() => setAdding(true)}><Plus size={13} /> Add</Button>}
    </div>
  );
}
