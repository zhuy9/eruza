import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import type { FieldDefinition, FieldValue, Identity } from '../../../shared/contracts';
import { AssigneePicker } from './pickers';
import { Input } from '../../components/ui/input';
import { NativeSelect } from '../../components/ui/native-select';

const SAVE_DELAY_MS = 1000;
const isNumeric = (def: FieldDefinition) => def.type === 'integer' || def.type === 'double';
const text = (value: FieldValue) => (value === null ? '' : String(value));
const parse = (def: FieldDefinition, input: string): FieldValue =>
  input === '' ? null : isNumeric(def) ? Number(input) : input;

type OptionsQuery = { isLoading: boolean; isError: boolean };
/** Why a list of choices is empty, shown under its disabled select. */
const emptyNote = (query?: OptionsQuery) =>
  query?.isLoading
    ? 'Loading choices…'
    : query?.isError
      ? 'Could not load the choices. Reload the page to try again.'
      : 'No choices available.';

type InputProps = {
  id: string;
  def: FieldDefinition;
  value: FieldValue;
  /** `baseRev` is set only for selects that save, from the `rev` prop. */
  onChange: (value: FieldValue, baseRev?: number) => void;
  /** Choices for fields whose options come from elsewhere, such as area paths. */
  options?: string[];
  /** The query that loads `options`, so an empty list can say why it is empty. */
  optionsQuery?: OptionsQuery;
  /** Set when each change saves, so keyboard steps through a closed select stay a draft. */
  rev?: number;
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
  // A list from the caller is final, even when empty (loading, failed, or no sprints).
  // A text box would save each keystroke, and a prefix such as the root path moves the item.
  const choices = options ?? def.allowedValues.map(String);
  if (options || choices.length) {
    const current = text(value);
    const empty = !choices.length;
    const select = {
      id,
      className: 'w-full',
      'aria-invalid': invalid,
      disabled: empty,
      'aria-describedby': empty ? `${id}-note` : undefined,
      children: (
        <>
          <option value="" disabled={def.required}>
            {def.required ? 'Choose…' : '—'}
          </option>
          {current && !choices.includes(current) && <option value={current}>{current}</option>}
          {choices.map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </>
      ),
    };
    return (
      <>
        {props.rev === undefined ? (
          <NativeSelect
            {...select}
            value={current}
            onChange={(e) => onChange(parse(def, e.target.value))}
          />
        ) : (
          <StepSelect
            {...select}
            value={current}
            rev={props.rev}
            onCommit={(next, rev) => onChange(parse(def, next), rev)}
          />
        )}
        {empty && (
          <small id={`${id}-note`} className="muted-text mt-1 block">
            {emptyNote(props.optionsQuery)}
          </small>
        )}
      </>
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
    <Input
      id={id}
      aria-invalid={invalid}
      type={isNumeric(def) ? 'number' : 'text'}
      value={text(value)}
      onChange={(e) => onChange(parse(def, e.target.value))}
    />
  );
}

/** A change this soon after a key press on a closed select is the keyboard stepping through it. */
const KEY_STEP_MS = 100;

/**
 * A select whose changes save. A pick from the open list, by pointer or keyboard, saves at
 * once. Stepping through a closed select with arrow keys or type-ahead keeps a draft that
 * saves on Enter or when focus leaves, so each step is not its own save. A draft keeps the
 * revision it started from, so a change made elsewhere in the meantime still conflicts.
 */
export function StepSelect({
  value,
  rev,
  onCommit,
  ...props
}: Omit<
  ComponentProps<typeof NativeSelect>,
  'value' | 'rev' | 'onChange' | 'onKeyDown' | 'onBlur'
> & {
  value: string;
  rev: number;
  onCommit: (value: string, baseRev: number) => void;
}) {
  const [draft, setDraft] = useState<{ value: string; rev: number } | null>(null);
  const keyAt = useRef(-Infinity);
  const commit = (next: string, baseRev: number) => {
    setDraft(null);
    if (next !== value) onCommit(next, baseRev);
  };
  const flush = useRef(() => {});
  useLayoutEffect(() => {
    flush.current = () => draft && commit(draft.value, draft.rev);
  });
  // Leaving the page unmounts the select without a blur, so send a stepped draft now.
  useEffect(() => () => flush.current(), []);
  return (
    <NativeSelect
      {...props}
      value={draft?.value ?? value}
      onKeyDown={(e) => {
        keyAt.current = e.timeStamp;
        if (e.key === 'Enter' && draft) {
          e.preventDefault();
          commit(draft.value, draft.rev);
        }
        if (e.key === 'Escape') setDraft(null);
      }}
      onChange={(e) =>
        e.timeStamp - keyAt.current < KEY_STEP_MS
          ? setDraft({ value: e.target.value, rev: draft?.rev ?? rev })
          : commit(e.target.value, draft?.rev ?? rev)
      }
      onBlur={() => draft && commit(draft.value, draft.rev)}
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
  const latest = useRef({ value, onCommit, flush: () => {} });

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
  useLayoutEffect(() => {
    latest.current = { value, onCommit, flush: () => commit(draft) };
  });
  // Leaving the page unmounts the input without a blur, so send a typed draft now.
  useEffect(() => () => latest.current.flush(), []);

  // A custom class, such as the large title, styles a plain input instead of Input.
  const Field = className ? 'input' : Input;
  return (
    <Field
      id={id}
      aria-label={label}
      aria-invalid={invalid}
      className={className}
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
