import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { BoardsApi, FieldDefinition, FieldValue, State } from '../shared/contracts';
import { createAdoApi } from './ado/api';
import { readConfig } from './config';
import { AppError } from './errors';

/** Every sample item has this tag, so it is easy to find in Azure DevOps. */
export const SAMPLE_TAG = 'eruza-sample';
/** IDs of the created items, kept in ignored storage for `--remove`. */
const IDS_FILE = 'tmp/sample-ids.json';

const PRIORITY = 'Microsoft.VSTS.Common.Priority';
const REMAINING = 'Microsoft.VSTS.Scheduling.RemainingWork';
const ESTIMATES = [
  'Microsoft.VSTS.Scheduling.StoryPoints',
  'Microsoft.VSTS.Scheduling.Effort',
  'Microsoft.VSTS.Scheduling.Size',
];

type Sample = {
  title: string;
  stage: 'Proposed' | 'InProgress' | 'Completed';
  /** Assigned to the signed-in user. Others stay unassigned, so nobody else is notified. */
  mine?: boolean;
  bug?: boolean;
  priority?: number;
  estimate?: number;
  remaining?: number;
  description?: string;
  comment?: string;
  /** Planned for the next sprint instead of the current one. */
  later?: boolean;
  children?: Sample[];
};

const SAMPLES: Sample[] = [
  {
    title: 'Let people save a search',
    stage: 'InProgress',
    mine: true,
    priority: 2,
    estimate: 5,
    description:
      '<p>People repeat the same searches every day.</p><ul><li>Save the current search with a name.</li><li>Show saved searches above the results.</li></ul>',
    comment: '<p>Start with the five most recent searches. We can add more later.</p>',
    children: [
      { title: 'Design the saved search list', stage: 'Completed', mine: true, remaining: 0 },
      {
        title: 'Store saved searches for each user',
        stage: 'InProgress',
        mine: true,
        remaining: 4,
      },
      { title: 'Add a delete button to saved searches', stage: 'Proposed', remaining: 2 },
      { title: 'Search box loses focus after a save', stage: 'Proposed', bug: true, priority: 1 },
    ],
  },
  {
    title: 'Speed up the reports page',
    stage: 'InProgress',
    mine: true,
    priority: 1,
    estimate: 8,
    description:
      '<p>The reports page takes too long to open.</p><p><strong>Goal:</strong> open it in under two seconds.</p>',
    comment: '<p>Paging the table should help the most. Caching can come next.</p>',
    children: [
      { title: 'Measure the slowest report queries', stage: 'Completed', mine: true, remaining: 0 },
      { title: 'Add paging to the reports table', stage: 'InProgress', mine: true, remaining: 6 },
      { title: 'Cache the report totals', stage: 'Proposed', remaining: 5 },
      {
        title: 'Report totals are wrong after a refresh',
        stage: 'InProgress',
        bug: true,
        mine: true,
        priority: 2,
      },
    ],
  },
  {
    title: 'Send a weekly summary email',
    stage: 'Proposed',
    priority: 3,
    estimate: 3,
    description: '<p>Send each person a short summary of their open work every Monday.</p>',
    children: [
      { title: 'Write the summary email template', stage: 'Proposed', mine: true, remaining: 3 },
      { title: 'Schedule the weekly send', stage: 'Proposed', remaining: 2 },
    ],
  },
  {
    title: 'Import contacts from a file',
    stage: 'Completed',
    priority: 2,
    estimate: 2,
    description: '<p>Let people upload a CSV file of contacts.</p>',
    children: [
      { title: 'Read the uploaded file', stage: 'Completed', remaining: 0 },
      { title: 'Show import errors to the user', stage: 'Completed', mine: true, remaining: 0 },
    ],
  },
  {
    title: 'Let people pick a color theme',
    stage: 'Proposed',
    priority: 4,
    estimate: 3,
    later: true,
    description: '<p>Offer a few color themes in the settings page.</p>',
  },
];

const TOTAL = SAMPLES.reduce((n, story) => n + 1 + (story.children?.length ?? 0), 0);

/** Required fields with no default, which made-up samples cannot fill. ADO fills `System.*`. */
const unfillable = (fields: FieldDefinition[]) =>
  fields.filter(
    (f) =>
      f.required &&
      !f.readOnly &&
      f.defaultValue === null &&
      !f.referenceName.startsWith('System.'),
  );

type Options = {
  log: (line: string) => void;
  /** Gets each new ID right away, so even an interrupted run can be removed. */
  onCreated: (id: number) => void;
  /** Sees the target before anything is created. False stops the run. */
  confirm?: (target: string) => Promise<boolean>;
};

/** Creates the samples in the current sprint of the default project's default team. */
export async function seedSamples(api: BoardsApi, { log, onCreated, confirm }: Options) {
  const session = await api.getSession();
  const { user } = session;
  if (!user) {
    const login = session.loginCommand && `Run: ${session.loginCommand}`;
    throw new Error([session.message ?? 'Could not connect to Azure DevOps.', login].join(' '));
  }
  const project = (await api.getProjects()).find((p) => p.isDefault);
  if (!project) throw new Error('Set ADO_DEFAULT_PROJECT to the project to fill.');
  const teams = await api.getTeams(project.id);
  const team = teams.find((t) => t.isDefault) ?? teams[0];
  if (!team) throw new Error('The project has no team.');
  const scope = { projectId: project.id, teamId: team.id };
  const [settings, iterations, backlogs, types] = await Promise.all([
    api.getTeamSettings(scope),
    api.getIterations(scope),
    api.getBacklogs(scope),
    api.getWorkItemTypes(project.id),
  ]);
  const sprint = iterations.find((i) => i.timeFrame === 'current');
  if (!sprint) throw new Error('The default team has no current sprint.');
  const future = iterations.find((i) => i.timeFrame === 'future');
  if (!future) log('There is no future sprint, so every sample goes in the current sprint.');
  const now = sprint.path;
  const later = (future ?? sprint).path;
  const projectId = project.id;
  const me = user.id;
  const storyLevel = backlogs.find((b) => b.type === 'requirement')?.workItemTypes ?? [];
  const storyType = storyLevel.find((type) => type !== 'Bug');
  const taskType = backlogs.find((b) => b.type === 'task')?.workItemTypes[0];
  if (!storyType || !taskType) throw new Error('The project needs story and task backlogs.');

  const kinds = new Map<string, { fields: FieldDefinition[]; states: State[] }>();
  for (const type of new Set([storyType, taskType, 'Bug'])) {
    if (!types.some((t) => t.name === type)) continue;
    const [fields, states] = await Promise.all([
      api.getWorkItemFields(projectId, type),
      api.getWorkItemStates(projectId, type),
    ]);
    kinds.set(type, { fields, states });
  }
  for (const type of [storyType, taskType]) {
    const missing = unfillable(kinds.get(type)!.fields).map((f) => f.name);
    if (missing.length) {
      throw new Error(`${type} requires ${missing.join(', ')}. Nothing was created.`);
    }
  }
  // A bug nests under a story only when the team keeps bugs below the story backlog.
  const bug = kinds.get('Bug');
  const bugType =
    bug && !storyLevel.includes('Bug') && !unfillable(bug.fields).length ? 'Bug' : taskType;
  if (bugType !== 'Bug') log(`Bug samples are created as ${taskType} items.`);
  const target = `${TOTAL} sample items in ${project.name}, ${team.name}, ${sprint.name}`;
  if (!confirm) log(`Creating ${target}.`);
  else if (!(await confirm(target))) throw new Error('Nothing was created.');

  let count = 0;
  async function create(sample: Sample, type: string, parentId?: number) {
    const { fields: defs, states } = kinds.get(type)!;
    const has = (ref: string) => defs.some((f) => f.referenceName === ref);
    const fields: Record<string, FieldValue> = {
      'System.Title': sample.title,
      'System.AreaPath': settings.defaultAreaPath,
      'System.IterationPath': sample.later ? later : now,
      'System.Tags': SAMPLE_TAG,
    };
    if (sample.mine) fields['System.AssignedTo'] = me;
    if (sample.description && has('System.Description')) {
      fields['System.Description'] = sample.description;
    }
    if (sample.priority && has(PRIORITY)) fields[PRIORITY] = sample.priority;
    const estimate = ESTIMATES.find(has);
    if (sample.estimate && estimate) fields[estimate] = sample.estimate;
    if (sample.remaining !== undefined && has(REMAINING)) fields[REMAINING] = sample.remaining;

    let item = await api.createWorkItem({ projectId, type, fields, parentId });
    onCreated(item.id);
    count++;
    const state = states.find((s) => s.category === sample.stage);
    if (state && state.name !== item.state) {
      try {
        item = await api.updateWorkItem(item.id, {
          expectedRev: item.rev,
          fields: { 'System.State': state.name },
        });
      } catch (error) {
        log(`#${item.id} stays ${item.state}: ${message(error)}`);
      }
    }
    if (sample.comment) {
      await api
        .addComment(item.id, { projectId, html: sample.comment })
        .catch((error: unknown) => log(`#${item.id} has no comment: ${message(error)}`));
    }
    log(`#${item.id} ${type} (${item.state}): ${sample.title}`);
    return item;
  }

  for (const story of SAMPLES) {
    const { id } = await create(story, storyType);
    for (const child of story.children ?? []) {
      await create(child, child.bug ? bugType : taskType, id);
    }
  }
  log(`Created ${count} items tagged ${SAMPLE_TAG}.`);
}

/**
 * Moves the samples to the ADO recycle bin, skipping any item without the sample tag.
 * Returns the IDs that could not be removed.
 */
export async function removeSamples(api: BoardsApi, ids: number[], log: (line: string) => void) {
  const left: number[] = [];
  for (const id of ids) {
    try {
      const { item } = await api.getWorkItem(id);
      if (!item.tags.includes(SAMPLE_TAG)) {
        log(`Skipped #${id}: it has no ${SAMPLE_TAG} tag.`);
        continue;
      }
      await api.deleteWorkItem(id);
      log(`Removed #${id}`);
    } catch (error) {
      if (error instanceof AppError && error.body.code === 'NOT_FOUND') {
        log(`#${id} was not found. It was removed already, or this account cannot read it.`);
        continue;
      }
      left.push(id);
      log(`Could not remove #${id}: ${message(error)}`);
    }
  }
  return left;
}

function message(error: unknown) {
  if (!(error instanceof AppError)) return error instanceof Error ? error.message : String(error);
  const fields = Object.keys(error.body.fieldErrors ?? {});
  return fields.length ? `${error.message} (${fields.join(', ')})` : error.message;
}

const savedSchema = z.object({
  organization: z.string(),
  ids: z.array(z.number().int().positive()),
});

function readSaved() {
  if (!existsSync(IDS_FILE)) return null;
  try {
    return savedSchema.parse(JSON.parse(readFileSync(IDS_FILE, 'utf8')));
  } catch {
    throw new Error(`${IDS_FILE} is not a sample list. Remove it to go on.`);
  }
}

async function ask(target: string) {
  if (!process.stdin.isTTY) throw new Error('Add --yes to run without a terminal.');
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question(`Create ${target}? Type yes to go on: `);
  prompt.close();
  return answer.trim().toLowerCase() === 'yes';
}

async function main() {
  const config = readConfig();
  if (config.mock) {
    console.log('Mock mode already has sample data. Set MOCK=0 to fill Azure DevOps.');
    return;
  }
  const api = createAdoApi(config);
  const save = (ids: number[]) => {
    mkdirSync('tmp', { recursive: true });
    writeFileSync(IDS_FILE, JSON.stringify({ organization: config.organization, ids }));
  };
  const saved = readSaved();
  // Work item IDs are unique only within one organization.
  if (saved && saved.organization !== config.organization) {
    throw new Error(`${IDS_FILE} lists samples from another organization. Switch ADO_ORG back.`);
  }
  if (process.argv.includes('--remove')) {
    if (!saved?.ids.length) {
      console.log('No sample IDs are saved, so there is nothing to remove.');
      return;
    }
    const session = await api.getSession();
    if (!session.user) throw new Error(session.message ?? 'Could not connect to Azure DevOps.');
    const left = await removeSamples(api, saved.ids, console.log);
    if (!left.length) return rmSync(IDS_FILE);
    save(left);
    throw new Error(`${left.length} samples were not removed. Run the command again.`);
  }
  if (saved?.ids.length) {
    throw new Error('Samples already exist. Run `npm run seed -- --remove` first.');
  }
  const created: number[] = [];
  save(created); // A file that cannot be written stops the run before anything is created.
  try {
    await seedSamples(api, {
      log: console.log,
      onCreated: (id) => {
        created.push(id);
        save(created);
      },
      confirm: process.argv.includes('--yes') ? undefined : ask,
    });
  } catch (error) {
    if (created.length) {
      console.log(`Created before the error: ${created.map((id) => `#${id}`).join(', ')}.`);
      console.log('Run `npm run seed -- --remove` to remove them.');
    }
    if (error instanceof AppError && error.body.code === 'UNKNOWN_OUTCOME') {
      console.log(`The last request may have worked. Search ADO for the ${SAMPLE_TAG} tag.`);
    }
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(message(error));
    process.exitCode = 1;
  });
}
