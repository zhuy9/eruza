import type { Iteration } from '../../shared/contracts';

export type SprintChoice = { path: string } | { problem: 'none' | 'ambiguous' };

/** The selected sprint if it is valid, else the team's single current sprint. */
export function chooseSprint(iterations: Iteration[], selected?: string): SprintChoice {
  if (selected && iterations.some((i) => i.path === selected)) return { path: selected };
  const current = iterations.filter((i) => i.timeFrame === 'current');
  if (current.length === 1) return { path: current[0].path };
  return { problem: current.length ? 'ambiguous' : 'none' };
}

/** Current and previous sprints, newest first. */
export const sprintOptions = (iterations: Iteration[]) =>
  iterations
    .filter((i) => i.timeFrame !== 'future')
    .toSorted((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));
