import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { FieldDefinition, FieldValue, Identity } from '../../../shared/contracts';
import { AssigneePicker } from './pickers';

const SAVE_DELAY_MS = 1000;
const isNumeric = (def: FieldDefinition) => def.type === 'integer' || def.type === 'double';
const text = (value: FieldValue) => (value === null ? '' : String(value));

type InputProps = {
  id: string;
  def: FieldDefinition;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
  /** Choices for fields whose options come from elsewhere, such as area paths. */
  options?: string[];
  invalid?: boolean;
  people?: Identity[];
  me?: Identity;
};

/** A controlled input chosen from field metadata. Changes are reported immediately. */
export function FieldInput(props: InputProps) {
  const { id, def, value, onChange, options, invalid } = props;
  if (def.type === 'identity') {
    const people = props.people ?? [];
    const person =
      typeof value === 'string'
        ? (people.find((p) => p.id === value) ?? { id: value, displayName: '…' })
        : null;
    return (
      <AssigneePicker
        id={id}
        invalid={invalid}
        label={`${def.name}: ${person?.displayName ?? 'Unassigned'}`}
        menuLabel={`Choose ${def.name}`}
        required={def.required}
        assignee={person}
        members={people}
        me={props.me}
        onChange={onChange}
      />
    );
  }
  const choices = options ?? def.allowedValues.map(String);
  if (choices.length) {
    const current = text(value);
    return (
      <select
        id={id}
        className="select"
        aria-invalid={invalid}
        value={current}
        onChange={(e) =>
          onChange(
            e.target.value === '' ? null : isNumeric(def) ? Number(e.target.value) : e.target.value,
          )
        }
      >
        <option value="" disabled={def.required}>
          {def.required ? 'Choose…' : '—'}
        </option>
        {current && !choices.includes(current) && <option value={current}>{current}</option>}
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {choice}
          </option>
        ))}
      </select>
    );
  }
  if (def.type === 'boolean') {
    return (
      <input
        id={id}
        type="checkbox"
        checked={value === true}
        onChange={(e) => onChange(e.target.checked)}
      />
    );
  }
  return (
    <input
      id={id}
      className="input"
      aria-invalid={invalid}
      type={isNumeric(def) ? 'number' : 'text'}
      value={text(value)}
      onChange={(e) =>
        onChange(
          e.target.value === '' ? null : isNumeric(def) ? Number(e.target.value) : e.target.value,
        )
      }
    />
  );
}

type DraftProps = {
  id: string;
  value: FieldValue;
  rev: number;
  numeric?: boolean;
  className?: string;
  label?: string;
  invalid?: boolean;
  /** Called on blur, Enter, or a pause in typing, only when the value changed. */
  onCommit: (value: FieldValue, baseRev: number) => void;
};

/** Text or number input that keeps a local draft and saves on blur or after a pause. */
export function DraftInput({
  id,
  value,
  rev,
  numeric,
  className,
  label,
  invalid,
  onCommit,
}: DraftProps) {
  const [draft, setDraft] = useState(text(value));
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState({ value, rev });
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef({ value, onCommit });
  useLayoutEffect(() => {
    latest.current = { value, onCommit };
  });
  useEffect(() => () => clearTimeout(timer.current), []);

  // Take newer server or saved values, but never while the user is typing.
  if (!focused && (value !== shown.value || rev !== shown.rev)) {
    setShown({ value, rev });
    setDraft(text(value));
  }

  const commit = (input: string) => {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    const next = input === '' ? null : numeric ? Number(input) : input;
    if (next !== latest.current.value) latest.current.onCommit(next, shown.rev);
  };

  return (
    <input
      id={id}
      aria-label={label}
      aria-invalid={invalid}
      className={className ?? 'input'}
      type={numeric ? 'number' : 'text'}
      value={draft}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        const input = e.target.value;
        dirty.current = true;
        setDraft(input);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => commit(input), SAVE_DELAY_MS);
      }}
      onBlur={(e) => {
        setFocused(false);
        commit(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}

/** A label, its control, and an optional error under it. */
export function FormField(props: {
  label: string;
  htmlFor?: string;
  error?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={props.wide ? 'form-field wide' : 'form-field'}>
      <label htmlFor={props.htmlFor}>{props.label}</label>
      {props.children}
      {props.error && <small className="field-error">{props.error}</small>}
    </div>
  );
}
