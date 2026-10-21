import {
  DndContext,
  DragOverlay,
  type Active,
  type Over,
  PointerSensor,
  useDndMonitor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import * as Popover from '@radix-ui/react-popover';
import { useMutationState, useQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import {
  columnGroupingFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createGroupedRowModel,
  createSortedRowModel,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ReactTable,
  type Row,
  type SortFn,
} from '@tanstack/react-table';
import { defaultRangeExtractor, useVirtualizer, type Range } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { z } from 'zod';
import type { Identity, Iteration, WorkItemSummary } from '../../../shared/contracts';
import { FilterBar } from '../../components/filter-bar';
import { ListNotices } from '../../components/list-notices';
import { Button } from '../../components/ui/button';
import { apiError } from '../../lib/api';
import { useFilters } from '../../lib/filters';
import {
  backlogsQuery,
  fieldsQuery,
  sessionQuery,
  statesQuery,
  workItemsQuery,
} from '../../lib/queries';
import {
  usePendingChanges,
  useQuickSave,
  useSetParent,
  withPending,
  type ParentChange,
} from '../../lib/saves';
import { useScope } from '../../lib/scope';
import { useToast } from '../../lib/toast';
import { AssigneePicker } from '../work-items/pickers';
import {
  gridRows,
  NO_STORY,
  remainingTotal,
  UNAVAILABLE_STORY,
  type GridRow,
  type Grouping,
} from './grouping';
import { NativeSelect } from '../../components/ui/native-select';
import { WithTooltip } from '../../components/ui/tooltip';

const ROW_HEIGHT = 40;
const PRIORITY = 'Microsoft.VSTS.Common.Priority';
const PREFS_KEY = 'eruza-grid-columns';
const MIN_WIDTH = 60;
const MAX_WIDTH = 800;
const RESIZE_STEP = 20;

const features = tableFeatures({
  columnGroupingFeature,
  groupedRowModel: createGroupedRowModel(),
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  columnSizingFeature,
  columnResizingFeature,
  columnVisibilityFeature,
});
type GridTable = ReactTable<typeof features, GridRow>;
type GridTableRow = Row<typeof features, GridRow>;

// Group rows have no values, so with sortUndefined 'last' they keep their group order.
// Number columns use the built-in comparator; text uses the reader's locale.
const byText: SortFn<typeof features, GridRow> = (a, b, id) =>
  String(a.getValue(id)).localeCompare(String(b.getValue(id)));
const helper = createColumnHelper<typeof features, GridRow>();
const columns = helper.columns([
  helper.accessor('person', { header: 'Person' }),
  helper.accessor('story', { header: 'Story' }),
  helper.accessor('id', { header: 'ID', size: 90, enableHiding: false }),
  helper.accessor('title', { header: 'Title', size: 280, sortFn: byText, enableHiding: false }),
  helper.accessor('type', { header: 'Type', size: 80, sortFn: byText }),
  helper.accessor('state', { header: 'State', size: 140, sortFn: byText }),
  helper.accessor((row) => row.assignee?.displayName, {
    id: 'assignee',
    header: 'Assignee',
    size: 160,
    sortFn: byText,
  }),
  helper.accessor('iterationPath', { header: 'Iteration', size: 110, sortFn: byText }),
  helper.accessor((row) => row.priority ?? undefined, {
    id: 'priority',
    header: 'Priority',
    size: 80,
  }),
  helper.accessor((row) => row.remainingWork ?? undefined, {
    id: 'remainingWork',
    header: 'Remaining work',
    size: 110,
  }),
  helper.accessor((row) => row.estimate?.value, {
    id: 'estimate',
    header: 'Estimate',
    size: 90,
  }),
]);

const prefsSchema = z.object({
  sorting: z.array(z.object({ id: z.string(), desc: z.boolean() })).catch([]),
  columnSizing: z.record(z.string(), z.number()).catch({}),
  columnVisibility: z.record(z.string(), z.boolean()).catch({}),
});

/** Column choices kept across views and reloads. Only UI preferences are stored. */
function loadPrefs() {
  try {
    return prefsSchema.parse(JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}'));
  } catch {
    return prefsSchema.parse({});
  }
}

const formatNumber = (value: number) =>
  value.toLocaleString(undefined, { maximumFractionDigits: 2 });
const leavesOf = (row: GridTableRow) =>
  row
    .getLeafRows()
    .filter((leaf) => !leaf.getIsGrouped())
    .map((leaf) => leaf.original);

const gridRoute = getRouteApi('/grid');

/** Meeting grid: sprint tickets grouped by person and story, in either order. */
export function MeetingGrid() {
  const { grouping } = gridRoute.useSearch();
  const { project, team, sprint, projects, teams, iterations } = useScope();
  const { values: filters, members } = useFilters();
  const session = useQuery(sessionQuery);
  const backlogs = useQuery(backlogsQuery(project?.id, team?.id));
  const sprintPath = sprint && 'path' in sprint ? sprint.path : undefined;
  const list = useQuery(
    workItemsQuery(
      project && team && sprintPath
        ? { projectId: project.id, teamId: team.id, iteration: sprintPath }
        : undefined,
    ),
  );
  const pending = usePendingChanges();
  // Parents chosen here, so a moved row keeps its story label until the list refetches.
  const chosenParents = useMutationState({
    filters: { mutationKey: ['parent'] },
    select: (m) => (m.state.variables as ParentChange | undefined)?.parent,
  });
  const me = session.data?.user;
  const storyTypes = useMemo(
    () =>
      new Set(
        backlogs.data?.filter((b) => b.type === 'requirement').flatMap((b) => b.workItemTypes),
      ),
    [backlogs.data],
  );

  const { rows, byId, tags } = useMemo(() => {
    const people = [...members, ...(me ? [me] : [])];
    const all = (list.data?.items ?? []).map((item) => withPending(item, pending, people));
    // An iteration edit moves the ticket out of this sprint right away. It can still
    // label the group of its children that stay.
    const items = all.filter((item) => item.iterationPath === sprintPath);
    const byId = new Map(
      [
        ...chosenParents.filter((p) => p !== undefined),
        ...(list.data?.ancestors ?? []),
        ...all,
      ].map((item) => [item.id, item]),
    );
    return {
      rows: gridRows(items, byId, filters, storyTypes, grouping),
      byId,
      tags: [...new Set(items.flatMap((item) => item.tags))],
    };
  }, [list.data, pending, members, me, sprintPath, chosenParents, filters, storyTypes, grouping]);

  const [initialState] = useState(loadPrefs);
  const table = useTable({
    features,
    columns,
    data: rows,
    getRowId: (row) => String(row.id),
    initialState,
    state: { grouping: grouping === 'person' ? ['person', 'story'] : ['story', 'person'] },
    groupedColumnMode: 'remove',
    columnResizeMode: 'onChange',
    sortDescFirst: false,
    defaultColumn: { sortUndefined: 'last', minSize: MIN_WIDTH, maxSize: MAX_WIDTH },
  });
  const { sorting, columnSizing, columnVisibility } = table.state;
  useEffect(
    () =>
      localStorage.setItem(PREFS_KEY, JSON.stringify({ sorting, columnSizing, columnVisibility })),
    [sorting, columnSizing, columnVisibility],
  );

  const [collapsed, setCollapsed] = useState(() => new Set<string>());
  const model = table.getRowModel();
  const shown = useMemo(() => {
    const out: GridTableRow[] = [];
    const add = (list: GridTableRow[]) => {
      for (const row of list) {
        out.push(row);
        if (!collapsed.has(row.id)) add(row.subRows);
      }
    };
    add(model.rows);
    return out;
  }, [model, collapsed]);

  const estimateLabels = new Set(rows.flatMap((row) => (row.estimate ? [row.estimate.label] : [])));
  const estimateLabel = estimateLabels.size === 1 ? [...estimateLabels][0] : undefined;
  const total = remainingTotal(rows);
  const noStoryLevel = !!backlogs.data && storyTypes.size === 0;
  const error =
    projects.error ?? teams.error ?? iterations.error ?? backlogs.error ?? list.error ?? null;

  return (
    <section className="workspace-view">
      <div className="page-heading">
        <div>
          <p className="eyebrow">SPRINT MEETING</p>
          <h1>{grouping === 'person' ? 'Sprint update' : 'Sprint retro'}</h1>
          <p className="page-description">
            {grouping === 'person'
              ? 'Each person, their stories, and their tickets.'
              : 'Each story, the people on it, and their tickets.'}
          </p>
        </div>
      </div>
      <FilterBar tags={tags} />
      <ListNotices sprint={sprint} error={error} data={list.data} loading={list.isLoading} />
      {noStoryLevel && (
        <p role="alert" className="notice notice-error">
          This team&apos;s backlog settings name no story level, so tickets cannot be grouped by
          story.
        </p>
      )}
      {list.data && backlogs.data && !noStoryLevel && (
        <>
          <div className="list-toolbar">
            <span>
              Tickets{' '}
              <span className="count-badge">
                {rows.length}
                {list.data.incomplete ? '+' : ''}
              </span>
              {total !== null && (
                <span className="muted-text"> · Remaining work {formatNumber(total)}</span>
              )}
              <span className="muted-text">
                {' '}
                · Counts and totals cover the tickets shown, not every child of a story.
              </span>
            </span>
            <span className="grid-actions">
              <Button variant="ghost" size="sm" onClick={() => setCollapsed(new Set())}>
                Expand all
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setCollapsed(
                    new Set(model.flatRows.filter((r) => r.getIsGrouped()).map((r) => r.id)),
                  )
                }
              >
                Collapse all
              </Button>
              <ColumnMenu table={table} />
            </span>
          </div>
          {rows.length === 0 ? (
            <p className="empty-state">No work items match.</p>
          ) : (
            <GridBody
              table={table}
              rows={shown}
              byId={byId}
              grouping={grouping}
              collapsed={collapsed}
              onToggle={(id) =>
                setCollapsed((old) => {
                  const next = new Set(old);
                  if (!next.delete(id)) next.add(id);
                  return next;
                })
              }
              context={{
                projectId: project!.id,
                sprintPath: sprintPath!,
                iterations: iterations.data ?? [],
                members,
                me,
                estimateLabel,
              }}
            />
          )}
        </>
      )}
    </section>
  );
}

function ColumnMenu({ table }: { table: GridTable }) {
  return (
    <Popover.Root>
      <Popover.Trigger className="picker-trigger">Columns</Popover.Trigger>
      <Popover.Content className="popover tag-popover" align="end" sideOffset={4}>
        {table
          .getAllLeafColumns()
          .filter((column) => column.getCanHide())
          .map((column) => (
            <label key={column.id} className="check-row">
              <input
                type="checkbox"
                checked={column.getIsVisible()}
                onChange={column.getToggleVisibilityHandler()}
              />
              {String(column.columnDef.header)}
            </label>
          ))}
      </Popover.Content>
    </Popover.Root>
  );
}

type RowContext = {
  projectId: string;
  sprintPath: string;
  iterations: Iteration[];
  members: Identity[];
  me?: Identity;
  /** The estimate field's label when every ticket uses the same one. */
  estimateLabel?: string;
};

function GridBody(props: {
  table: GridTable;
  rows: GridTableRow[];
  byId: Map<number, WorkItemSummary>;
  grouping: Grouping;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  context: RowContext;
}) {
  const { table, rows, context } = props;
  const scroller = useRef<HTMLDivElement>(null);
  const [focusedRow, setFocusedRow] = useState<string | null>(null);
  const focusedIndex = rows.findIndex((row) => row.id === focusedRow);
  // Keep the focused editor mounted so scrolling cannot drop its keyboard draft.
  const rangeExtractor = useCallback(
    (range: Range) => {
      const indexes = defaultRangeExtractor(range);
      return focusedIndex < 0 || indexes.includes(focusedIndex)
        ? indexes
        : [...indexes, focusedIndex].sort((a, b) => a - b);
    },
    [focusedIndex],
  );
  // eslint-disable-next-line react-hooks/incompatible-library -- no React Compiler in this app.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (index) => rows[index].id,
    overscan: 10,
    rangeExtractor,
  });
  const [dragging, setDragging] = useState<GridRow | null>(null);
  const [target, setTarget] = useState<WorkItemSummary | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const headers = table.getHeaderGroups()[0]?.headers ?? [];
  const items = virtualizer.getVirtualItems();
  const after = virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0);
  const spacer = (height: number) =>
    height > 0 && (
      <tr aria-hidden="true">
        <td colSpan={headers.length} style={{ height, padding: 0, border: 0 }} />
      </tr>
    );
  const stop = () => {
    setDragging(null);
    setTarget(null);
  };

  // An edit can move its row to another group or out of the sprint, which drops keyboard
  // focus. Put focus back on the same control in the row, or in the row now in its place.
  // Only after keyboard use: a pointer user keeps their place.
  const edited = useRef<Edit | null>(null);
  const keyboard = useRef(false);
  useEffect(() => {
    const onKey = () => (keyboard.current = true);
    const onPointer = () => (keyboard.current = false);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer, true);
    };
  }, []);
  useEffect(() => {
    const last = edited.current;
    if (!last) return;
    // Runs after a closing picker returns focus, if it still can.
    const timer = setTimeout(() => {
      edited.current = null;
      if (!keyboard.current) return;
      const found = rows.findIndex((row) => row.id === String(last.id));
      const active = document.activeElement;
      if (active !== document.body) {
        // The focused row stays mounted when it moves, so bring it back into view.
        if (active?.closest('tr[data-id]')?.getAttribute('data-id') === String(last.id)) {
          active.scrollIntoView({ block: 'nearest' });
        }
        return;
      }
      const index = found >= 0 ? found : Math.min(last.index, rows.length - 1);
      virtualizer.scrollToIndex(index);
      const focus = (frames: number) => {
        const control = scroller.current?.querySelector<HTMLElement>(
          `tr[aria-rowindex="${index + 2}"] :is(.cell-${last.column} select, .cell-${last.column} button, .group-toggle)`,
        );
        if (control) control.focus();
        else if (frames) requestAnimationFrame(() => focus(frames - 1));
      };
      focus(5);
    });
    return () => clearTimeout(timer);
  }, [rows, virtualizer]);

  return (
    <DndContext
      sensors={sensors}
      accessibility={{ announcements }}
      onDragStart={({ active }) => setDragging(active.data.current?.item ?? null)}
      onDragOver={({ over }) => setTarget(over?.data.current?.story ?? null)}
      onDragEnd={stop}
      onDragCancel={stop}
    >
      <div
        ref={scroller}
        className="grid-scroll"
        onFocusCapture={(event) =>
          setFocusedRow(event.target.closest('tr[data-id]')?.getAttribute('data-id') ?? null)
        }
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setFocusedRow(null);
        }}
      >
        <table
          className="meeting-grid"
          style={{ width: table.getTotalSize() }}
          aria-rowcount={rows.length + 1}
        >
          <colgroup>
            {headers.map((header) => (
              <col key={header.id} style={{ width: header.getSize() }} />
            ))}
          </colgroup>
          <thead>
            <tr aria-rowindex={1}>
              {headers.map((header) => {
                const sorted = header.column.getIsSorted();
                const label =
                  header.column.id === 'estimate' && context.estimateLabel
                    ? context.estimateLabel
                    : String(header.column.columnDef.header);
                return (
                  <th
                    key={header.id}
                    scope="col"
                    aria-label={label}
                    aria-sort={
                      sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined
                    }
                  >
                    <button
                      type="button"
                      className="column-sort"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {label}
                      {sorted === 'asc' && <ArrowUp size={12} aria-hidden="true" />}
                      {sorted === 'desc' && <ArrowDown size={12} aria-hidden="true" />}
                    </button>
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Resize ${label}`}
                      aria-valuenow={header.getSize()}
                      aria-valuemin={MIN_WIDTH}
                      aria-valuemax={MAX_WIDTH}
                      tabIndex={0}
                      className={
                        header.column.getIsResizing() ? 'column-resizer active' : 'column-resizer'
                      }
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                      onDoubleClick={() => header.column.resetSize()}
                      onKeyDown={(e) => {
                        const step = { ArrowLeft: -RESIZE_STEP, ArrowRight: RESIZE_STEP }[e.key];
                        if (!step) return;
                        e.preventDefault();
                        table.setColumnSizing((old) => ({
                          ...old,
                          [header.column.id]: header.getSize() + step,
                        }));
                      }}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {items.map((virtual, index) => {
              const row = rows[virtual.index];
              const measure = {
                index: virtual.index,
                ref: virtualizer.measureElement,
              };
              return (
                <Fragment key={row.id}>
                  {spacer(virtual.start - (items[index - 1]?.end ?? 0))}
                  {row.getIsGrouped() ? (
                    <GroupRow
                      row={row}
                      measure={measure}
                      span={headers.length}
                      byId={props.byId}
                      grouping={props.grouping}
                      expanded={!props.collapsed.has(row.id)}
                      onToggle={() => props.onToggle(row.id)}
                      dragging={dragging}
                    />
                  ) : (
                    <TicketRow
                      row={row}
                      measure={measure}
                      context={context}
                      onEdit={(column) => {
                        edited.current = { id: row.original.id, column, index: virtual.index };
                      }}
                    />
                  )}
                </Fragment>
              );
            })}
            {spacer(after)}
          </tbody>
        </table>
      </div>
      {dragging && <ParentDrop key={dragging.id} item={dragging} />}
      <DragOverlay>
        {dragging && (
          <div className="drag-preview" aria-hidden="true" inert>
            <strong>
              #{dragging.id} {dragging.title}
            </strong>
            <span>{dropAction(dragging, target)}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

const describeDrop = ({ active, over }: { active: Active; over: Over | null }) =>
  dropAction(active.data.current?.item, over?.data.current?.story ?? null);
/** Screen reader messages for a pointer drag, in place of dnd-kit's internal IDs. */
const announcements = {
  onDragStart: ({ active }: { active: Active }) => `Picked up #${active.id}.`,
  onDragOver: describeDrop,
  onDragEnd: describeDrop,
  onDragCancel: () => 'Drag cancelled.',
};

/** What dropping `item` on `story` would do, shown before the drop. */
function dropAction(item: WorkItemSummary, story: WorkItemSummary | null) {
  if (!story) return 'Drop on a story heading to make it the parent.';
  if (story.id === item.id) return 'An item cannot be its own parent.';
  if (story.id === item.parentId) return `#${story.id} is already the parent.`;
  return `Set parent to #${story.id} ${story.title}. The assignee stays the same.`;
}

/** Saves a drop for the dragged item. Its save outlives this component and the row. */
function ParentDrop({ item }: { item: GridRow }) {
  const toast = useToast();
  const parent = useSetParent(item.id, (error) => {
    const problem = apiError(error);
    toast(
      problem.code === 'CONFLICT'
        ? `#${item.id} changed elsewhere, so the view was refreshed. Check it and try again.`
        : `Could not change the parent of #${item.id}. ${problem.message}`,
    );
  });
  useDndMonitor({
    onDragEnd: ({ over }) => {
      const story: WorkItemSummary | undefined = over?.data.current?.story;
      if (!story || story.id === item.parentId) return;
      if (story.id === item.id) return toast('An item cannot be its own parent.');
      parent.mutate({ parentId: story.id, baseRev: item.rev, parent: story });
    },
  });
  return null;
}

type Measure = { index: number; ref: (node: Element | null) => void };
type Edit = { id: number; column: string; index: number };

function GroupRow(props: {
  row: GridTableRow;
  measure: Measure;
  span: number;
  byId: Map<number, WorkItemSummary>;
  grouping: Grouping;
  expanded: boolean;
  onToggle: () => void;
  dragging: GridRow | null;
}) {
  const { row, byId } = props;
  const leaves = leavesOf(row);
  const key = String(row.groupingValue);
  const isStory = row.groupingColumnId === 'story';
  const story = isStory ? byId.get(Number(key)) : undefined;
  const { setNodeRef, isOver } = useDroppable({
    id: row.id,
    disabled: !story,
    data: { story },
  });
  const label = !isStory
    ? (leaves[0].assignee?.displayName ?? 'Unassigned')
    : key === NO_STORY
      ? 'No parent story'
      : key === UNAVAILABLE_STORY
        ? 'Unavailable story'
        : `#${key} ${story?.title ?? ''}`;
  const remaining = remainingTotal(leaves);
  // Story estimates show once per story, so only in the retro's story groups.
  const estimate = isStory && props.grouping === 'story' ? story?.estimate : null;
  return (
    <tr
      ref={(node) => {
        props.measure.ref(node);
        setNodeRef(node);
      }}
      data-index={props.measure.index}
      aria-rowindex={props.measure.index + 2}
      className={isOver ? 'group-row over' : 'group-row'}
      data-depth={row.depth}
    >
      <th colSpan={props.span} scope="rowgroup" style={{ paddingLeft: 12 + row.depth * 22 }}>
        <button
          type="button"
          className="group-toggle"
          aria-expanded={props.expanded}
          onClick={props.onToggle}
        >
          {props.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {label}
        </button>
        <span className="count-badge">
          {leaves.length} ticket{leaves.length === 1 ? '' : 's'}
        </span>
        {remaining !== null && (
          <span className="muted-text">Remaining work {formatNumber(remaining)}</span>
        )}
        {estimate && (
          <span className="muted-text">
            {estimate.label} {formatNumber(estimate.value)}
          </span>
        )}
        {key === UNAVAILABLE_STORY && (
          <span className="muted-text">A parent could not be read.</span>
        )}
        {props.dragging && story && (
          <span className="drop-hint">{isOver ? 'Release to set parent' : 'Drop here'}</span>
        )}
      </th>
    </tr>
  );
}

function TicketRow({
  row,
  measure,
  context,
  onEdit,
}: {
  row: GridTableRow;
  measure: Measure;
  context: RowContext;
  onEdit: (column: string) => void;
}) {
  const item = row.original;
  const toast = useToast();
  const save = useQuickSave(item.id);
  const states = useQuery(statesQuery(context.projectId, item.type));
  const fields = useQuery(fieldsQuery(context.projectId, item.type));
  const priorities = fields.data?.find((f) => f.referenceName === PRIORITY)?.allowedValues ?? [];
  const { setNodeRef, setActivatorNodeRef, listeners } = useDraggable({
    id: item.id,
    data: { item },
  });
  const commit = (
    column: string,
    changes: Record<string, string | number | null>,
    baseRev = item.rev,
  ) => {
    onEdit(column);
    save.mutate({ fields: changes, baseRev });
  };
  const choices = (values: string[], current: string) =>
    (values.includes(current) ? values : [current, ...values]).map((value) => (
      <option key={value} value={value}>
        {value || '—'}
      </option>
    ));

  const cell = (id: string) => {
    switch (id) {
      case 'id':
        return (
          <>
            {/* To the left, so the hint never covers the handle in the row above. */}
            <WithTooltip label="Drag onto a story heading to change the parent" side="left">
              <span
                ref={setActivatorNodeRef}
                {...listeners}
                className="drag-handle"
                aria-hidden="true"
              >
                <GripVertical size={14} />
              </span>
            </WithTooltip>
            <span className="item-number">#{item.id}</span>
          </>
        );
      case 'title':
        return (
          <Link
            to="."
            search={(prev: Record<string, unknown>) => ({ ...prev, item: item.id })}
            className="cell-link"
          >
            {item.title}
          </Link>
        );
      case 'type':
        return <span className="muted-text">{item.type}</span>;
      case 'state':
        return (
          <CellSelect
            label={`State of #${item.id}`}
            value={item.state}
            rev={item.rev}
            onCommit={(state, rev) => commit(id, { 'System.State': state }, rev)}
          >
            {choices(
              (states.data ?? []).map((s) => s.name),
              item.state,
            )}
          </CellSelect>
        );
      case 'assignee':
        return (
          <AssigneePicker
            label={`Assignee of #${item.id}: ${item.assignee?.displayName ?? 'Unassigned'}`}
            assignee={item.assignee}
            me={context.me}
            members={context.members}
            onChange={(person) => commit(id, { 'System.AssignedTo': person })}
          />
        );
      case 'iterationPath':
        return (
          <CellSelect
            label={`Iteration of #${item.id}`}
            value={item.iterationPath}
            rev={item.rev}
            onCommit={(path, rev) => {
              if (path !== context.sprintPath) {
                toast(`#${item.id} is moving to another sprint, so it leaves this view.`);
              }
              commit(id, { 'System.IterationPath': path }, rev);
            }}
          >
            {!context.iterations.some((i) => i.path === item.iterationPath) && (
              <option value={item.iterationPath}>{item.iterationPath}</option>
            )}
            {context.iterations.map((i) => (
              <option key={i.id} value={i.path}>
                {i.name}
              </option>
            ))}
          </CellSelect>
        );
      case 'priority':
        return priorities.length ? (
          <CellSelect
            label={`Priority of #${item.id}`}
            value={String(item.priority ?? '')}
            rev={item.rev}
            onCommit={(priority, rev) => commit(id, { [PRIORITY]: Number(priority) }, rev)}
          >
            {choices(priorities.map(String), String(item.priority ?? ''))}
          </CellSelect>
        ) : (
          (item.priority ?? <span className="muted-text">—</span>)
        );
      case 'remainingWork':
        return item.remainingWork === null ? (
          <span className="muted-text">—</span>
        ) : (
          formatNumber(item.remainingWork)
        );
      case 'estimate':
        return item.estimate ? (
          <>
            {formatNumber(item.estimate.value)}
            {!context.estimateLabel && <span className="muted-text"> {item.estimate.label}</span>}
          </>
        ) : (
          <span className="muted-text">—</span>
        );
    }
  };

  return (
    <tr
      ref={(node) => {
        measure.ref(node);
        setNodeRef(node);
      }}
      data-index={measure.index}
      aria-rowindex={measure.index + 2}
      data-id={item.id}
      className="ticket-row"
    >
      {row.getVisibleCells().map((c) => (
        <td key={c.id} className={`cell-${c.column.id}`}>
          {cell(c.column.id)}
        </td>
      ))}
    </tr>
  );
}

/** A change this soon after a key press on a closed select is the keyboard stepping through it. */
const KEY_STEP_MS = 100;

/**
 * A grid select. A pick from the open list, by pointer or keyboard, saves at once. Stepping
 * through a closed select with arrow keys or type-ahead keeps a draft that saves on Enter or
 * when focus leaves, so each step is not its own save. A draft keeps the revision it started
 * from, so a change made elsewhere in the meantime still conflicts.
 */
function CellSelect(props: {
  label: string;
  value: string;
  rev: number;
  onCommit: (value: string, baseRev: number) => void;
  children: ReactNode;
}) {
  const [draft, setDraft] = useState<{ value: string; rev: number } | null>(null);
  const keyAt = useRef(-Infinity);
  const commit = (value: string, rev: number) => {
    setDraft(null);
    if (value !== props.value) props.onCommit(value, rev);
  };
  return (
    <NativeSelect
      size="sm"
      className="cell-select max-w-full"
      aria-label={props.label}
      value={draft?.value ?? props.value}
      onKeyDown={(e) => {
        keyAt.current = e.timeStamp;
        if (e.key === 'Enter' && draft) {
          e.preventDefault();
          commit(draft.value, draft.rev);
        }
        if (e.key === 'Escape') setDraft(null);
      }}
      onChange={(e) =>
        e.timeStamp - keyAt.current < KEY_STEP_MS
          ? setDraft({ value: e.target.value, rev: draft?.rev ?? props.rev })
          : commit(e.target.value, draft?.rev ?? props.rev)
      }
      onBlur={() => draft && commit(draft.value, draft.rev)}
    >
      {props.children}
    </NativeSelect>
  );
}
