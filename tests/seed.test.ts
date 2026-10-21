import { describe, expect, it } from 'vitest';
import type { BoardsApi } from '../shared/contracts';
import { createMockApi } from '../server/mock/api';
import { removeSamples, SAMPLE_TAG, seedSamples } from '../server/seed';

const quiet = () => {};

describe('sample seeding', () => {
  it('fills the current sprint with tagged stories and children, then removes them', async () => {
    const api = createMockApi();
    const created: number[] = [];
    let target = '';
    const confirm = async (shown: string) => ((target = shown), true);
    await seedSamples(api, { log: quiet, onCreated: (id) => created.push(id), confirm });
    const items = await Promise.all(created.map(async (id) => (await api.getWorkItem(id)).item));

    expect(target).toBe('17 sample items in Sample project, Web team, Sprint 3');
    expect(created).toHaveLength(17);
    expect(items.every((item) => item.tags.includes(SAMPLE_TAG))).toBe(true);
    // Only the signed-in user is assigned, so nobody else gets an assignment notice.
    expect(new Set(items.map((item) => item.assignee?.id ?? null))).toEqual(
      new Set(['person-a', null]),
    );
    const stories = items.filter((item) => item.type === 'Story');
    expect(stories).toHaveLength(5);
    expect(items.filter((item) => item.type !== 'Story').every((item) => item.parentId)).toBe(true);
    expect(new Set(items.map((item) => item.state))).toEqual(
      new Set(['New', 'In progress', 'Done', 'Queued']),
    );
    const sprint = items.filter((item) => item.iterationPath === 'Sample project\\Sprint 3');
    expect(sprint).toHaveLength(16);
    // The mock Bug type needs Found In, which a sample cannot know, so bugs become tasks.
    expect(items.some((item) => item.type === 'Bug')).toBe(false);
    expect((await api.getComments(stories[0].id, 'sample-project')).comments).toHaveLength(1);

    // An item without the sample tag is never removed.
    const lines: string[] = [];
    expect(await removeSamples(api, [...created, 1001], (line) => lines.push(line))).toEqual([]);
    expect(lines.filter((line) => line.startsWith('Removed'))).toHaveLength(17);
    expect(lines.at(-1)).toBe('Skipped #1001: it has no eruza-sample tag.');
    expect((await api.getWorkItem(1001)).item.id).toBe(1001);
    for (const id of created) {
      await expect(api.getWorkItem(id)).rejects.toMatchObject({ body: { code: 'NOT_FOUND' } });
    }
    await removeSamples(api, created.slice(0, 1), (line) => lines.push(line));
    expect(lines.at(-1)).toMatch(/^#\d+ was not found\./);
  });

  it('nests real bugs under stories when Bug needs no extra fields', async () => {
    const mock = createMockApi();
    // A process where Found In has a default, which ADO would fill in on create.
    const api: BoardsApi = {
      ...mock,
      getWorkItemFields: async (projectId, type) =>
        (await mock.getWorkItemFields(projectId, type)).map((f) =>
          f.referenceName === 'Custom.FoundIn' ? { ...f, defaultValue: 'Release 3' } : f,
        ),
      createWorkItem: (input) =>
        mock.createWorkItem(
          input.type === 'Bug'
            ? { ...input, fields: { ...input.fields, 'Custom.FoundIn': 'Release 3' } }
            : input,
        ),
    };
    const created: number[] = [];
    await seedSamples(api, { log: quiet, onCreated: (id) => created.push(id) });
    const items = await Promise.all(created.map(async (id) => (await api.getWorkItem(id)).item));
    const bugs = items.filter((item) => item.type === 'Bug');
    expect(bugs).toHaveLength(2);
    expect(bugs.every((bug) => items.some((item) => item.id === bug.parentId))).toBe(true);
  });

  it('creates nothing when a type needs a field it cannot fill or the target is declined', async () => {
    const mock = createMockApi();
    const created: number[] = [];
    const onCreated = (id: number) => created.push(id);
    const strict: BoardsApi = {
      ...mock,
      getWorkItemFields: async (projectId, type) => [
        ...(await mock.getWorkItemFields(projectId, type)),
        {
          referenceName: 'Custom.Customer',
          name: 'Customer',
          type: 'string',
          required: type === 'Story',
          readOnly: false,
          allowedValues: [],
          defaultValue: null,
        },
      ],
    };
    await expect(seedSamples(strict, { log: quiet, onCreated })).rejects.toThrow(
      'Story requires Customer. Nothing was created.',
    );
    const confirm = async () => false;
    await expect(seedSamples(mock, { log: quiet, onCreated, confirm })).rejects.toThrow(
      'Nothing was created.',
    );
    expect(created).toEqual([]);
  });
});
