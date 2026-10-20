// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { descriptions } from '../server/mock/fixtures';
import { editableWithoutLoss, roundTrip, sanitizeHtml } from '../src/lib/rich-text';

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html').body;

describe('sanitizeHtml', () => {
  it('removes scripts, handlers, unsafe links, and unsafe images', () => {
    const body = parse(
      sanitizeHtml(
        '<p onclick="x()">Hi</p><script>alert(1)</script><img src="x" onerror="alert(2)">' +
          '<a href="javascript:alert(3)">bad</a><a href="data:text/html,hi">data</a>' +
          '<a href="https://example.com/a">ok</a><iframe src="https://example.com"></iframe>' +
          '<svg><script>alert(4)</script></svg><p style="position:fixed">styled</p>',
      ),
    );
    expect(body.querySelector('script, iframe, img, [onclick], [onerror], [style]')).toBeNull();
    const links = [...body.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual([null, null, 'https://example.com/a']);
    expect(links.every((a) => a.getAttribute('rel') === 'noopener noreferrer')).toBe(true);
    expect(body.textContent).toContain('styled');
  });

  it('keeps local item images and HTTPS images', () => {
    const body = parse(
      sanitizeHtml(
        '<img src="/api/work-items/1/images/0b5c3a52-1d43-4c4e-9a43-6a2c1f1e7d10"><img src="https://example.com/a.png"><img src="http://example.com/b.png">',
      ),
    );
    expect([...body.querySelectorAll('img')].map((i) => i.getAttribute('src'))).toEqual([
      '/api/work-items/1/images/0b5c3a52-1d43-4c4e-9a43-6a2c1f1e7d10',
      'https://example.com/a.png',
    ]);
  });
});

describe('editing without loss', () => {
  it('round-trips tables, links, images, lists, and formatting', () => {
    const html = descriptions[1001];
    expect(editableWithoutLoss(html)).toBe(true);
    const body = parse(roundTrip(sanitizeHtml(html)));
    expect(body.querySelectorAll('table tr')).toHaveLength(2);
    expect(body.querySelector('a')?.getAttribute('href')).toBe(
      'https://example.com/checkout-notes',
    );
    expect(body.querySelector('p > img')?.getAttribute('src')).toContain(
      '/api/work-items/1001/images/',
    );
    expect(body.querySelector('strong')?.textContent).toBe('three steps');
    expect(body.querySelectorAll('li')).toHaveLength(2);
  });

  it('keeps HTML that Eruza saved editable the next time', () => {
    const saved = roundTrip(sanitizeHtml(descriptions[1001]));
    expect(saved).toContain('style=');
    expect(editableWithoutLoss(saved)).toBe(true);
  });

  it('keeps ADO-style div markup editable', () => {
    expect(editableWithoutLoss('<div>First line</div><div><b>Second</b> line</div>')).toBe(true);
  });

  it.each([
    ['inline color', descriptions[1002]],
    ['font tag', '<p><font color="red">Red</font></p>'],
    ['subscript', '<p>H<sub>2</sub>O</p>'],
    ['highlight', '<p><mark>note</mark></p>'],
  ])('keeps %s read-only instead of dropping it', (_, html) => {
    expect(editableWithoutLoss(html)).toBe(false);
  });
});
