import { describe, expect, it } from 'vitest';
import type { Iteration } from '../shared/contracts';
import { chooseSprint, sprintOptions } from '../src/lib/sprints';

const sprint = (n: number, timeFrame: Iteration['timeFrame']): Iteration => ({
  id: `s${n}`,
  name: `Sprint ${n}`,
  path: `Sample/Sprint ${n}`,
  startDate: `2030-0${n}-01T00:00:00Z`,
  finishDate: `2030-0${n}-14T00:00:00Z`,
  timeFrame,
});

describe('sprint selection', () => {
  const normal = [sprint(1, 'past'), sprint(2, 'past'), sprint(3, 'current'), sprint(4, 'future')];

  it('defaults to the current sprint', () => {
    expect(chooseSprint(normal)).toEqual({ path: 'Sample/Sprint 3' });
  });

  it('keeps a previous sprint the user selected', () => {
    expect(chooseSprint(normal, 'Sample/Sprint 1')).toEqual({ path: 'Sample/Sprint 1' });
  });

  it('ignores a selection from another team and falls back to current', () => {
    expect(chooseSprint(normal, 'Other/Sprint 9')).toEqual({ path: 'Sample/Sprint 3' });
  });

  it('reports when no sprint is current', () => {
    expect(chooseSprint([sprint(1, 'past')])).toEqual({ problem: 'none' });
    expect(chooseSprint([])).toEqual({ problem: 'none' });
  });

  it('asks the user to choose when sprints overlap', () => {
    expect(chooseSprint([sprint(1, 'current'), sprint(2, 'current')])).toEqual({
      problem: 'ambiguous',
    });
  });

  it('offers current and previous sprints, newest first', () => {
    expect(sprintOptions(normal).map((s) => s.name)).toEqual(['Sprint 3', 'Sprint 2', 'Sprint 1']);
  });
});
