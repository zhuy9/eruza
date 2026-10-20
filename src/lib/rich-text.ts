import DOMPurify from 'dompurify';
import { getHTMLFromFragment, getSchema, type Extensions } from '@tiptap/react';
import { DOMParser as SchemaParser } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import Image from '@tiptap/extension-image';

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
const TRACKED = new Set(
  'a img table tr th td ul ol li h1 h2 h3 h4 h5 h6 pre code blockquote strong em u s hr sub sup mark font'.split(
    ' ',
  ),
);

/** What must survive an edit: text, tracked formatting, link targets, and image sources. */
function signature(html: string) {
  const body = parseBody(html);
  const tags: Record<string, number> = {};
  for (const el of body.querySelectorAll('*')) {
    const tag = ALIASES[el.localName] ?? el.localName;
    if (TRACKED.has(tag)) tags[tag] = (tags[tag] ?? 0) + 1;
  }
  return JSON.stringify({
    text: body.textContent?.replace(/\s+/g, ''),
    tags: Object.entries(tags).sort(),
    links: [...body.querySelectorAll('a')].map((a) => a.getAttribute('href')),
    images: [...body.querySelectorAll('img')].map((img) => img.getAttribute('src')),
  });
}

/**
 * True when the editor can hold this HTML without dropping anything the user can see.
 * Inline styles (colors, fonts) are not supported, so styled content stays read-only.
 */
export function editableWithoutLoss(html: string) {
  // Table and column widths are layout the editor writes itself, not user formatting.
  if (parseBody(html).querySelector('[style]:not([style=""], table, col), font')) return false;
  const clean = sanitizeHtml(html);
  return signature(clean) === signature(roundTrip(clean));
}
