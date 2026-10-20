import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDndMonitor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearch } from '@tanstack/react-router';
import { Layers3, Plus } from 'lucide-react';
import { useState } from 'react';
import type { State, WorkItemSummary } from '../../../shared/contracts';
import { FilterBar } from '../../components/filter-bar';
import { ListNotices } from '../../components/list-notices';
import { Avatar } from '../../components/ui/avatar';
import { Button } from '../../components/ui/button';
import { apiError } from '../../lib/api';
import { matchesFilters, useFilters } from '../../lib/filters';
import { backlogsQuery, statesQuery, typesQuery, workItemsQuery } from '../../lib/queries';
import { dropSave, useMovingStates, useSaveFields } from '../../lib/saves';
import { useScope, useSetSearch } from '../../lib/scope';
import { useToast } from '../../lib/toast';
import { useCreate } from '../work-items/create';

/** Stable card order: priority first (missing last), then ID. */
const byPriority = (a: WorkItemSummary, b: WorkItemSummary) =>
  (a.priority ?? Infinity) - (b.priority ?? Infinity) || a.id - b.id;

export function BoardView() {
  const { project, team, sprint, projects, teams, iterations } = useScope();
  const { values: filters } = useFilters();
  const search = useSearch({ from: '/board' });
  const setSearch = useSetSearch();
  const types = useQuery(typesQuery(project?.id));
  const backlogs = useQuery(backlogsQuery(project?.id, team?.id));
  const requirementType = backlogs.data?.find((b) => b.type === 'requirement')?.workItemTypes[0];
  const type = types.data?.some((t) => t.name === search.type)
    ? search.type
    : backlogs.isPending
      ? undefined
      : (requirementType ?? types.data?.[0]?.name);
  const states = useQuery(statesQuery(project?.id, type));
  const list = useQuery(
    workItemsQuery(
      project && team && type && sprint && 'path' in sprint
        ? { projectId: project.id, teamId: team.id, iteration: sprint.path, type }
        : undefined,
    ),
  );
  const moving = useMovingStates();
  const [dragging, setDragging] = useState<WorkItemSummary | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const all = list.data?.items ?? [];
  const items = all
    .filter((item) => matchesFilters(item, filters))
    .map((item) => (moving.has(item.id) ? { ...item, state: moving.get(item.id)! } : item))
    .toSorted(byPriority);
  const known = new Set(states.data?.map((s) => s.name));
  const elsewhere = items.filter((item) => !known.has(item.state)).length;
  const color = types.data?.find((t) => t.name === type)?.color ?? '8a94a6';
  const error =
    projects.error ?? teams.error ?? iterations.error ?? types.error ?? states.error ?? list.error;

  return (
    <section className="workspace-view">
      <div className="page-heading">
        <div>
          <p className="eyebrow">STATE BOARD</p>
          <h1>Board</h1>
        </div>
        <label className="inline-control">
          Type
          <select
            className="select"
            value={type ?? ''}
            onChange={(e) => setSearch({ type: e.target.value })}
          >
            {types.data?.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <FilterBar tags={[...new Set(all.flatMap((item) => item.tags))]} />
      <ListNotices sprint={sprint} error={error} data={list.data} loading={list.isLoading} />
      {elsewhere > 0 && (
        <p role="status" className="notice">
          {elsewhere} item{elsewhere === 1 ? ' is' : 's are'} in a state that is not on this board.
        </p>
      )}
      <p className="muted-text board-hint">
        Drag a card to change its state, or open it and choose a state.
      </p>
      <DndContext
        sensors={sensors}
        onDragStart={({ active }) => setDragging(items.find((i) => i.id === active.id) ?? null)}
        onDragEnd={() => setDragging(null)}
        onDragCancel={() => setDragging(null)}
      >
        <div className="board">
          {states.data?.map((state) => (
            <Column
              key={state.name}
              state={state}
              type={type!}
              color={color}
              items={items.filter((item) => item.state === state.name)}
            />
          ))}
        </div>
        <DragOverlay>
          {dragging && (
            <div
              className="board-card overlay"
              style={{ borderLeftColor: `#${color}` }}
              aria-hidden="true"
              inert
            >
              <CardBody item={dragging} color={color} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </section>
  );
}

function Column(props: { state: State; type: string; color: string; items: WorkItemSummary[] }) {
  const { state, type, items } = props;
  const { setNodeRef, isOver } = useDroppable({ id: state.name });
  const openCreate = useCreate();
  return (
    <section
      ref={setNodeRef}
      className={isOver ? 'board-column over' : 'board-column'}
      aria-label={`${state.name}, ${items.length} items`}
    >
      <header className="column-header">
        <span className="state-dot" style={{ background: `#${state.color}` }} />
        <h2>{state.name}</h2>
        <span className="count-badge">{items.length}</span>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`New ${type} in ${state.name}`}
          onClick={() => openCreate({ type, state: state.name })}
        >
          <Plus size={15} />
        </Button>
      </header>
      <div className="column-cards">
        {items.map((item) => (
          <Card key={item.id} item={item} color={props.color} />
        ))}
      </div>
    </section>
  );
}

function Card({ item, color }: { item: WorkItemSummary; color: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: item.id });
  const save = useSaveFields(item.id, (error, failed) => {
    const problem = apiError(error);
    const target = failed.fields['System.State'];
    if (problem.code === 'VALIDATION' && problem.fieldErrors) {
      // Keep the draft: the item's panel offers "Save together" with the missing fields.
      toast(`#${item.id} needs more fields to move to ${target}. Open it to finish the move.`);
      return;
    }
    dropSave(queryClient, item.id, failed);
    toast(
      problem.code === 'CONFLICT'
        ? `#${item.id} changed elsewhere, so the board was refreshed. Check it and move it again.`
        : `Could not move #${item.id} to ${target}. ${problem.message}`,
    );
  });
  useDndMonitor({
    onDragEnd: ({ active, over }) => {
      if (active.id !== item.id || !over || over.id === item.state) return;
      save.mutate({ fields: { 'System.State': String(over.id) }, baseRev: item.rev });
    },
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      className={isDragging ? 'board-card placeholder' : 'board-card'}
      style={{ borderLeftColor: `#${color}` }}
    >
      <CardBody item={item} color={color} />
    </div>
  );
}

function CardBody({ item, color }: { item: WorkItemSummary; color: string }) {
  return (
    <>
      <div className="card-top">
        <Layers3 size={14} color={`#${color}`} role="img" aria-label={item.type} />
        <span className="item-number">#{item.id}</span>
        <span className="muted-text">{item.type}</span>
        {item.priority !== null && <span className="priority">P{item.priority}</span>}
      </div>
      <Link
        to="."
        search={(prev: Record<string, unknown>) => ({ ...prev, item: item.id })}
        className="card-title"
      >
        {item.title}
      </Link>
      <div className="card-bottom">
        <div className="card-tags">
          {item.tags.map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </div>
        <span title={item.assignee?.displayName ?? 'Unassigned'}>
          <Avatar identity={item.assignee} />
          <span className="sr-only">{item.assignee?.displayName ?? 'Unassigned'}</span>
        </span>
      </div>
    </>
  );
}
