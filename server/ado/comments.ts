import { z } from 'zod';
import type { AddCommentInput, Comment, CommentPage } from '../../shared/contracts';
import { adoError, segment as e, type Ado } from './client';
import { toAdoImages, toLocalImages } from './images';
import { identityRef } from './work-items';

/** Comments are a preview API in REST 7.1. */
const VERSION = 'api-version=7.1-preview.4';
const PAGE_SIZE = 50;

export const rawComment = z.object({
  id: z.number(),
  text: z.string().optional(),
  renderedText: z.string().optional(),
  createdBy: identityRef.optional(),
  createdDate: z.string(),
});
export type RawComment = z.infer<typeof rawComment>;
const rawPage = z.object({
  comments: z.array(rawComment),
  continuationToken: z.string().nullish(),
});

/** Uses ADO's rendered HTML when present, so Markdown arrives as HTML. */
export function toComment(
  raw: RawComment,
  identities: Map<string, string>,
  organization: string,
  itemId: number,
): Comment {
  const author = raw.createdBy;
  if (author?.uniqueName) identities.set(author.id, author.uniqueName);
  return {
    id: raw.id,
    author: author ? { id: author.id, displayName: author.displayName } : null,
    createdDate: raw.createdDate,
    html: toLocalImages(raw.renderedText || raw.text || '', organization, itemId),
  };
}

export async function getComments(
  ado: Ado,
  id: number,
  projectId: string,
  cursor?: string,
): Promise<CommentPage> {
  const token = cursor ? `&continuationToken=${encodeURIComponent(cursor)}` : '';
  const page = rawPage.safeParse(
    await ado.json(
      `${e(projectId)}/_apis/wit/workItems/${id}/comments?$top=${PAGE_SIZE}&order=desc&$expand=renderedText${token}&${VERSION}`,
    ),
  );
  if (!page.success) throw adoError('UPSTREAM');
  const comments = page.data.comments.map((c) =>
    toComment(c, ado.identities, ado.organization, id),
  );
  // The image route serves a comment's attachments once a read has shown them.
  const local = new RegExp(`/api/work-items/${id}/images/([0-9a-f-]{36})`, 'gi');
  for (const { html } of comments) {
    for (const [, guid] of html.matchAll(local)) {
      ado.commentImages.add(`${id}/${guid.toLowerCase()}`);
    }
  }
  return { comments, cursor: page.data.continuationToken || null };
}

/** Posts once as HTML. A lost response is reported as an unknown outcome, never retried. */
export async function addComment(
  ado: Ado,
  id: number,
  { projectId, html }: AddCommentInput,
): Promise<Comment> {
  const raw = await ado.json(
    `${e(projectId)}/_apis/wit/workItems/${id}/comments?format=html&${VERSION}`,
    { method: 'POST', body: { text: toAdoImages(html, ado.organization) }, write: true },
  );
  const parsed = rawComment.safeParse(raw);
  // The comment exists; do not let the user post it again.
  if (!parsed.success) throw adoError('UNKNOWN_OUTCOME');
  return toComment(parsed.data, ado.identities, ado.organization, id);
}
