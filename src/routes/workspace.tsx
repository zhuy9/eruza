import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { ArrowUpRight, Circle, Layers3 } from 'lucide-react';
import { workItemsQuery } from '../lib/queries';

export function WorkspaceView({ title, description }: { title: string; description: string }) {
  const query = useQuery(workItemsQuery);
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
          Work items <span className="count-badge">{query.data?.items.length ?? '—'}</span>
        </span>
        <span className="muted-text">All ticket types</span>
      </div>
      {query.isPending && (
        <p role="status" className="empty-state">
          Loading work items…
        </p>
      )}
      {query.isError && (
        <p role="alert" className="empty-state">
          Could not load work items. Refresh to try again.
        </p>
      )}
      <div className="preview-list">
        {query.data?.items.map((item) => (
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
      <p className="workspace-note">
        A clear space for the work that matters. Sample data stays on this device.
      </p>
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
