// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { descriptions } from '../server/mock/fixtures';
import { DOMParser as SchemaParser } from '@tiptap/pm/model';
import { Editor, getHTMLFromFragment, getSchema } from '@tiptap/react';
import {
  AdoMention,
  editableWithoutLoss,
  editorShows,
  extensions,
  roundTrip,
  sanitizeHtml,
} from '../src/lib/rich-text';

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

  it('keeps supported list attributes and editor table layout editable', () => {
    const html =
      '<ol type="a" start="3"><li>Third</li><li>Fourth</li></ol>' +
      '<table><tbody><tr><td colspan="2"><p>Wide cell</p></td></tr></tbody></table>';
    const saved = roundTrip(sanitizeHtml(html));
    const list = parse(saved).querySelector('ol')!;
    expect(list.getAttribute('type')).toBe('a');
    expect(list.getAttribute('start')).toBe('3');
    expect(saved).toContain('min-width:');
    expect(editableWithoutLoss(html)).toBe(true);
    expect(editableWithoutLoss(saved)).toBe(true);
  });

  it('keeps fixed-width tables saved by the editor editable', () => {
    const saved = roundTrip(
      '<table><tbody><tr><td colwidth="100"><p>Fixed width</p></td></tr></tbody></table>',
    );
    expect(saved).toContain('width: 100px');
    expect(saved).toContain('colwidth="100"');
    expect(editableWithoutLoss(saved)).toBe(true);
  });

  it.each([
    '<a href="https://example.com/notes" title="Notes">Read more</a>',
    '<img src="https://example.com/flow.png" alt="Flow" title="Diagram" width="120" height="80">',
    '<ol start="1" type="1"><li>First</li></ol>',
    '<pre><code class="language-js">const value = 1;</code></pre>',
    '<p><em><strong>Both formats</strong></em></p>',
    '<table style="width: 100px"><colgroup><col style="width: 100px"></colgroup><tbody><tr><td>Cell</td></tr></tbody></table>',
  ])('keeps supported attributes editable: %s', (html) => {
    expect(editableWithoutLoss(html)).toBe(true);
  });

  it.each([
    ['inline color', descriptions[1002]],
    [
      'table color',
      '<table style="background-color:red"><tbody><tr><td>Red table</td></tr></tbody></table>',
    ],
    [
      'column color',
      '<table><colgroup><col style="background-color:red"></colgroup><tbody><tr><td>Red column</td></tr></tbody></table>',
    ],
    [
      'table color mixed with layout',
      '<table style="width:100px;background-color:red"><tbody><tr><td>Red table</td></tr></tbody></table>',
    ],
    ['paragraph alignment', '<p align="center">Centered</p>'],
    ['text direction', '<div dir="rtl">Right to left</div>'],
    ['reversed list', '<ol reversed><li>Second</li><li>First</li></ol>'],
    ['list item value', '<ol><li value="4">Fourth</li></ol>'],
    ['video', '<video controls src="https://example.com/demo.mp4"></video>'],
    ['audio', '<audio controls src="https://example.com/demo.mp3"></audio>'],
    ['embedded frame', '<iframe src="https://example.com/demo"></iframe>'],
    ['disclosure', '<details open><summary>More</summary>Details</details>'],
    ['formatting title', '<strong title="Important">Note</strong>'],
    [
      'image description',
      '<img src="https://example.com/flow.png" longdesc="https://example.com/flow">',
    ],
    ['font tag', '<p><font color="red">Red</font></p>'],
    ['subscript', '<p>H<sub>2</sub>O</p>'],
    ['highlight', '<p><mark>note</mark></p>'],
  ])('keeps %s read-only instead of dropping it', (_, html) => {
    expect(editableWithoutLoss(html)).toBe(false);
  });
});

describe('mentions', () => {
  const mention = '<a href="#" data-vss-mention="version:2.0,person-b">@Person B</a>';

  it('keeps ADO mention markup through the comment editor', () => {
    const schema = getSchema([...extensions, AdoMention]);
    const html = `<p>Thanks ${mention}, done.</p>`;
    const doc = SchemaParser.fromSchema(schema).parse(parse(html));
    expect(getHTMLFromFragment(doc.content, schema)).toBe(html);
  });

  it('keeps the mention attribute and text when sanitizing for display', () => {
    const link = parse(sanitizeHtml(`<p>${mention}</p>`)).querySelector('a')!;
    expect(link.getAttribute('data-vss-mention')).toBe('version:2.0,person-b');
    expect(link.textContent).toBe('@Person B');
    expect(link.hasAttribute('href')).toBe(false);
  });
});

describe('editorShows', () => {
  it('matches what the editor holds, including lone newlines and links made in it', () => {
    const html = sanitizeHtml('<p><strong>Note:</strong>\n<em>check logs</em> on the host</p>');
    const editor = new Editor({ extensions, content: html });
    expect(editorShows(editor, html)).toBe(true);
    editor.chain().selectAll().setLink({ href: 'https://example.com' }).run();
    expect(editorShows(editor, sanitizeHtml(editor.getHTML()))).toBe(true);
    expect(editorShows(editor, sanitizeHtml('<p>Changed elsewhere</p>'))).toBe(false);
    editor.destroy();
  });
});
