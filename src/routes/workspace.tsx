import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { ArrowUpRight, Circle, Layers3 } from 'lucide-react';
import { workItemsQuery } from '../lib/queries';
import { useScope } from '../lib/scope';

const SPRINT_PROBLEMS = {
  none: 'This team has no current sprint. Choose a sprint above.',
  ambiguous: 'More than one sprint is current. Choose a sprint above.',
};

export function WorkspaceView({ title, description }: { title: string; description: string }) {
  const { project, team, sprint, projects, teams, iterations } = useScope();
  const query = useQuery(
    workItemsQuery(
      project && team && sprint && 'path' in sprint
        ? { projectId: project.id, teamId: team.id, iteration: sprint.path }
        : undefined,
    ),
  );
  const error = projects.error ?? teams.error ?? iterations.error ?? query.error;
  const data = query.data;
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
      <div className="list-toolbar">
        <span>
          Work items{' '}
          <span className="count-badge">
            {data ? `${data.items.length}${data.incomplete ? '+' : ''}` : '—'}
          </span>
        </span>
        <span className="muted-text">All ticket types</span>
      </div>
      {sprint && 'problem' in sprint && (
        <p role="status" className="notice">
          {SPRINT_PROBLEMS[sprint.problem]}
        </p>
      )}
      {error && (
        <p role="alert" className="notice notice-error">
          {error.message}
        </p>
      )}
      {data?.incomplete && (
        <p role="status" className="notice">
          This sprint has more items than Eruza can load at once. Only the first {data.items.length}{' '}
          are shown, so counts are incomplete.
        </p>
      )}
      {data && data.missingIds.length > 0 && (
        <p role="status" className="notice">
          {data.missingIds.length} linked item{data.missingIds.length === 1 ? '' : 's'} could not be
          read. They may be deleted or outside your permissions.
        </p>
      )}
      {query.isLoading && (
        <p role="status" className="empty-state">
          Loading work items…
        </p>
      )}
      <div className="preview-list">
        {data?.items.map((item) => (
          <article key={item.id} className="preview-row">
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
          </article>
        ))}
      </div>
      {data?.items.length === 0 && <p className="empty-state">No work items in this sprint.</p>}
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
