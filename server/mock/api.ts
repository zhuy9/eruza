import type { BoardsApi, FieldValue, TeamScope, WorkItemSummary } from '../../shared/contracts';
import { adoError } from '../ado/client';
import { BLOCKED_FIELDS, CHILD_LINK, toDetail, type RawItem } from '../ado/item';
import { collectAncestors, toSummary } from '../ado/work-items';
import { AppError } from '../errors';
import * as data from './fixtures';

const notFound = () =>
  new AppError({ code: 'NOT_FOUND', message: 'This sample record was not found.' });
const invalid = (message: string, fieldErrors?: Record<string, string>) =>
  new AppError({ code: 'VALIDATION', message, ...(fieldErrors && { fieldErrors }) });

/** Fields that ADO process rules require only in some states. */
const REQUIRED_IN_STATE: Record<string, Record<string, string[]>> = {
  Bug: { Resolved: ['Microsoft.VSTS.Common.ResolvedReason'] },
};
/** States a new item cannot start in, like an ADO transition rule. */
const NOT_INITIAL: Record<string, string[]> = { Bug: ['Closed'] };

function lookup<T>(record: Record<string, T>, key: string): T {
  if (!Object.hasOwn(record, key)) throw notFound();
  return structuredClone(record[key]);
}

/** Mock routes accept a project ID or name, like ADO. */
function project(key: string) {
  const found = data.projects.find((p) => p.id === key || p.name === key);
  if (!found) throw notFound();
  return found;
}

function toRaw(item: WorkItemSummary): RawItem {
  const fields: Record<string, unknown> = {
    'System.TeamProject': item.areaPath.split('\\')[0],
    'System.WorkItemType': item.type,
    'System.Title': item.title,
    'System.State': item.state,
    'System.AreaPath': item.areaPath,
    'System.IterationPath': item.iterationPath,
    'System.Description': data.descriptions[item.id] ?? '',
    ...data.extraFields[item.id],
  };
  if (item.assignee) fields['System.AssignedTo'] = { ...item.assignee };
  if (item.tags.length) fields['System.Tags'] = item.tags.join('; ');
  if (item.parentId) fields['System.Parent'] = item.parentId;
  if (item.priority !== null) fields['Microsoft.VSTS.Common.Priority'] = item.priority;
  if (item.remainingWork !== null) {
    fields['Microsoft.VSTS.Scheduling.RemainingWork'] = item.remainingWork;
  }
  if (item.estimate) fields[item.estimate.field] = item.estimate.value;
  return { id: item.id, rev: item.rev, fields };
}

/** Applies field changes the way ADO would validate them. Returns new fields; never mutates. */
function applyFields(
  current: Record<string, unknown>,
  changes: Record<string, FieldValue>,
): Record<string, unknown> {
  const type = String(current['System.WorkItemType']);
  const defs = new Map(lookup(data.fields, type).map((f) => [f.referenceName, f]));
  const errors: Record<string, string> = {};
  const next = { ...current };
  for (const [ref, value] of Object.entries(changes)) {
    const def = defs.get(ref);
    if (!def || def.readOnly || BLOCKED_FIELDS.has(ref)) {
      errors[ref] = 'This field cannot be changed here.';
    } else if (value === null || value === '') {
      delete next[ref];
    } else if (def.type === 'identity') {
      const person = data.people.find((p) => p.id === value);
      if (person) next[ref] = { ...person };
      else errors[ref] = 'Choose a person from the list.';
    } else if (ref === 'System.State' && !data.states[type].some((s) => s.name === value)) {
      errors[ref] = 'This state is not valid for the item type.';
    } else if (def.allowedValues.length && !def.allowedValues.includes(value)) {
      errors[ref] = 'Choose one of the allowed values.';
    } else {
      next[ref] = value;
    }
  }
  const state = String(next['System.State']);
  const required = [...defs.values()].filter((f) => f.required).map((f) => f.referenceName);
  for (const ref of [...required, ...(REQUIRED_IN_STATE[type]?.[state] ?? [])]) {
    if (next[ref] === undefined) errors[ref] ??= 'This field is required.';
  }
  if (Object.keys(errors).length) throw invalid('Some fields need attention.', errors);
  return next;
}

const svg = (body: string) => ({
  bytes: new TextEncoder().encode(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">${body}</svg>`,
  ).buffer as ArrayBuffer,
  contentType: 'image/svg+xml',
});

export function createMockApi(): BoardsApi {
  const items = new Map(data.items.map((item) => [item.id, toRaw(item)]));
  let nextId = Math.max(...items.keys()) + 1;
  const identities = new Map<string, string>();
  const get = (id: number) => {
    const raw = items.get(id);
    if (!raw) throw notFound();
    return raw;
  };
  const summary = (raw: RawItem) => toSummary(structuredClone(raw), identities);
  const detail = (raw: RawItem) => {
    const children = [...items.values()].filter((c) => c.fields['System.Parent'] === raw.id);
    const relations = children.map((c) => ({ rel: CHILD_LINK, url: `mock/${c.id}` }));
    return toDetail(structuredClone({ ...raw, relations }), identities, '');
  };
  const save = (raw: RawItem) => {
    items.set(raw.id, raw);
    return detail(raw);
  };
  const team = (scope: TeamScope) => {
    if (!lookup(data.teams, project(scope.projectId).id).some((t) => t.id === scope.teamId)) {
      throw notFound();
    }
    return scope.teamId;
  };
  const session = async () =>
    ({ mode: 'mock', status: 'connected', user: data.people[0] }) as const;

  return {
    getSession: session,
    retryConnection: session,
    getProjects: async () => structuredClone(data.projects),
    getTeams: async (projectId) => lookup(data.teams, project(projectId).id),
    getTeamSettings: async (scope) => lookup(data.teamSettings, team(scope)),
    getTeamMembers: async (scope) => lookup(data.teamMembers, team(scope)),
    getIterations: async (scope) => data.iterations(team(scope)),
    getAreaPaths: async (projectId) => lookup(data.areaPaths, project(projectId).id),
    getBacklogs: async (scope) => {
      team(scope);
      return structuredClone(data.backlogs);
    },
    getWorkItemTypes: async (projectId) => {
      project(projectId);
      return structuredClone(data.types);
    },
    getWorkItemStates: async (_, type) => lookup(data.states, type),
    getWorkItemFields: async (_, type) => lookup(data.fields, type),

    async getWorkItems(query) {
      const { areas } = lookup(data.teamSettings, team(query));
      const inArea = (path: string) =>
        areas.some((a) => path === a.path || (a.includeChildren && path.startsWith(`${a.path}\\`)));
      const matches = [...items.values()]
        .map(summary)
        .filter(
          (item) =>
            item.iterationPath === query.iteration &&
            inArea(item.areaPath) &&
            (!query.type || item.type === query.type),
        );
      if (query.type) return { items: matches, ancestors: [], missingIds: [], incomplete: false };
      const extra = await collectAncestors(matches, data.backlogs, async (ids) => ({
        items: ids.filter((id) => items.has(id)).map((id) => summary(items.get(id)!)),
        missingIds: ids.filter((id) => !items.has(id)),
      }));
      return { items: matches, ...extra, incomplete: false };
    },

    async getWorkItem(id) {
      const item = detail(get(id));
      const ids = [...(item.parentId ? [item.parentId] : []), ...item.childIds];
      return {
        item,
        related: ids.filter((i) => items.has(i)).map((i) => summary(items.get(i)!)),
        missingIds: ids.filter((i) => !items.has(i)),
      };
    },

    async searchWorkItems(projectId, text) {
      const { name } = project(projectId);
      const needle = text.toLowerCase();
      const matches = [...items.values()].filter(
        (raw) =>
          raw.fields['System.TeamProject'] === name &&
          (String(raw.id) === text ||
            String(raw.fields['System.Title']).toLowerCase().includes(needle)),
      );
      return { items: matches.slice(0, 20).map(summary), incomplete: matches.length > 20 };
    },

    async createWorkItem(input) {
      const states = lookup(data.states, input.type);
      const start = input.fields['System.State'];
      if (typeof start === 'string' && NOT_INITIAL[input.type]?.includes(start)) {
        throw invalid(`A new ${input.type} cannot start in the ${start} state.`, {
          'System.State': 'Choose another starting state.',
        });
      }
      if (input.parentId && !items.has(input.parentId)) {
        throw invalid('The parent item was not found.');
      }
      const fields = applyFields(
        {
          'System.WorkItemType': input.type,
          'System.TeamProject': project(input.projectId).name,
          'System.State': states[0].name,
        },
        input.fields,
      );
      if (input.parentId) fields['System.Parent'] = input.parentId;
      return save({ id: nextId++, rev: 1, fields });
    },

    async updateWorkItem(id, input) {
      const raw = get(id);
      if (input.expectedRev !== raw.rev) throw adoError('CONFLICT');
      return save({ ...raw, rev: raw.rev + 1, fields: applyFields(raw.fields, input.fields) });
    },

    async setParent(id, { parentId, expectedRev }) {
      const raw = get(id);
      if (parentId === id) throw invalid('An item cannot be its own parent.');
      if (expectedRev !== raw.rev) throw adoError('CONFLICT');
      const fields = { ...raw.fields };
      if (parentId === null) {
        if (fields['System.Parent'] === undefined)
          throw invalid('This item has no parent to remove.');
        delete fields['System.Parent'];
      } else {
        if (!items.has(parentId)) throw invalid('The parent item was not found.');
        const seen = new Set<number>();
        for (let p: unknown = parentId; typeof p === 'number' && !seen.has(p);) {
          if (p === id) throw invalid('This change would make the item its own ancestor.');
          seen.add(p);
          p = items.get(p)?.fields['System.Parent'];
        }
        fields['System.Parent'] = parentId;
      }
      return save({ ...raw, rev: raw.rev + 1, fields });
    },

    async getAvatar(identityId) {
      const person = data.people.find((p) => p.id === identityId);
      if (!person) throw notFound();
      const letter = person.displayName.split(' ').pop()!.charAt(0);
      return svg(
        `<rect width="64" height="64" rx="32" fill="#e5dcec"/><text x="32" y="41" font-family="sans-serif" font-size="26" text-anchor="middle" fill="#6b4f80">${letter}</text>`,
      );
    },

    async getImage(id, resourceId) {
      if (!String(get(id).fields['System.Description']).includes(`/images/${resourceId}`)) {
        throw notFound();
      }
      return svg(
        '<rect width="64" height="64" fill="#dbe7f3"/><path d="M8 52 26 30l12 14 8-8 10 16z" fill="#7a9cc6"/>',
      );
    },
  };
}
