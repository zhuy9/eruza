import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { ArrowUpRight, Circle, Layers3 } from 'lucide-react';
import { FilterBar } from '../components/filter-bar';
import { ListNotices } from '../components/list-notices';
import { matchesFilters, useFilters } from '../lib/filters';
import { workItemsQuery } from '../lib/queries';
import { useScope } from '../lib/scope';

/** Read-only list of the sprint's items. The meeting grid replaces it in M5. */
export function WorkspaceView({ title, description }: { title: string; description: string }) {
  const { project, team, sprint, projects, teams, iterations } = useScope();
  const { values: filters } = useFilters();
  const query = useQuery(
    workItemsQuery(
      project && team && sprint && 'path' in sprint
        ? { projectId: project.id, teamId: team.id, iteration: sprint.path }
        : undefined,
    ),
  );
  const all = query.data?.items ?? [];
  const items = all.filter((item) => matchesFilters(item, filters));
  const error = projects.error ?? teams.error ?? iterations.error ?? query.error;
  return (
    <section className="workspace-view">
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR WORK, IN VIEW</p>
          <h1>{title}</h1>
          <p className="page-description">{description}</p>
        </div>
        <span className="preview-label">
          <Layers3 size={14} />
          Workspace preview
        </span>
      </div>
      <FilterBar tags={[...new Set(all.flatMap((item) => item.tags))]} />
      <div className="list-toolbar">
        <span>
          Work items{' '}
          <span className="count-badge">
            {query.data ? `${items.length}${query.data.incomplete ? '+' : ''}` : '—'}
          </span>
        </span>
        <span className="muted-text">All ticket types</span>
      </div>
      <ListNotices sprint={sprint} error={error} data={query.data} loading={query.isLoading} />
      <div className="preview-list">
        {items.map((item) => (
          <Link
            key={item.id}
            to="."
            search={(prev: Record<string, unknown>) => ({ ...prev, item: item.id })}
            className="preview-row"
          >
            <span className={`type-icon type-${item.type.toLowerCase()}`}>
              <Layers3 size={15} />
            </span>
            <span className="item-number">#{item.id}</span>
            <div className="item-title">
              <h2>{item.title}</h2>
              <span>{item.type}</span>
            </div>
            <span className="state-label">
              <Circle size={9} fill="currentColor" />
              {item.state}
            </span>
            <span className="assignee-label">{item.assignee?.displayName ?? 'Unassigned'}</span>
            <ArrowUpRight size={15} className="row-decoration" aria-hidden="true" />
          </Link>
        ))}
      </div>
      {query.data && items.length === 0 && <p className="empty-state">No work items match.</p>}
    </section>
  );
}

const gridRoute = getRouteApi('/grid');

export function MeetingView() {
  const { grouping } = gridRoute.useSearch();
  return (
    <WorkspaceView
      title={grouping === 'person' ? 'Sprint update' : 'Sprint retro'}
      description={
        grouping === 'person'
          ? 'Make space for every person and their progress.'
          : 'Bring the people and work behind each story together.'
      }
    />
  );
}
