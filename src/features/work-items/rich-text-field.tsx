import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { editableWithoutLoss, editorShows, extensions, sanitizeHtml } from '../../lib/rich-text';

const SAVE_DELAY_MS = 1500;

type Props = {
  label: string;
  html: string;
  /** The revision of existing content; absent in the create form. */
  rev?: number;
  /** Called after a user edit, on blur or after a pause. Never called just for opening. */
  onSave?: (html: string, baseRev?: number) => void;
  /** Called on every user edit. */
  onChange?: (html: string) => void;
};

export function RichTextField(props: Props) {
  const editable = useMemo(() => editableWithoutLoss(props.html), [props.html]);
  if (editable) return <RichTextEditor {...props} />;
  return (
    <div>
      <div
        className="rich-text rich-text-readonly"
        // Sanitized with DOMPurify: no scripts, handlers, styles, or unsafe URLs.
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(props.html) }}
      />
      <p className="notice">
        This text uses formatting Eruza cannot edit without losing it, such as colors or fonts. It
        is shown read-only. Edit it in Azure DevOps.
      </p>
    </div>
  );
}

function RichTextEditor({ label, html, rev, onSave, onChange }: Props) {
  const dirty = useRef(false);
  const shownRev = useRef(rev);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const edited = useRef('');
  // The editor keeps its first callbacks, so it reads the latest props through a ref.
  const latest = useRef({ html, rev, onSave, onChange });
  useLayoutEffect(() => {
    latest.current = { html, rev, onSave, onChange };
  });
  const editor = useEditor({
    extensions,
    content: sanitizeHtml(html),
    editorProps: { attributes: { class: 'rich-text', 'aria-label': label, role: 'textbox' } },
    onUpdate: ({ editor }) => {
      dirty.current = true;
      edited.current = editor.getHTML();
      latest.current.onChange?.(edited.current);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => flush(edited.current), SAVE_DELAY_MS);
    },
    onBlur: ({ editor }) => {
      if (dirty.current) flush(editor.getHTML());
      else if (latest.current.onSave) sync(editor);
    },
  });

  function sync(editor: Editor) {
    const html = sanitizeHtml(latest.current.html);
    if (!editorShows(editor, html)) editor.commands.setContent(html, { emitUpdate: false });
    shownRev.current = latest.current.rev;
  }

  function flush(content: string) {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    latest.current.onSave?.(content, shownRev.current);
  }

  // Show newer server text only when the user is not editing; never emits a save.
  useEffect(() => {
    // React can rerun this effect after the editor instance was destroyed.
    if (editor && !editor.isDestroyed && !editor.isFocused && !dirty.current) {
      sync(editor);
    }
  }, [editor, html, rev]);

  // TipTap sends no blur when it is destroyed, so send a typed draft now.
  useEffect(() => () => flush(edited.current), []);

  return <EditorContent editor={editor} className="rich-text-field" />;
}
