import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { commentSchema, type Identity } from '../../../shared/contracts';
import { Avatar } from '../../components/ui/avatar';
import { Button } from '../../components/ui/button';
import { apiError, sendJson } from '../../lib/api';
import { commentsQuery, membersQuery } from '../../lib/queries';
import { AdoMention, extensions, sanitizeHtml } from '../../lib/rich-text';
import { refreshItem } from '../../lib/saves';
import { useScope } from '../../lib/scope';

const MAX_SUGGESTIONS = 8;

/** The item's comment thread, newest first, below a box for a new comment. */
export function Comments({ id, projectId }: { id: number; projectId: string }) {
  const thread = useInfiniteQuery(commentsQuery(id, projectId));
  // A new comment can shift ADO's pages, so an older page may repeat a comment.
  const comments = [
    ...new Map(
      (thread.data?.pages ?? []).flatMap((page) => page.comments).map((c) => [c.id, c]),
    ).values(),
  ];
  return (
    <>
      <CommentBox id={id} projectId={projectId} />
      {thread.isPending && (
        <p role="status" className="muted-text">
          Loading comments…
        </p>
      )}
      {thread.isError && (
        <p role="alert" className="notice notice-error">
          {thread.error.message}
        </p>
      )}
      {thread.isSuccess && comments.length === 0 && <p className="muted-text">No comments yet.</p>}
      <ol className="comment-list">
        {comments.map((comment) => (
          <li key={comment.id} className="comment">
            <div className="comment-meta">
              <Avatar identity={comment.author} />
              <strong>{comment.author?.displayName ?? 'Unknown person'}</strong>
              <time dateTime={comment.createdDate}>
                {new Date(comment.createdDate).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </time>
            </div>
            <div
              className="comment-body"
              // Sanitized with DOMPurify: no scripts, handlers, styles, or unsafe URLs.
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(comment.html) }}
            />
          </li>
        ))}
      </ol>
      {thread.hasNextPage && (
        <Button
          variant="outline"
          size="sm"
          disabled={thread.isFetchingNextPage}
          onClick={() => void thread.fetchNextPage()}
        >
          {thread.isFetchingNextPage ? 'Loading…' : 'Show older comments'}
        </Button>
      )}
    </>
  );
}

type Suggestions = {
  host: HTMLElement;
  people: Identity[];
  index: number;
  command: (attrs: { id: string; label: string }) => void;
};

const pick = (s: Suggestions, index: number) => {
  const person = s.people[index];
  if (person) s.command({ id: person.id, label: person.displayName });
};

/** A rich-text comment. Typing @ suggests team members and inserts an ADO mention. */
function CommentBox({ id, projectId }: { id: number; projectId: string }) {
  const queryClient = useQueryClient();
  const { project, team } = useScope(projectId);
  const members = useQuery(membersQuery(project?.id, team?.id));
  const listId = useId();
  const hintId = useId();
  const [empty, setEmpty] = useState(true);
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  // The editor keeps its first callbacks, so they read current values through a ref.
  const live = useRef({ members: [] as Identity[], suggestions: null as Suggestions | null });
  useEffect(() => {
    live.current.members = members.data ?? [];
  });
  const show = (next: Suggestions | null) => {
    live.current.suggestions = next;
    setSuggestions(next);
  };

  const editor = useEditor({
    extensions: [
      ...extensions,
      // eslint-disable-next-line react-hooks/refs -- read only in editor callbacks, after render.
      AdoMention.configure({
        suggestion: {
          items: ({ query }) =>
            live.current.members
              .filter((p) => p.displayName.toLowerCase().includes(query.toLowerCase()))
              .slice(0, MAX_SUGGESTIONS),
          render: () => {
            let unmount = () => {};
            return {
              onStart: (props) => {
                const host = document.createElement('div');
                host.className = 'mention-popup';
                unmount = props.mount(host);
                show({ host, people: props.items, index: 0, command: props.command });
              },
              onUpdate: (props) => {
                const host = live.current.suggestions?.host;
                if (host) show({ host, people: props.items, index: 0, command: props.command });
              },
              onKeyDown: ({ event }) => {
                const s = live.current.suggestions;
                if (!s?.people.length) return false;
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  const step = event.key === 'ArrowDown' ? 1 : s.people.length - 1;
                  show({ ...s, index: (s.index + step) % s.people.length });
                  return true;
                }
                if (event.key !== 'Enter' && event.key !== 'Tab') return false;
                pick(s, s.index);
                return true;
              },
              onExit: () => {
                unmount();
                show(null);
              },
            };
          },
        },
      }),
    ],
    editorProps: {
      attributes: {
        class: 'rich-text',
        role: 'textbox',
        'aria-label': 'New comment',
        'aria-multiline': 'true',
        'aria-describedby': hintId,
      },
    },
    onUpdate: ({ editor }) => setEmpty(editor.isEmpty),
  });

  // Screen readers follow the highlighted person while focus stays in the editor.
  useEffect(() => {
    if (!editor || !suggestions?.people.length) return;
    const dom = editor.view.dom;
    dom.setAttribute('aria-controls', listId);
    dom.setAttribute('aria-activedescendant', `${listId}-${suggestions.index}`);
    return () => {
      dom.removeAttribute('aria-controls');
      dom.removeAttribute('aria-activedescendant');
    };
  }, [editor, suggestions, listId]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['comments', id] });
    // Each comment adds an item revision in ADO. Refetch, or the next edit sends an old one.
    // ponytail: a save sent while the comment posts can still conflict once; it keeps its draft.
    refreshItem(queryClient, id);
  };
  const add = useMutation({
    mutationFn: (html: string) =>
      sendJson('POST', `/work-items/${id}/comments`, { projectId, html }, commentSchema),
    onSuccess: () => {
      refresh();
      // This runs even after the user opened another item and this editor was destroyed.
      if (editor && !editor.isDestroyed) editor.commands.clearContent(true);
    },
    onError: (error) => {
      // The comment may exist, so show the latest thread for the user to check.
      if (apiError(error).code === 'UNKNOWN_OUTCOME') refresh();
    },
  });
  // No typing while a comment sends, so clearing after success never drops new text.
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.setEditable(!add.isPending, false);
  }, [editor, add.isPending]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (editor && !editor.isEmpty && !add.isPending) add.mutate(editor.getHTML());
  };
  const failure = add.error && apiError(add.error);

  return (
    <form className="comment-box" onSubmit={submit}>
      <EditorContent editor={editor} className="rich-text-field" />
      <small id={hintId} className="muted-text">
        Type @ to mention a team member.
      </small>
      {failure && (
        <p role="alert" className="notice notice-error">
          {failure.code === 'UNKNOWN_OUTCOME'
            ? 'Eruza lost contact while adding the comment. It may already be posted. Check the comments below before sending it again.'
            : `The comment was not added. ${failure.message}`}{' '}
          Your draft is kept.
        </p>
      )}
      <div className="section-actions">
        <Button type="submit" size="sm" disabled={empty || add.isPending}>
          {add.isPending ? 'Adding…' : 'Add comment'}
        </Button>
      </div>
      {suggestions &&
        createPortal(
          suggestions.people.length ? (
            <ul
              id={listId}
              role="listbox"
              aria-label="Team members"
              className="popover command-list mention-list"
            >
              {suggestions.people.map((person, index) => (
                <li
                  key={person.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === suggestions.index}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    pick(suggestions, index);
                  }}
                >
                  <Avatar identity={person} />
                  {person.displayName}
                </li>
              ))}
            </ul>
          ) : (
            <div className="popover command-note">No matching team members.</div>
          ),
          suggestions.host,
        )}
    </form>
  );
}
