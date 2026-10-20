// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isShortcut } from '../src/lib/keys';

function press(target: Element, key: string, init: KeyboardEventInit = {}) {
  let result = false;
  target.addEventListener('keydown', (event) => (result = isShortcut(event as KeyboardEvent, 'i')));
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
  return result;
}

describe('single-letter shortcuts', () => {
  it('fire on plain keys outside fields', () => {
    document.body.innerHTML = '<button>Row</button>';
    expect(press(document.querySelector('button')!, 'i')).toBe(true);
    expect(press(document.querySelector('button')!, 'I')).toBe(true);
  });

  it('do not fire while typing, with modifiers, or inside a dialog', () => {
    document.body.innerHTML =
      '<input><textarea></textarea><div contenteditable="true"></div><button id="b"></button><dialog open><button id="d"></button></dialog>';
    for (const selector of ['input', 'textarea']) {
      expect(press(document.querySelector(selector)!, 'i')).toBe(false);
    }
    expect(press(document.querySelector('#b')!, 'i', { ctrlKey: true })).toBe(false);
    expect(press(document.querySelector('#d')!, 'i')).toBe(false);
  });
});
