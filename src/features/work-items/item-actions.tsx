import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { ExternalLink, Hash, Link2, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { z } from 'zod';
import type { WorkItemSummary } from '../../../shared/contracts';
import { Button } from '../../components/ui/button';
import { apiError, sendJson } from '../../lib/api';
import { itemScope } from '../../lib/saves';
import type { ViewSearch } from '../../lib/scope';
import { useToast } from '../../lib/toast';

/** Copy, open, and delete actions for one item. */
export function ItemActions(props: {
  item: WorkItemSummary;
  /** The URL project and team the copied link keeps. */
  context: Pick<ViewSearch, 'project' | 'team'>;
  webUrl: string | null;
  /** Leaves the item's view after ADO confirms the deletion. */
  onDeleted: () => Promise<void>;
}) {
  const { item, webUrl } = props;
  const toast = useToast();
  const router = useRouter();
  // Each open gets a new key, so the last dialog's late close event cannot close the next one.
  const [confirming, setConfirming] = useState(0);
  // The clipboard can be missing or blocked, so every failure gets a message.
  const copy = (text: string, done: string) =>
    void Promise.resolve()
      .then(() => navigator.clipboard.writeText(text))
      .then(
        () => toast(done),
        () => toast('Could not copy. The browser blocked clipboard access.'),
      );
  return (
    <div className="item-actions">
      <Button
        variant="ghost"
        size="icon"
        title="Copy ID"
        aria-label="Copy ID"
        onClick={() => copy(String(item.id), `Copied ID ${item.id}.`)}
      >
        <Hash size={15} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        title="Copy link"
        aria-label="Copy link"
        onClick={() => {
          const link = router.buildLocation({
            to: '/items/$id',
            params: { id: String(item.id) },
            search: props.context,
          });
          copy(`${location.origin}${link.href}`, `Copied the link to #${item.id}.`);
        }}
      >
        <Link2 size={15} />
      </Button>
      {webUrl && (
        <a
          className="icon-link"
          href={webUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Open in Azure DevOps"
          aria-label="Open in Azure DevOps"
        >
          <ExternalLink size={15} />
        </a>
      )}
      <Button
        variant="ghost"
        size="icon"
        title="Delete"
        aria-label="Delete"
        onClick={() => setConfirming((key) => key + 1)}
      >
        <Trash2 size={15} />
      </Button>
      {confirming > 0 && (
        <DeleteDialog
          key={confirming}
          item={item}
          onClose={() => setConfirming(0)}
          onDeleted={props.onDeleted}
        />
      )}
    </div>
  );
}

function DeleteDialog(props: {
  item: WorkItemSummary;
  onClose: () => void;
  onDeleted: () => Promise<void>;
}) {
  const { item } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const textId = useId();
  useEffect(() => dialog.current?.showModal(), []);
  const queryClient = useQueryClient();
  const toast = useToast();
  const remove = useMutation({
    // Runs after the item's queued saves.
    scope: itemScope(item.id),
    mutationFn: () => sendJson('DELETE', `/work-items/${item.id}`, {}, z.null()),
    onSuccess: async () => {
      toast(`Moved #${item.id} to the Azure DevOps Recycle Bin.`);
      await props.onDeleted();
      queryClient.removeQueries({ queryKey: ['work-item', item.id] });
      queryClient.removeQueries({ queryKey: ['comments', item.id] });
      void queryClient.invalidateQueries({ queryKey: ['work-items'] });
      void queryClient.invalidateQueries({ queryKey: ['work-item'] });
    },
    onError: (error) => {
      if (apiError(error).code === 'UNKNOWN_OUTCOME') {
        void queryClient.invalidateQueries({ queryKey: ['work-item', item.id] });
      }
    },
  });
  const failure = remove.error && apiError(remove.error);

  return (
    <dialog
      ref={dialog}
      className="dialog dialog-narrow"
      onClose={props.onClose}
      // Stays open while deleting, so a late failure is still shown.
      onCancel={(event) => remove.isPending && event.preventDefault()}
      aria-labelledby={titleId}
      aria-describedby={textId}
    >
      <h2 id={titleId}>
        Delete #{item.id} {item.title}?
      </h2>
      <p id={textId}>
        Azure DevOps moves the item to the project&apos;s Recycle Bin, where it can be restored.
        Eruza never deletes items permanently.
      </p>
      {failure && (
        <p role="alert" className="notice notice-error">
          {failure.code === 'UNKNOWN_OUTCOME'
            ? 'Eruza lost contact while deleting. The item may already be in the Recycle Bin. Check before trying again.'
            : failure.message}
        </p>
      )}
      <div className="dialog-actions">
        <Button
          type="button"
          variant="ghost"
          disabled={remove.isPending}
          onClick={() => dialog.current?.close()}
        >
          Cancel
        </Button>
        <Button type="button" disabled={remove.isPending} onClick={() => remove.mutate()}>
          {remove.isPending ? 'Deleting…' : 'Move to Recycle Bin'}
        </Button>
      </div>
    </dialog>
  );
}
