import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useSearch } from '@tanstack/react-router';
import type { TeamSettings, WorkItemSummary } from '../../shared/contracts';
import { areasQuery, membersQuery, teamSettingsQuery } from './queries';
import { useScope } from './scope';

/** Assignee filter value for items with no assignee. */
export const UNASSIGNED = '@none';

export type Filters = { assignee?: string; area?: string; tags?: string[]; text?: string };

const under = (path: string, root: string) => path === root || path.startsWith(`${root}\\`);

/** Optional filters. Area includes subareas; every selected tag must match; text is an ID or part of a title. */
export function matchesFilters(item: WorkItemSummary, filters: Filters) {
  const { assignee, area, tags, text } = filters;
  if (assignee && (assignee === UNASSIGNED ? item.assignee : item.assignee?.id !== assignee)) {
    return false;
  }
  if (area && !under(item.areaPath, area)) return false;
  const itemTags = item.tags.map((tag) => tag.toLowerCase());
  if (tags?.some((tag) => !itemTags.includes(tag.toLowerCase()))) return false;
  const query = text?.trim().toLowerCase();
  return !query || String(item.id) === query || item.title.toLowerCase().includes(query);
}

/** The team's areas, plus subareas of the areas set to include them. */
export const teamAreas = (paths: string[], settings: TeamSettings) =>
  paths.filter((path) =>
    settings.areas.some((a) => path === a.path || (a.includeChildren && under(path, a.path))),
  );

/** Filters from the URL. Only loaded metadata can rule out a requested value. */
export function useFilters() {
  const search = useSearch({ from: '__root__' });
  const { project, team } = useScope();
  const members = useQuery(membersQuery(project?.id, team?.id));
  const settings = useQuery(teamSettingsQuery(project?.id, team?.id));
  const areas = useQuery(areasQuery(project?.id));
  const areaOptions = settings.data && areas.data ? teamAreas(areas.data, settings.data) : [];
  const assigneeValid =
    !members.data ||
    search.assignee === UNASSIGNED ||
    members.data.some((m) => m.id === search.assignee);
  const assignee = assigneeValid ? search.assignee : undefined;
  const area =
    !settings.data || !areas.data || (search.area && areaOptions.includes(search.area))
      ? search.area
      : undefined;
  // Stable between renders, so views can memoize work that depends on the filters.
  const values = useMemo<Filters>(
    () => ({ assignee, area, tags: search.tags, text: search.text }),
    [assignee, area, search.tags, search.text],
  );
  // A failed read cannot rule out a value, so the filter bar says which filters went unchecked.
  const problems: string[] = [];
  if (!members.data && members.error) {
    problems.push('Team members could not load. Assignee filters are kept but not checked.');
  }
  if ((!settings.data && settings.error) || (!areas.data && areas.error)) {
    problems.push('Team areas could not load. Area filters are kept but not checked.');
  }
  return { values, members: members.data ?? [], areaOptions, problems };
}
