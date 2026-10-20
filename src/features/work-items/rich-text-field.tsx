import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { editableWithoutLoss, extensions, sanitizeHtml } from '../../lib/rich-text';

const SAVE_DELAY_MS = 1500;

type Props = {
  label: string;
  html: string;
  /** Called after a user edit, on blur or after a pause. Never called just for opening. */
  onSave?: (html: string) => void;
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

function RichTextEditor({ label, html, onSave, onChange }: Props) {
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // The editor keeps its first callbacks, so it reads the latest props through a ref.
  const latest = useRef({ onSave, onChange });
  useLayoutEffect(() => {
    latest.current = { onSave, onChange };
  });
  const editor = useEditor({
    extensions,
    content: sanitizeHtml(html),
    editorProps: { attributes: { class: 'rich-text', 'aria-label': label, role: 'textbox' } },
    onUpdate: ({ editor }) => {
      dirty.current = true;
      latest.current.onChange?.(editor.getHTML());
      clearTimeout(timer.current);
      timer.current = setTimeout(() => flush(editor.getHTML()), SAVE_DELAY_MS);
    },
    onBlur: ({ editor }) => flush(editor.getHTML()),
  });

  function flush(content: string) {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    latest.current.onSave?.(content);
  }

  // Show newer server text only when the user is not editing; never emits a save.
  useEffect(() => {
    // React can rerun this effect after the editor instance was destroyed.
    if (editor && !editor.isDestroyed && !editor.isFocused && !dirty.current) {
      editor.commands.setContent(sanitizeHtml(html), { emitUpdate: false });
    }
  }, [editor, html]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return <EditorContent editor={editor} className="rich-text-field" />;
}
