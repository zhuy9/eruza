import { useNavigate } from '@tanstack/react-router';
import { X } from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { Button } from '../../components/ui/button';
import { inDialog, isTyping } from '../../lib/keys';
import { WorkItemEditor } from './work-item-editor';

/** Side panel for the item in the `item` search parameter. Escape or Close returns focus. */
export function DetailPanel({ id }: { id: number }) {
  const navigate = useNavigate();
  const panel = useRef<HTMLElement>(null);
  const close = () =>
    void navigate({
      to: '.',
      search: (prev: Record<string, unknown>) => ({ ...prev, item: undefined }),
    });

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    // The opener can be gone, such as a grid row that moved; fall back to the main content.
    return () => (opener?.isConnected ? opener : document.getElementById('content'))?.focus();
  }, []);
  useEffect(() => panel.current?.focus(), [id]);

  const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    // Escape inside a dialog, popover, or tooltip closes only that layer.
    if (
      event.key === 'Escape' &&
      !event.defaultPrevented &&
      !isTyping(target) &&
      !inDialog(target) &&
      !target.closest('.popover')
    )
      close();
  };

  return (
    <aside
      ref={panel}
      className="detail-panel"
      tabIndex={-1}
      aria-label="Work item details"
      onKeyDown={onKeyDown}
    >
      <div className="panel-bar">
        <Button variant="ghost" size="icon" aria-label="Close details" onClick={close}>
          <X size={16} />
        </Button>
      </div>
      <WorkItemEditor id={id} variant="panel" />
    </aside>
  );
}
