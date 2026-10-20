import type {
  BacklogLevel,
  FieldDefinition,
  Identity,
  Iteration,
  Project,
  State,
  Team,
  TeamSettings,
  WorkItemSummary,
  WorkItemType,
} from '../../shared/contracts';

// Synthetic data only. Never copy real records here.
export const people: Identity[] = [
  { id: 'person-a', displayName: 'Person A' },
  { id: 'person-b', displayName: 'Person B' },
  { id: 'person-c', displayName: 'Person C' },
  { id: 'person-d', displayName: 'Person D' }, // assigned to work, but not a team member
];

export const projects: Project[] = [
  { id: 'practice-project', name: 'Practice project', isDefault: false },
  { id: 'sample-project', name: 'Sample project', isDefault: true },
];

export const teams: Record<string, Team[]> = {
  'sample-project': [
    { id: 'platform-team', name: 'Platform team', isDefault: false },
    { id: 'web-team', name: 'Web team', isDefault: true },
  ],
  'practice-project': [{ id: 'practice-team', name: 'Practice team', isDefault: true }],
};

export const teamMembers: Record<string, Identity[]> = {
  'web-team': people.slice(0, 3),
  'platform-team': [people[2]],
  'practice-team': [people[0]],
};

export const teamSettings: Record<string, TeamSettings> = {
  'web-team': {
    defaultAreaPath: 'Sample project\\Web',
    areas: [{ path: 'Sample project\\Web', includeChildren: true }],
    defaultIterationPath: 'Sample project\\Sprint 3',
  },
  'platform-team': {
    defaultAreaPath: 'Sample project\\Platform',
    areas: [{ path: 'Sample project\\Platform', includeChildren: false }],
    defaultIterationPath: null,
  },
  'practice-team': {
    defaultAreaPath: 'Practice project',
    areas: [{ path: 'Practice project', includeChildren: true }],
    defaultIterationPath: null,
  },
};

export const areaPaths: Record<string, string[]> = {
  'sample-project': [
    'Sample project',
    'Sample project\\Platform',
    'Sample project\\Web',
    'Sample project\\Web\\Checkout',
  ],
  'practice-project': ['Practice project'],
};

const DAY = 86_400_000;

/** Two-week sprints placed around today. `current` null means every sprint is past. */
function sprints(project: string, count: number, current: number | null): Iteration[] {
  const base = Date.now() - 7 * DAY - (current ?? count) * 14 * DAY;
  return Array.from({ length: count }, (_, k) => ({
    id: `${project}-sprint-${k + 1}`,
    name: `Sprint ${k + 1}`,
    path: `${project}\\Sprint ${k + 1}`,
    startDate: new Date(base + k * 14 * DAY).toISOString(),
    finishDate: new Date(base + (k * 14 + 13) * DAY).toISOString(),
    timeFrame: current === null || k < current ? 'past' : k === current ? 'current' : 'future',
  }));
}

export const iterations = (teamId: string): Iteration[] =>
  teamId === 'practice-team'
    ? sprints('Practice project', 2, null)
    : sprints('Sample project', 4, 2);

export const backlogs: BacklogLevel[] = [
  { id: 'Sample.FeatureCategory', name: 'Features', type: 'portfolio', workItemTypes: ['Feature'] },
  {
    id: 'Sample.RequirementCategory',
    name: 'Stories',
    type: 'requirement',
    workItemTypes: ['Story', 'Spike'],
  },
  { id: 'Sample.TaskCategory', name: 'Tasks', type: 'task', workItemTypes: ['Task', 'Bug'] },
];

export const types: WorkItemType[] = [
  { name: 'Bug', color: 'cc293d' },
  { name: 'Feature', color: '773b93' },
  { name: 'Spike', color: 'c56b16' },
  { name: 'Story', color: '009ccc' },
  { name: 'Task', color: 'b38f00' },
];

const proposed = (name: string, color = 'b2b2b2'): State => ({ name, color, category: 'Proposed' });
const active = (name: string, color = '007acc'): State => ({ name, color, category: 'InProgress' });
const done = (name: string, color = '339933'): State => ({ name, color, category: 'Completed' });

export const states: Record<string, State[]> = {
  Bug: [
    proposed('New'),
    active('Active'),
    { name: 'Resolved', color: 'ff9d00', category: 'Resolved' },
    done('Closed'),
  ],
  Feature: [proposed('New'), active('In progress'), done('Done')],
  Spike: [active('Exploring', 'c56b16'), done('Concluded')],
  Story: [
    proposed('New'),
    active('In progress'),
    active('Ready for review', '5688e0'),
    done('Done'),
  ],
  Task: [proposed('Queued'), active('In progress'), done('Done')],
};

const field = (
  referenceName: string,
  name: string,
  type: string,
  extra: Partial<FieldDefinition> = {},
): FieldDefinition => ({
  referenceName,
  name,
  type,
  required: false,
  readOnly: false,
  allowedValues: [],
  defaultValue: null,
  ...extra,
});

const commonFields = [
  field('System.Id', 'ID', 'integer', { readOnly: true }),
  field('System.Title', 'Title', 'string', { required: true }),
  field('System.Description', 'Description', 'html'),
  field('System.State', 'State', 'string', { required: true }),
  field('System.AssignedTo', 'Assigned To', 'identity'),
  field('Microsoft.VSTS.Common.Priority', 'Priority', 'integer', {
    allowedValues: [1, 2, 3, 4],
    defaultValue: 2,
  }),
  field('System.Tags', 'Tags', 'plainText'),
  field('System.AreaPath', 'Area Path', 'treePath', { required: true }),
  field('System.IterationPath', 'Iteration Path', 'treePath', { required: true }),
];
const remainingWork = field('Microsoft.VSTS.Scheduling.RemainingWork', 'Remaining Work', 'double');

export const fields: Record<string, FieldDefinition[]> = {
  Bug: [
    ...commonFields,
    remainingWork,
    field('Custom.FoundIn', 'Found In', 'string', { required: true }),
  ],
  Feature: commonFields,
  Spike: [
    ...commonFields,
    field('Microsoft.VSTS.Scheduling.StoryPoints', 'Story Points', 'double'),
  ],
  Story: [
    ...commonFields,
    field('Microsoft.VSTS.Scheduling.StoryPoints', 'Story Points', 'double'),
  ],
  Task: [...commonFields, remainingWork],
};

const [a, b, c, d] = people;
const web = 'Sample project\\Web';
const sprint = (n: number) => `Sample project\\Sprint ${n}`;
const points = (value: number) => ({
  field: 'Microsoft.VSTS.Scheduling.StoryPoints',
  label: 'Story Points',
  value,
});

function item(
  id: number,
  type: string,
  title: string,
  state: string,
  assignee: Identity | null,
  parentId: number | null,
  extra: Partial<WorkItemSummary> = {},
): WorkItemSummary {
  return {
    id,
    rev: 1,
    type,
    title,
    state,
    assignee,
    tags: [],
    areaPath: web,
    iterationPath: sprint(3),
    parentId,
    priority: 2,
    remainingWork: null,
    estimate: null,
    ...extra,
  };
}

export const items: WorkItemSummary[] = [
  item(1000, 'Feature', 'Improve checkout', 'In progress', a, null, {
    iterationPath: 'Sample project',
  }),
  item(1001, 'Story', 'Make checkout easier', 'In progress', a, 1000, {
    tags: ['experience'],
    estimate: points(5),
  }),
  item(1002, 'Task', 'Simplify the checkout form', 'In progress', a, 1001, { remainingWork: 4 }),
  item(1003, 'Task', 'Cover the checkout flow with tests', 'Queued', b, 1001, {
    tags: ['quality'],
    remainingWork: 3,
  }),
  item(1004, 'Bug', 'Keep the selected delivery option', 'New', null, 1001, {
    priority: 1,
    remainingWork: 2,
  }),
  item(1010, 'Story', 'Show order history', 'In progress', b, null, {
    iterationPath: sprint(2),
    estimate: points(3),
  }),
  item(1011, 'Task', 'Add the order history list', 'In progress', b, 1010, { remainingWork: 5 }),
  item(1012, 'Task', 'Page through older orders', 'Queued', c, 1010, { remainingWork: 3 }),
  item(1020, 'Task', 'Tidy up payment logs', 'Queued', c, 9999, { remainingWork: 1 }),
  item(1030, 'Spike', 'Compare address lookup options', 'Exploring', d, null, {
    estimate: points(2),
  }),
  item(1031, 'Task', 'Summarize lookup findings', 'Queued', d, 1030, { remainingWork: 2 }),
  item(1040, 'Bug', 'Fix the currency label', 'Active', a, null, { priority: 1 }),
  item(1050, 'Task', 'Prepare the release', 'In progress', a, 1001, { iterationPath: sprint(2) }),
  item(1051, 'Task', 'Write the release notes', 'Queued', b, 1050, { remainingWork: 1 }),
  item(1060, 'Task', 'Set up the payment sandbox', 'Done', a, 1010, {
    iterationPath: sprint(2),
    remainingWork: 0,
  }),
  item(1100, 'Story', 'Speed up search', 'New', c, null, {
    areaPath: 'Sample project\\Platform',
    estimate: points(8),
  }),
  item(1101, 'Task', 'Profile the search query', 'Queued', c, 1100, {
    areaPath: 'Sample project\\Platform',
    remainingWork: 6,
  }),
];
