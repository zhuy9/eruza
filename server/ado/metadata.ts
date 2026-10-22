import type {
  BacklogLevel,
  FieldDefinition,
  Identity,
  Iteration,
  Project,
  State,
  Team,
  TeamScope,
  TeamSettings,
  WorkItemType,
} from '../../shared/contracts';
import { readBody, segment, type Ado } from './client';

const e = segment;
const PAGE = 100;
type List<T> = { value: T[] };
const teamPath = (scope: TeamScope) => `${e(scope.projectId)}/${e(scope.teamId)}`;
const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);

async function pagedBySkip<T>(ado: Ado, path: string): Promise<T[]> {
  const all: T[] = [];
  for (let skip = 0; ; skip += PAGE) {
    const page = (await ado.json<List<T>>(`${path}&$top=${PAGE}&$skip=${skip}`)).value;
    all.push(...page);
    if (page.length < PAGE) return all;
  }
}

export async function getCurrentUser(ado: Ado): Promise<Identity> {
  // ponytail: connectionData is undocumented; confirm this version in the live check (M2.8).
  const { authenticatedUser: user } = await ado.json<{
    authenticatedUser: {
      id: string;
      providerDisplayName?: string;
      customDisplayName?: string;
      properties?: { Account?: { $value?: string } };
    };
  }>('_apis/connectionData?api-version=7.1-preview');
  const account = user.properties?.Account?.$value;
  if (account) ado.identities.set(user.id, account);
  return { id: user.id, displayName: user.customDisplayName || user.providerDisplayName || 'You' };
}

type OrgFields = Map<string, { readOnly: boolean; isIdentity: boolean }>;
const orgFieldCache = new WeakMap<Ado, Promise<OrgFields>>();

/** Org field definitions, read once per client. A failed read is not cached. */
export function getOrgFields(ado: Ado): Promise<OrgFields> {
  let fields = orgFieldCache.get(ado);
  if (!fields) {
    fields = ado
      .json<List<{ referenceName: string; readOnly: boolean; isIdentity?: boolean }>>(
        '_apis/wit/fields?api-version=7.1',
      )
      .then(
        ({ value }) =>
          new Map(
            value.map((f) => [
              f.referenceName,
              { readOnly: f.readOnly, isIdentity: !!f.isIdentity },
            ]),
          ),
      );
    fields.catch(() => orgFieldCache.delete(ado));
    orgFieldCache.set(ado, fields);
  }
  return fields;
}

/** A team member's or known user's avatar. Only identity IDs are accepted, never URLs. */
export async function getAvatar(ado: Ado, identityId: string) {
  const response = await ado.request(`_api/_common/identityImage?id=${e(identityId)}`);
  return {
    bytes: await readBody(response.arrayBuffer()),
    contentType: response.headers.get('content-type') ?? '',
  };
}

export async function getProjects(ado: Ado, defaultName: string): Promise<Project[]> {
  const projects: Project[] = [];
  let token = '';
  do {
    const query = token ? `&continuationToken=${e(token)}` : '';
    const response = await ado.request(`_apis/projects?api-version=7.1&$top=${PAGE}${query}`);
    const page = await readBody<List<{ id: string; name: string }>>(response.json());
    projects.push(
      ...page.value.map(({ id, name }) => ({ id, name, isDefault: name === defaultName })),
    );
    token = response.headers.get('x-ms-continuationtoken') ?? '';
  } while (token);
  return projects.sort(byName);
}

export async function getTeams(ado: Ado, projectId: string): Promise<Team[]> {
  const [teams, project] = await Promise.all([
    pagedBySkip<{ id: string; name: string }>(
      ado,
      `_apis/projects/${e(projectId)}/teams?api-version=7.1`,
    ),
    ado.json<{ defaultTeam?: { id: string } }>(`_apis/projects/${e(projectId)}?api-version=7.1`),
  ]);
  return teams
    .map(({ id, name }) => ({ id, name, isDefault: id === project.defaultTeam?.id }))
    .sort(byName);
}

export async function getTeamMembers(ado: Ado, scope: TeamScope): Promise<Identity[]> {
  const members = await pagedBySkip<{
    identity: { id: string; displayName: string; uniqueName?: string; isContainer?: boolean };
  }>(ado, `_apis/projects/${e(scope.projectId)}/teams/${e(scope.teamId)}/members?api-version=7.1`);
  for (const { identity } of members) {
    if (identity.uniqueName) ado.identities.set(identity.id, identity.uniqueName);
  }
  return members
    .filter((member) => !member.identity.isContainer)
    .map(({ identity }) => ({ id: identity.id, displayName: identity.displayName }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function getTeamSettings(ado: Ado, scope: TeamScope): Promise<TeamSettings> {
  const [settings, areas] = await Promise.all([
    ado.json<{ defaultIteration?: { path: string } | null }>(
      `${teamPath(scope)}/_apis/work/teamsettings?api-version=7.1`,
    ),
    ado.json<{ defaultValue: string; values: { value: string; includeChildren: boolean }[] }>(
      `${teamPath(scope)}/_apis/work/teamsettings/teamfieldvalues?api-version=7.1`,
    ),
  ]);
  return {
    defaultAreaPath: areas.defaultValue,
    areas: areas.values.map((area) => ({
      path: area.value,
      includeChildren: area.includeChildren,
    })),
    defaultIterationPath: settings.defaultIteration?.path ?? null,
  };
}

export async function getIterations(ado: Ado, scope: TeamScope): Promise<Iteration[]> {
  const { value } = await ado.json<
    List<{
      id: string;
      name: string;
      path: string;
      attributes: {
        startDate?: string | null;
        finishDate?: string | null;
        timeFrame: Iteration['timeFrame'];
      };
    }>
  >(`${teamPath(scope)}/_apis/work/teamsettings/iterations?api-version=7.1`);
  return value.map(({ id, name, path, attributes }) => ({
    id,
    name,
    path,
    startDate: attributes.startDate ?? null,
    finishDate: attributes.finishDate ?? null,
    timeFrame: attributes.timeFrame,
  }));
}

type AreaNode = { name: string; children?: AreaNode[] };

export async function getAreaPaths(ado: Ado, projectId: string): Promise<string[]> {
  const root = await ado.json<AreaNode>(
    `${e(projectId)}/_apis/wit/classificationnodes/Areas?$depth=20&api-version=7.1`,
  );
  const paths: string[] = [];
  const walk = (node: AreaNode, parent: string) => {
    const path = parent ? `${parent}\\${node.name}` : node.name;
    paths.push(path);
    node.children?.forEach((child) => walk(child, path));
  };
  walk(root, '');
  return paths;
}

export async function getBacklogs(ado: Ado, scope: TeamScope): Promise<BacklogLevel[]> {
  const { value } = await ado.json<
    List<{
      id: string;
      name: string;
      type: BacklogLevel['type'];
      workItemTypes: { name: string }[];
    }>
  >(`${teamPath(scope)}/_apis/work/backlogs?api-version=7.1`);
  return value.map(({ id, name, type, workItemTypes }) => ({
    id,
    name,
    type,
    workItemTypes: workItemTypes.map((t) => t.name),
  }));
}

export async function getWorkItemTypes(ado: Ado, projectId: string): Promise<WorkItemType[]> {
  const { value } = await ado.json<List<{ name: string; color: string; isDisabled?: boolean }>>(
    `${e(projectId)}/_apis/wit/workitemtypes?api-version=7.1`,
  );
  return value.filter((type) => !type.isDisabled).map(({ name, color }) => ({ name, color }));
}

export async function getWorkItemStates(
  ado: Ado,
  projectId: string,
  type: string,
): Promise<State[]> {
  const { value } = await ado.json<List<State>>(
    `${e(projectId)}/_apis/wit/workitemtypes/${e(type)}/states?api-version=7.1`,
  );
  return value.map(({ name, color, category }) => ({ name, color, category }));
}

export async function getWorkItemFields(
  ado: Ado,
  projectId: string,
  type: string,
): Promise<FieldDefinition[]> {
  const [typeFields, fields] = await Promise.all([
    ado.json<
      List<{
        referenceName: string;
        name: string;
        alwaysRequired: boolean;
        allowedValues?: FieldDefinition['allowedValues'];
        defaultValue?: FieldDefinition['defaultValue'];
      }>
    >(`${e(projectId)}/_apis/wit/workitemtypes/${e(type)}/fields?$expand=all&api-version=7.1`),
    ado.json<
      List<{ referenceName: string; type: string; readOnly: boolean; isIdentity?: boolean }>
    >(`${e(projectId)}/_apis/wit/fields?api-version=7.1`),
  ]);
  const info = new Map(fields.value.map((field) => [field.referenceName, field]));
  return typeFields.value.map((field) => {
    const definition = info.get(field.referenceName);
    const type = definition?.isIdentity ? 'identity' : (definition?.type ?? 'string');
    return {
      referenceName: field.referenceName,
      name: field.name,
      type,
      required: field.alwaysRequired,
      readOnly: definition?.readOnly ?? false,
      // Identity defaults and allowed values may contain private account names.
      allowedValues: type === 'identity' ? [] : (field.allowedValues ?? []),
      defaultValue: type === 'identity' ? null : (field.defaultValue ?? null),
    };
  });
}
