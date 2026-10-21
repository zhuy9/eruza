import DOMPurify from 'dompurify';
import { getHTMLFromFragment, getSchema, type Extensions } from '@tiptap/react';
import { DOMParser as SchemaParser } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import Image from '@tiptap/extension-image';
import Mention from '@tiptap/extension-mention';

const SAFE_LINK = /^(https?:|mailto:)/i;
/** Existing images load through Eruza's image route; other HTTPS images are allowed as-is. */
const SAFE_IMAGE = /^(https:|\/api\/work-items\/\d+\/images\/)/i;

export const extensions: Extensions = [
  StarterKit.configure({
    link: { openOnClick: false, isAllowedUri: (url) => SAFE_LINK.test(url) },
  }),
  TableKit,
  // Inline, like ADO's own markup, so images stay inside their paragraphs.
  Image.configure({ inline: true }),
];

const MENTION = /^version:2\.0,(.+)$/;

/** A person mention in ADO's markup: `<a href="#" data-vss-mention="version:2.0,{id}">@Name</a>`. */
export const AdoMention = Mention.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      id: {
        default: null,
        parseHTML: (el) => MENTION.exec(el.getAttribute('data-vss-mention') ?? '')?.[1] ?? null,
      },
      label: { default: null, parseHTML: (el) => el.textContent?.replace(/^@/, '') ?? null },
    };
  },
  parseHTML: () => [{ tag: 'a[data-vss-mention]' }],
  renderHTML: ({ node }) => [
    'a',
    { href: '#', 'data-vss-mention': `version:2.0,${node.attrs.id}` },
    `@${node.attrs.label}`,
  ],
});

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    if (!SAFE_LINK.test(node.getAttribute('href') ?? '')) node.removeAttribute('href');
    node.setAttribute('rel', 'noopener noreferrer');
    node.setAttribute('target', '_blank');
  }
  if (node.tagName === 'IMG' && !SAFE_IMAGE.test(node.getAttribute('src') ?? '')) {
    node.remove();
  }
});

/** Safe HTML for display and editing. Scripts, handlers, styles, and unsafe URLs are removed. */
export const sanitizeHtml = (html: string) =>
  DOMPurify.sanitize(html, { FORBID_ATTR: ['style'], FORBID_TAGS: ['style', 'form'] });

const parseBody = (html: string) =>
  new window.DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;

const schema = getSchema(extensions);

/** The HTML the editor would save for `html`. */
export function roundTrip(html: string) {
  const doc = SchemaParser.fromSchema(schema).parse(parseBody(html));
  return getHTMLFromFragment(doc.content, schema);
}

const ALIASES: Record<string, string> = { b: 'strong', i: 'em', strike: 's', del: 's' };
const WRAPPERS = new Set('p div span tbody colgroup col'.split(' '));

/** Preserve elements and attributes, allowing neutral wrappers and editor defaults. */
function signature(html: string) {
  const body = parseBody(html);
  const tags: Record<string, number> = {};
  const attributes = [];
  for (const el of body.querySelectorAll('*')) {
    const tag = ALIASES[el.localName] ?? el.localName;
    if (!WRAPPERS.has(tag)) tags[tag] = (tags[tag] ?? 0) + 1;
    const attrs = [...el.attributes]
      .filter(
        ({ name, value }) =>
          name !== 'style' &&
          // Column widths are editor layout, like the table/col styles checked below.
          !((tag === 'td' || tag === 'th') && name === 'colwidth') &&
          // The sanitizer supplies these link protections on every render.
          !(tag === 'a' && (name === 'rel' || name === 'target')) &&
          !((tag === 'td' || tag === 'th') && /^(colspan|rowspan)$/.test(name) && value === '1') &&
          !(tag === 'ol' && /^(start|type)$/.test(name) && value === '1'),
      )
      .map(({ name, value }) => [name, value])
      .sort();
    if (attrs.length) attributes.push([tag, attrs]);
  }
  return JSON.stringify({
    text: body.textContent?.replace(/\s+/g, ''),
    tags: Object.entries(tags).sort(),
    attributes,
  });
}

/**
 * True when the editor can hold this HTML without dropping anything the user can see.
 * Inline styles (colors, fonts) are not supported, so styled content stays read-only.
 */
export function editableWithoutLoss(html: string) {
  // Table and column widths are layout the editor writes itself, not user formatting.
  for (const el of parseBody(html).querySelectorAll<HTMLElement>('[style]')) {
    if (
      el.getAttribute('style')?.trim() &&
      (!['table', 'col'].includes(el.localName) ||
        Array.from(el.style).some((property) => !['width', 'min-width'].includes(property)))
    ) {
      return false;
    }
  }
  return signature(html) === signature(roundTrip(sanitizeHtml(html)));
}
