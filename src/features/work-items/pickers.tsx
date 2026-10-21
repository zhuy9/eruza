import * as Popover from '@radix-ui/react-popover';
import { useQuery } from '@tanstack/react-query';
import { Command } from 'cmdk';
import { useEffect, useState, type ReactNode } from 'react';
import type { Identity, WorkItemSummary } from '../../../shared/contracts';
import { Avatar } from '../../components/ui/avatar';
import { searchQuery } from '../../lib/queries';

const SEARCH_DELAY_MS = 250;

function Picker(props: {
  id?: string;
  invalid?: boolean;
  label: string;
  trigger: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Popover.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Popover.Trigger
        id={props.id}
        className="picker-trigger"
        aria-label={props.label}
        aria-invalid={props.invalid}
      >
        {props.trigger}
      </Popover.Trigger>
      {/* No portal: content must stay inside a modal <dialog> to be usable there. */}
      <Popover.Content className="popover" align="start" sideOffset={4}>
        {props.children}
      </Popover.Content>
    </Popover.Root>
  );
}

/** Team members, plus the current assignee even when they are not on the team. */
export function AssigneePicker(props: {
  id?: string;
  invalid?: boolean;
  /** Accessible name for the trigger. Defaults to the current assignee. */
  label?: string;
  /** Accessible name for the menu. */
  menuLabel?: string;
  /** Hides Unassign. */
  required?: boolean;
  assignee: Identity | null;
  me?: Identity;
  members: Identity[];
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const people = [...(props.assignee ? [props.assignee] : []), ...props.members].filter(
    (person, index, all) => all.findIndex((p) => p.id === person.id) === index,
  );
  const choose = (id: string | null) => {
    setOpen(false);
    props.onChange(id);
  };
  return (
    <Picker
      id={props.id}
      invalid={props.invalid}
      label={props.label ?? `Assignee: ${props.assignee?.displayName ?? 'Unassigned'}`}
      open={open}
      onOpenChange={setOpen}
      trigger={
        <>
          <Avatar identity={props.assignee} />
          {props.assignee?.displayName ?? 'Unassigned'}
        </>
      }
    >
      <Command label={props.menuLabel ?? 'Choose an assignee'}>
        <Command.Input placeholder="Search people" className="command-input" />
        <Command.List className="command-list">
          <Command.Empty>No matching people.</Command.Empty>
          {props.me && (
            <Command.Item
              value="assign-to-me"
              keywords={['me']}
              onSelect={() => choose(props.me!.id)}
            >
              Assign to me
            </Command.Item>
          )}
          {!props.required && (
            <Command.Item value="unassign" onSelect={() => choose(null)}>
              Unassign
            </Command.Item>
          )}
          <Command.Group heading="People">
            {people.map((person) => (
              <Command.Item
                key={person.id}
                value={person.id}
                keywords={[person.displayName]}
                onSelect={() => choose(person.id)}
              >
                <Avatar identity={person} />
                {person.displayName}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </Picker>
  );
}

function useDebounced(value: string) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [value]);
  return debounced;
}

/** Finds an item by ID or title to use as a parent. */
export function ParentPicker(props: {
  label: string;
  projectId: string;
  excludeId?: number;
  onSelect: (item: WorkItemSummary) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const query = useDebounced(text);
  const results = useQuery(searchQuery(open ? props.projectId : undefined, query));
  return (
    <Picker label={props.label} open={open} onOpenChange={setOpen} trigger={props.label}>
      <Command label="Find a parent" shouldFilter={false}>
        <Command.Input
          value={text}
          onValueChange={setText}
          placeholder="Search by ID or title"
          className="command-input"
        />
        <Command.List className="command-list">
          {results.isFetching && <Command.Loading>Searching…</Command.Loading>}
          {results.isError && <div className="command-note">{results.error.message}</div>}
          {results.data?.items
            .filter((item) => item.id !== props.excludeId)
            .map((item) => (
              <Command.Item
                key={item.id}
                value={String(item.id)}
                onSelect={() => {
                  setOpen(false);
                  props.onSelect(item);
                }}
              >
                <span className="item-number">#{item.id}</span>
                {item.title}
                <span className="muted-text">{item.type}</span>
              </Command.Item>
            ))}
          {results.data?.items.length === 0 && <div className="command-note">No matches.</div>}
          {results.data?.incomplete && (
            <div className="command-note">More items match. Type more to narrow the list.</div>
          )}
        </Command.List>
      </Command>
    </Picker>
  );
}
