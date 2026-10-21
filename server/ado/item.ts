import type {
  CreateWorkItemInput,
  FieldValue,
  SearchResult,
  SetParentInput,
  UpdateWorkItemInput,
  WorkItemDetail,
  WorkItemView,
} from '../../shared/contracts';
import { AppError } from '../errors';
import { adoError, segment as e, type Ado } from './client';
import { toAdoImages, toLocalImages } from './images';
import { getOrgFields } from './metadata';
import { batchGet, identityRef, toSummary, wiqlString } from './work-items';

export const PARENT_LINK = 'System.LinkTypes.Hierarchy-Reverse';
export const CHILD_LINK = 'System.LinkTypes.Hierarchy-Forward';
const PATCH = 'application/json-patch+json';
const SEARCH_LIMIT = 20;
/** Changed through other operations, never as plain fields. */
export const BLOCKED_FIELDS = new Set([
  'System.Parent',
  'System.WorkItemType',
  'System.TeamProject',
]);
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RawItem = {
  id: number;
  rev: number;
  fields: Record<string, unknown>;
  relations?: { rel: string; url: string }[] | null;
};

type PatchOp = { op: 'test' | 'add' | 'remove'; path: string; value?: unknown };

const fieldError = (field: string, message: string) =>
  new AppError({ code: 'VALIDATION', message, fieldErrors: { [field]: message } });

const idFromUrl = (url: string) => Number(url.slice(url.lastIndexOf('/') + 1));
const isScalar = (value: unknown): value is FieldValue =>
  value === null || ['string', 'number', 'boolean'].includes(typeof value);

export function toDetail(
  raw: RawItem,
  identities: Map<string, string>,
  organization: string,
): WorkItemDetail {
  const { 'System.Description': description, ...rest } = raw.fields;
  const fields: WorkItemDetail['fields'] = {};
  for (const [ref, value] of Object.entries(rest)) {
    if (isScalar(value)) {
      fields[ref] = value;
      continue;
    }
    const person = identityRef.safeParse(value);
    // System people (creator, last editor) are not editable here, so they stay on the server.
    if (person.success && !ref.startsWith('System.')) {
      const { id, displayName, uniqueName } = person.data;
      if (uniqueName) identities.set(id, uniqueName);
      fields[ref] = { id, displayName };
    }
  }
  return {
    ...toSummary(raw, identities),
    project: String(raw.fields['System.TeamProject'] ?? ''),
    description: toLocalImages(
      typeof description === 'string' ? description : '',
      organization,
      raw.id,
    ),
    fields,
    childIds: (raw.relations ?? [])
      .filter((r) => r.rel === CHILD_LINK)
      .map((r) => idFromUrl(r.url)),
  };
}

const parentUrl = (ado: Ado, id: number) =>
  `https://dev.azure.com/${ado.organization}/_apis/wit/workItems/${id}`;

export async function getWorkItem(ado: Ado, id: number): Promise<WorkItemView> {
  const raw = await ado.json<RawItem>(
    `_apis/wit/workitems/${id}?$expand=relations&api-version=7.1`,
  );
  const item = toDetail(raw, ado.identities, ado.organization);
  const ids = [...(item.parentId ? [item.parentId] : []), ...item.childIds];
  const { items: related, missingIds } = await batchGet(ado, item.project, ids);
  return { item, related, missingIds, webUrl: webUrl(ado.organization, item.project, id) };
}

/** The item's page in Azure DevOps. Built from settings and IDs only; it never holds a token. */
export const webUrl = (organization: string, project: string, id: number) =>
  `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/_workitems/edit/${id}`;

export async function searchWorkItems(
  ado: Ado,
  projectId: string,
  text: string,
): Promise<SearchResult> {
  const result = await ado.json<{ workItems: { id: number }[] }>(
    `${e(projectId)}/_apis/wit/wiql?$top=${SEARCH_LIMIT + 1}&api-version=7.1`,
    {
      method: 'POST',
      body: {
        query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.Title] CONTAINS ${wiqlString(text)} ORDER BY [System.ChangedDate] DESC`,
      },
    },
  );
  const direct = /^\d+$/.test(text) ? [Number(text)] : [];
  const ids = [...direct, ...result.workItems.map((item) => item.id)].slice(0, SEARCH_LIMIT);
  const { items } = await batchGet(ado, projectId, ids);
  return { items, incomplete: result.workItems.length > SEARCH_LIMIT };
}

/** Builds field operations. Only writable known fields are accepted; people are sent by unique name. */
async function fieldOps(ado: Ado, fields: Record<string, FieldValue>): Promise<PatchOp[]> {
  const known = await getOrgFields(ado);
  return Object.entries(fields).map(([ref, value]) => {
    const field = known.get(ref);
    if (!field || field.readOnly || BLOCKED_FIELDS.has(ref)) {
      throw fieldError(ref, 'This field cannot be changed here.');
    }
    const path = `/fields/${ref}`;
    if (value === null) return { op: 'remove', path };
    if (field.isIdentity) {
      const uniqueName = typeof value === 'string' ? ado.identities.get(value) : undefined;
      if (!uniqueName) throw fieldError(ref, 'Choose a person from the list.');
      return { op: 'add', path, value: uniqueName };
    }
    return {
      op: 'add',
      path,
      value: typeof value === 'string' ? toAdoImages(value, ado.organization) : value,
    };
  });
}

export async function createWorkItem(
  ado: Ado,
  input: CreateWorkItemInput,
): Promise<WorkItemDetail> {
  const ops = await fieldOps(ado, input.fields);
  if (input.parentId) {
    ops.push({
      op: 'add',
      path: '/relations/-',
      value: { rel: PARENT_LINK, url: parentUrl(ado, input.parentId) },
    });
  }
  const raw = await ado.json<RawItem>(
    `${e(input.projectId)}/_apis/wit/workitems/$${e(input.type)}?$expand=relations&api-version=7.1`,
    { method: 'POST', body: ops, contentType: PATCH, write: true },
  );
  try {
    return toDetail(raw, ado.identities, ado.organization);
  } catch {
    // The item exists; do not let the user create it again.
    throw adoError('UNKNOWN_OUTCOME');
  }
}

/** A failed patch is a conflict when the item's revision moved past the expected one. */
async function conflictOr(ado: Ado, id: number, expectedRev: number, error: unknown) {
  if (!(error instanceof AppError) || error.body.code !== 'VALIDATION') return error;
  const current = await ado
    .json<{ rev: number }>(`_apis/wit/workitems/${id}?fields=System.Rev&api-version=7.1`)
    .catch(() => null);
  return current && current.rev !== expectedRev ? adoError('CONFLICT') : error;
}

async function patchItem(ado: Ado, id: number, expectedRev: number, ops: PatchOp[]) {
  let raw: RawItem;
  try {
    raw = await ado.json<RawItem>(`_apis/wit/workitems/${id}?$expand=relations&api-version=7.1`, {
      method: 'PATCH',
      body: [{ op: 'test', path: '/rev', value: expectedRev }, ...ops],
      contentType: PATCH,
      write: true,
    });
  } catch (error) {
    throw await conflictOr(ado, id, expectedRev, error);
  }
  try {
    return toDetail(raw, ado.identities, ado.organization);
  } catch {
    throw adoError('UNKNOWN_OUTCOME');
  }
}

export async function updateWorkItem(ado: Ado, id: number, input: UpdateWorkItemInput) {
  return patchItem(ado, id, input.expectedRev, await fieldOps(ado, input.fields));
}

/** Sets, changes, or removes the parent in one patch, using relation indexes at expectedRev. */
export async function setParent(ado: Ado, id: number, { parentId, expectedRev }: SetParentInput) {
  if (parentId === id) {
    throw new AppError({ code: 'VALIDATION', message: 'An item cannot be its own parent.' });
  }
  const atRev = await ado
    .json<RawItem>(
      `_apis/wit/workitems/${id}/revisions/${expectedRev}?$expand=relations&api-version=7.1`,
    )
    .catch((error: unknown) => {
      throw error instanceof AppError && error.body.code === 'NOT_FOUND'
        ? adoError('CONFLICT')
        : error;
    });
  const index = (atRev.relations ?? []).findIndex((r) => r.rel === PARENT_LINK);
  const ops: PatchOp[] = [];
  if (index >= 0) ops.push({ op: 'remove', path: `/relations/${index}` });
  if (parentId) {
    ops.push({
      op: 'add',
      path: '/relations/-',
      value: { rel: PARENT_LINK, url: parentUrl(ado, parentId) },
    });
  }
  if (!ops.length) {
    throw new AppError({ code: 'VALIDATION', message: 'This item has no parent to remove.' });
  }
  return patchItem(ado, id, expectedRev, ops);
}

/** Moves the item to the recycle bin. `destroy=false` keeps it recoverable. */
export async function deleteWorkItem(ado: Ado, id: number) {
  await ado.request(`_apis/wit/workitems/${id}?destroy=false&api-version=7.1`, {
    method: 'DELETE',
    write: true,
  });
}

/** An image in the item's description or in comments already read. Others are refused. */
export async function getImage(ado: Ado, id: number, resourceId: string) {
  if (!GUID.test(resourceId)) throw adoError('NOT_FOUND');
  const guid = resourceId.toLowerCase();
  if (!ado.commentImages.has(`${id}/${guid}`)) {
    const raw = await ado.json<RawItem>(
      `_apis/wit/workitems/${id}?fields=System.Description&api-version=7.1`,
    );
    const html = String(raw.fields['System.Description'] ?? '').toLowerCase();
    if (!html.includes(`/_apis/wit/attachments/${guid}`)) throw adoError('NOT_FOUND');
  }
  const response = await ado.request(`_apis/wit/attachments/${resourceId}?api-version=7.1`);
  return {
    bytes: await response.arrayBuffer(),
    contentType: response.headers.get('content-type') ?? '',
  };
}
