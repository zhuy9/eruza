/** True when a key press belongs to a text field or editor, so shortcuts must not fire. */
export function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** A plain single-letter shortcut: no modifier keys, not while typing, not inside a dialog. */
export const isShortcut = (event: KeyboardEvent, key: string) =>
  event.key.toLowerCase() === key &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.altKey &&
  !isTyping(event.target) &&
  !(event.target instanceof Element && event.target.closest('dialog'));
