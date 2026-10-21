import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from '../../components/ui/button';
import { WithTooltip } from '../../components/ui/tooltip';
import { useSetSearch } from '../../lib/scope';
import {
  GROUP_KEYS,
  LEVEL_LABELS,
  presetOf,
  PRESET_TEXT,
  PRESETS,
  type GroupKey,
  type Preset,
} from './grouping';

/** One icon button on a level chip, with a tooltip that repeats its name. */
function LevelButton(props: {
  action: 'earlier' | 'later' | 'remove';
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <WithTooltip label={props.label}>
      <button
        type="button"
        data-action={props.action}
        aria-label={props.label}
        disabled={props.disabled}
        onClick={props.onClick}
      >
        {props.children}
      </button>
    </WithTooltip>
  );
}

/**
 * Group by bar: numbered levels to move or remove, unused levels to add, and the
 * meeting presets. Buttons do everything, so no step needs a mouse drag.
 */
export function GroupBar({ levels }: { levels: readonly GroupKey[] }) {
  const setSearch = useSetSearch();
  const bar = useRef<HTMLDivElement>(null);
  // The control to focus once the URL shows the new levels.
  const focusAfter = useRef<{ levels: string; selector: string } | null>(null);
  useEffect(() => {
    if (focusAfter.current?.levels !== levels.join()) return;
    bar.current?.querySelector<HTMLElement>(focusAfter.current.selector)?.focus();
    focusAfter.current = null;
  });

  const apply = (next: GroupKey[], selector: string) => {
    focusAfter.current = { levels: next.join(), selector };
    const preset = presetOf(next);
    // A preset keeps its old `grouping` URL; other orders drop it, so no preset link is active.
    setSearch(
      preset ? { grouping: preset, group: undefined } : { grouping: undefined, group: next.join() },
    );
  };
  const move = (from: number, to: number) => {
    const next = [...levels];
    [next[from], next[to]] = [next[to], next[from]];
    // Focus stays on the same button unless the level reached the end it points to.
    const action =
      to < from ? (to === 0 ? 'later' : 'earlier') : to === next.length - 1 ? 'earlier' : 'later';
    apply(next, `[data-level="${levels[from]}"] [data-action="${action}"]`);
  };
  const current = presetOf(levels);
  const presets = Object.keys(PRESETS) as Preset[];

  return (
    <div ref={bar} className="group-bar" role="group" aria-label="Group by">
      <span role="status" className="sr-only">
        Grouped by {levels.map((key) => LEVEL_LABELS[key]).join(', then ')}.
      </span>
      <span className="group-bar-label" aria-hidden="true">
        Group by
      </span>
      {/* Safari drops list semantics when list-style is none, so the role is explicit. */}
      <ol className="group-levels" role="list">
        {levels.map((key, i) => {
          const name = LEVEL_LABELS[key];
          return (
            <li key={key} className="group-chip" data-level={key}>
              <span className="group-chip-number" aria-hidden="true">
                {i + 1}
              </span>
              {name}
              <LevelButton
                action="earlier"
                label={`Move ${name} earlier`}
                disabled={i === 0}
                onClick={() => move(i, i - 1)}
              >
                <ChevronLeft size={14} />
              </LevelButton>
              <LevelButton
                action="later"
                label={`Move ${name} later`}
                disabled={i === levels.length - 1}
                onClick={() => move(i, i + 1)}
              >
                <ChevronRight size={14} />
              </LevelButton>
              <LevelButton
                action="remove"
                label={`Remove ${name}`}
                disabled={levels.length === 1}
                onClick={() =>
                  apply(
                    levels.filter((level) => level !== key),
                    `[data-add="${key}"]`,
                  )
                }
              >
                <X size={14} />
              </LevelButton>
            </li>
          );
        })}
      </ol>
      {GROUP_KEYS.filter((key) => !levels.includes(key)).map((key) => (
        <button
          key={key}
          type="button"
          className="group-add"
          data-add={key}
          aria-label={`Add ${LEVEL_LABELS[key]} level`}
          onClick={() => apply([...levels, key], `[data-level="${key}"] [data-action="earlier"]`)}
        >
          <Plus size={12} />
          {LEVEL_LABELS[key]}
        </button>
      ))}
      <span className="group-reset">
        {presets
          .filter((preset) => preset !== current)
          .map((preset) => (
            <Button
              key={preset}
              variant="ghost"
              size="sm"
              data-preset={preset}
              // This button goes away once its preset is current, so focus the other one.
              onClick={() =>
                apply(
                  [...PRESETS[preset]],
                  `[data-preset="${presets.find((other) => other !== preset)}"]`,
                )
              }
            >
              {PRESET_TEXT[preset].name} order
            </Button>
          ))}
      </span>
    </div>
  );
}
