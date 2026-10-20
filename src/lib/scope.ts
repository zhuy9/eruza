import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { iterationsQuery, projectsQuery, teamsQuery } from './queries';
import { chooseSprint } from './sprints';

/** Shared view state kept in the URL across board and grid. */
export type ViewSearch = {
  project?: string;
  team?: string;
  sprint?: string;
  assignee?: string;
  area?: string;
  tags?: string[];
  text?: string;
};

/** The shared view state from any route's search, for links to another view. */
export const keepView = ({ project, team, sprint, assignee, area, tags, text }: ViewSearch) => ({
  project,
  team,
  sprint,
  assignee,
  area,
  tags,
  text,
});

/** Merges changes into the current route's search. */
export function useSetSearch() {
  const navigate = useNavigate();
  return (change: Record<string, unknown>, replace = false) =>
    void navigate({
      to: '.',
      search: (prev: Record<string, unknown>) => ({ ...prev, ...change }),
      replace,
    });
}

const pick = <T extends { id: string; isDefault: boolean }>(list: T[] | undefined, id?: string) =>
  list?.find((item) => item.id === id) ?? list?.find((item) => item.isDefault) ?? list?.[0];

/** Project, team, and sprint from the URL. Invalid or missing choices fall back to defaults. */
export function useScope() {
  const search = useSearch({ from: '__root__' });
  const projects = useQuery(projectsQuery);
  const project = pick(projects.data, search.project);
  const teams = useQuery(teamsQuery(project?.id));
  const team = pick(teams.data, search.team);
  const iterations = useQuery(iterationsQuery(project?.id, team?.id));
  const sprint = iterations.data && chooseSprint(iterations.data, search.sprint);
  return { projects, project, teams, team, iterations, sprint };
}
