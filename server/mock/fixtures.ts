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
import type { RawComment } from '../ado/comments';

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
    field('Microsoft.VSTS.Common.ResolvedReason', 'Resolved Reason', 'string', {
      allowedValues: ['Fixed', 'As designed', 'Cannot reproduce'],
    }),
  ],
  Feature: [
    ...commonFields,
    field('Custom.Owner', 'Owner', 'identity', { required: true }),
    field('Custom.Reviewer', 'Reviewer', 'identity'),
  ],
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
  ...largeSprint(),
];

/**
 * A large past sprint (Sprint 1) for grid and speed checks: 60 stories with 17 tickets each,
 * plus the 50 stories inside the sprint. Every sixth story is outside the sprint. In each
 * story, one ticket has an intermediate parent and one has no parent or an unreadable one.
 */
function largeSprint(): WorkItemSummary[] {
  const crowd = [a, b, c, d, null];
  const out: WorkItemSummary[] = [];
  for (let s = 0; s < 60; s++) {
    const storyId = 2000 + s * 20;
    const spike = s % 10 === 9;
    out.push(
      item(
        storyId,
        spike ? 'Spike' : 'Story',
        `Bulk sample story ${s + 1}`,
        spike ? 'Exploring' : 'In progress',
        crowd[s % 5],
        null,
        {
          iterationPath: s % 6 === 5 ? 'Sample project' : sprint(1),
          estimate: points((s % 5) + 1),
        },
      ),
    );
    for (let t = 1; t <= 17; t++) {
      const id = storyId + t;
      const bug = t % 4 === 0;
      const parent = t === 17 ? (s % 2 ? null : 99998) : t === 16 ? storyId + 1 : storyId;
      out.push(
        item(
          id,
          bug ? 'Bug' : 'Task',
          `Bulk sample ticket ${id}`,
          (bug ? ['New', 'Active', 'Closed'] : ['Queued', 'In progress', 'Done'])[t % 3],
          crowd[(s + t) % 5],
          parent,
          {
            iterationPath: sprint(1),
            areaPath: t % 7 === 0 ? `${web}\\Checkout` : web,
            tags: t % 6 === 0 ? ['bulk'] : [],
            priority: (t % 4) + 1,
            remainingWork: t % 3 ? t % 5 : null,
          },
        ),
      );
    }
  }
  return out;
}

/** Field values not in the summary, by item ID. */
export const extraFields: Record<number, Record<string, string | Identity>> = {
  1000: { 'Custom.Owner': d },
  1004: { 'Custom.FoundIn': 'Release 2' },
  1040: { 'Custom.FoundIn': 'Release 1' },
  ...Object.fromEntries(
    items
      .filter((i) => i.id >= 2000 && i.type === 'Bug')
      .map((i) => [i.id, { 'Custom.FoundIn': 'Release 1' }]),
  ),
};

export const IMAGE_ID = '0b5c3a52-1d43-4c4e-9a43-6a2c1f1e7d10';

/** Descriptions cover supported formatting, unsupported styling, and hostile markup. */
export const descriptions: Record<number, string> = {
  1001: [
    '<p>Shoppers should finish checkout in <strong>three steps</strong> or fewer.</p>',
    '<ul><li>Keep the cart visible</li><li>Remember the <em>delivery</em> choice</li></ul>',
    '<table><tbody><tr><th>Step</th><th>Goal</th></tr><tr><td>Cart</td><td>Review items</td></tr></tbody></table>',
    '<p>See the <a href="https://example.com/checkout-notes">checkout notes</a>.</p>',
    `<p><img src="/api/work-items/1001/images/${IMAGE_ID}?fileName=flow.png" alt="Checkout flow"></p>`,
  ].join(''),
  1002: '<p>Use the <span style="color: #c0392b">red</span> error style from the design notes.</p>',
  1003: [
    '<p>Steps to check.</p>',
    '<img src="x" onerror="alert(1)"><script>alert(2)</script>',
    '<p><a href="javascript:alert(3)">Run</a> or read the <a href="https://example.com/test-plan">test plan</a>.</p>',
  ].join(''),
};

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

/**
 * Comments by item ID, newest first, in ADO's raw shape. 1001 spans several pages and mixes
 * HTML with rendered Markdown. 1003 covers a mention, unrendered Markdown, and hostile markup.
 */
export const comments: Record<number, RawComment[]> = {
  1001: Array.from({ length: 23 }, (_, k) => {
    const n = 23 - k;
    const base = { id: 500 + n, createdBy: people[n % 3], createdDate: minutesAgo((24 - n) * 90) };
    return n % 5
      ? { ...base, text: `<p>Sample comment ${n}.</p>` }
      : {
          ...base,
          text: `**Sample comment ${n}** in Markdown.`,
          renderedText: `<p><strong>Sample comment ${n}</strong> in Markdown.</p>`,
        };
  }),
  1003: [
    {
      id: 603,
      createdBy: people[0],
      createdDate: minutesAgo(30),
      text: '<p>Thanks <a href="#" data-vss-mention="version:2.0,person-b">@Person B</a>, the steps work.</p>',
    },
    {
      id: 602,
      createdBy: people[2],
      createdDate: minutesAgo(60),
      text: 'Plain *Markdown* note<script>alert(4)</script>',
    },
    {
      id: 601,
      createdBy: people[1],
      createdDate: minutesAgo(90),
      text: '<p>Try <a href="javascript:alert(5)">this</a><img src="x" onerror="alert(6)"><script>alert(7)</script> or the <a href="https://example.com/notes">notes</a>.</p>',
    },
  ],
};
