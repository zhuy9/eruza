import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Command } from 'cmdk';
import type { CreateRequest } from '../features/work-items/create';
import { typesQuery } from '../lib/queries';
import { keepView, useScope, type ViewSearch } from '../lib/scope';

/** Ctrl/Cmd+K: create items and move between views. */
export function CommandPalette(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (request: CreateRequest) => void;
}) {
  const { project } = useScope();
  const types = useQuery(typesQuery(project?.id));
  const navigate = useNavigate();
  const run = (action: () => void) => {
    props.onOpenChange(false);
    action();
  };
  const go = (to: '/board' | '/grid', grouping?: 'person' | 'story') =>
    run(
      () =>
        void navigate({
          to,
          search: (prev: ViewSearch) => ({ ...keepView(prev), ...(grouping && { grouping }) }),
        }),
    );

  return (
    <Command.Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      label="Command palette"
      overlayClassName="palette-overlay"
      contentClassName="palette"
    >
      <Command.Input placeholder="Type a command" className="command-input" />
      <Command.List className="command-list">
        <Command.Empty>No matching commands.</Command.Empty>
        <Command.Group heading="Create">
          <Command.Item onSelect={() => run(() => props.onCreate({}))}>New work item</Command.Item>
          {types.data?.map((t) => (
            <Command.Item key={t.name} onSelect={() => run(() => props.onCreate({ type: t.name }))}>
              New {t.name}
            </Command.Item>
          ))}
        </Command.Group>
        <Command.Group heading="Go to">
          <Command.Item onSelect={() => go('/board')}>Board</Command.Item>
          <Command.Item onSelect={() => go('/grid', 'person')}>Sprint update</Command.Item>
          <Command.Item onSelect={() => go('/grid', 'story')}>Sprint retro</Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
