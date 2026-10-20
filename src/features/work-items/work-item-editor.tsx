import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import type {
  FieldDefinition,
  FieldValue,
  Identity,
  WorkItemSummary,
  WorkItemView,
} from '../../../shared/contracts';
import { Button } from '../../components/ui/button';
import { apiError } from '../../lib/api';
import { isShortcut } from '../../lib/keys';
import {
  areasQuery,
  fieldsQuery,
  iterationsQuery,
  membersQuery,
  sessionQuery,
  statesQuery,
  workItemQuery,
} from '../../lib/queries';
import {
  usePendingFields,
  useSaveFields,
  useSetParent,
  type FieldChanges,
  type Pending,
} from '../../lib/saves';
import { useScope } from '../../lib/scope';
import { useCreate } from './create';
import { DraftInput, FieldInput, FormField } from './field-inputs';
import { AssigneePicker, ParentPicker } from './pickers';
import { LazyRichTextField as RichTextField } from './lazy-rich-text';

const ESTIMATES = [
  'Microsoft.VSTS.Scheduling.StoryPoints',
  'Microsoft.VSTS.Scheduling.Effort',
  'Microsoft.VSTS.Scheduling.Size',
];
const REMAINING = 'Microsoft.VSTS.Scheduling.RemainingWork';
const PRIORITY = 'Microsoft.VSTS.Common.Priority';
const SHOWN = new Set([
  'System.Title',
  'System.State',
  'System.AssignedTo',
  'System.Description',
  'System.Tags',
  'System.AreaPath',
  'System.IterationPath',
  PRIORITY,
  REMAINING,
  ...ESTIMATES,
]);

type Variant = 'panel' | 'page';

export function WorkItemEditor({ id, variant }: { id: number; variant: Variant }) {
  const view = useQuery(workItemQuery(id));
  if (view.isPending)
    return (
      <p role="status" className="empty-state">
        Loading item…
      </p>
    );
  if (view.isError) {
    return (
      <p role="alert" className="notice notice-error">
        {view.error.message}
      </p>
    );
  }
  // Keyed by item so edit state never carries over to another item.
  return <EditorBody key={view.data.item.id} view={view.data} variant={variant} />;
}

function ItemLink({ item, variant }: { item: WorkItemSummary; variant: Variant }) {
  const label = (
    <>
      <span className="item-number">#{item.id}</span> {item.title}
      <span className="muted-text">
        {item.type} · {item.state}
      </span>
    </>
  );
  return variant === 'page' ? (
    <Link to="/items/$id" params={{ id: String(item.id) }} className="linked-item">
      {label}
    </Link>
  ) : (
    <Link
      to="."
      search={(prev: Record<string, unknown>) => ({ ...prev, item: item.id })}
      className="linked-item"
    >
      {label}
    </Link>
  );
}

function EditorBody({ view, variant }: { view: WorkItemView; variant: Variant }) {
  const { item, related, missingIds } = view;
  const queryClient = useQueryClient();
  const save = useSaveFields(item.id);
  const parent = useSetParent(item.id);
  const pending = usePendingFields(item.id);
  const openCreate = useCreate();
  const session = useQuery(sessionQuery);
  const { project, team } = useScope();
  const defs = useQuery(fieldsQuery(item.project, item.type));
  const states = useQuery(statesQuery(item.project, item.type));
  const members = useQuery(membersQuery(project?.id, team?.id));
  const iterations = useQuery(iterationsQuery(project?.id, team?.id));
  const areas = useQuery(areasQuery(item.project));
  const byRef = new Map((defs.data ?? []).map((d) => [d.referenceName, d]));
  const me = session.data?.user;

  // The revision each field's edit started from, so changes made elsewhere still conflict.
  const editStart = useRef<Record<string, number>>({});
  const begin = (ref: string) => {
    editStart.current[ref] ??= item.rev;
  };
  const commit = (fields: FieldChanges) => {
    const starts = Object.keys(fields).map((ref) => editStart.current[ref] ?? item.rev);
    for (const ref of Object.keys(fields)) delete editStart.current[ref];
    save.mutate({ fields, baseRev: Math.min(...starts) });
  };

  const value = (ref: string): FieldValue =>
    ref in pending
      ? pending[ref].value
      : ref === 'System.Description'
        ? item.description
        : ref === 'System.AssignedTo'
          ? (item.assignee?.id ?? null)
          : (item.fields[ref] ?? null);
  const fieldError = (ref: string) => {
    if (pending[ref]?.status !== 'error') return undefined;
    const error = apiError(pending[ref].error);
    return error.fieldErrors?.[ref] ?? 'Not saved.';
  };

  // I assigns the open item to me, unless the user is typing. Re-subscribes each render
  // so the handler always sees the latest item revision.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!me || !isShortcut(event, 'i')) return;
      event.preventDefault();
      commit({ 'System.AssignedTo': me.id });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const people: Identity[] = [
    ...(members.data ?? []),
    ...(me ? [me] : []),
    ...(item.assignee ? [item.assignee] : []),
  ];
  const assigneeId = value('System.AssignedTo');
  const assignee = assigneeId
    ? (people.find((p) => p.id === assigneeId) ?? { id: String(assigneeId), displayName: '…' })
    : null;
  const estimate = ESTIMATES.find((ref) => byRef.has(ref));
  const extras = (defs.data ?? []).filter(
    (d) =>
      d.required &&
      !d.readOnly &&
      !SHOWN.has(d.referenceName) &&
      !d.referenceName.startsWith('System.'),
  );
  const failures = [
    ...new Map(
      Object.values(pending)
        .filter((p) => p.status === 'error')
        .map((p) => [p.mutation, p]),
    ).values(),
  ];
  const saving = Object.values(pending).some((p) => p.status === 'pending') || parent.isPending;
  // Show the chosen parent while the change saves.
  const parentId = parent.isPending ? parent.variables.parentId : item.parentId;
  const parentItem = parent.isPending
    ? parent.variables.parent
    : related.find((r) => r.id === item.parentId);
  const children = item.childIds.map((id) => related.find((r) => r.id === id) ?? id);

  const select = (ref: string, options: string[], label: string) => (
    <FormField key={ref} label={label} htmlFor={`field-${ref}`} error={fieldError(ref)}>
      <FieldInput
        id={`field-${ref}`}
        def={byRef.get(ref) ?? stringField(ref, label)}
        value={value(ref)}
        options={options}
        invalid={!!fieldError(ref)}
        onChange={(next) => commit({ [ref]: next })}
      />
    </FormField>
  );
  const draft = (ref: string, label: string, numeric = false) => (
    <FormField key={ref} label={label} htmlFor={`field-${ref}`} error={fieldError(ref)}>
      <DraftInput
        id={`field-${ref}`}
        numeric={numeric}
        value={value(ref)}
        invalid={!!fieldError(ref)}
        onEditStart={() => begin(ref)}
        onCommit={(next) => commit({ [ref]: next })}
      />
    </FormField>
  );

  return (
    <article className={`item-editor item-editor-${variant}`} aria-label={`Work item ${item.id}`}>
      <div className="item-editor-meta">
        <span className={`type-pill type-${item.type.toLowerCase()}`}>{item.type}</span>
        <span className="item-number">#{item.id}</span>
        <span role="status" className="save-status">
          {saving ? 'Saving…' : failures.length ? 'Not saved' : save.isSuccess ? 'Saved' : ''}
        </span>
        {variant === 'panel' && (
          <Link to="/items/$id" params={{ id: String(item.id) }} className="text-link">
            Open full page
          </Link>
        )}
      </div>
      <DraftInput
        id="field-System.Title"
        label="Title"
        className="title-input"
        value={value('System.Title')}
        invalid={!!fieldError('System.Title')}
        onEditStart={() => begin('System.Title')}
        onCommit={(next) => commit({ 'System.Title': next })}
      />
      {fieldError('System.Title') && (
        <small className="field-error">{fieldError('System.Title')}</small>
      )}

      {failures.map((failure) => (
        <SaveProblem
          key={String(failure.mutation?.mutationId)}
          failure={failure}
          defs={byRef}
          onRetry={(fields) => {
            if (failure.mutation) queryClient.getMutationCache().remove(failure.mutation);
            save.mutate({ fields, baseRev: item.rev });
          }}
          onDiscard={() =>
            failure.mutation && queryClient.getMutationCache().remove(failure.mutation)
          }
        />
      ))}

      <div className="properties">
        {select(
          'System.State',
          (states.data ?? []).map((s) => s.name),
          'State',
        )}
        <FormField label="Assignee" error={fieldError('System.AssignedTo')}>
          <AssigneePicker
            assignee={assignee}
            me={me}
            members={members.data ?? []}
            onChange={(id) => commit({ 'System.AssignedTo': id })}
          />
        </FormField>
        {byRef.has(PRIORITY) &&
          select(PRIORITY, byRef.get(PRIORITY)!.allowedValues.map(String), 'Priority')}
        {draft('System.Tags', 'Tags')}
        {select('System.AreaPath', areas.data ?? [], 'Area')}
        {select(
          'System.IterationPath',
          (iterations.data ?? []).map((i) => i.path),
          'Iteration',
        )}
        {estimate && draft(estimate, byRef.get(estimate)!.name, true)}
        {byRef.has(REMAINING) && draft(REMAINING, byRef.get(REMAINING)!.name, true)}
        {extras.map((d) =>
          d.allowedValues.length || d.type === 'boolean'
            ? select(d.referenceName, d.allowedValues.map(String), d.name)
            : draft(d.referenceName, d.name, d.type === 'integer' || d.type === 'double'),
        )}
      </div>

      <section className="item-section" aria-label="Description">
        <h3>Description</h3>
        <RichTextField
          label="Description"
          html={String(value('System.Description') ?? '')}
          onChange={() => begin('System.Description')}
          onSave={(html) => commit({ 'System.Description': html })}
        />
      </section>

      <section className="item-section" aria-label="Parent">
        <h3>Parent</h3>
        {parentId ? (
          parentItem ? (
            <ItemLink item={parentItem} variant={variant} />
          ) : (
            <p className="muted-text">#{parentId} could not be read.</p>
          )
        ) : (
          <p className="muted-text">No parent.</p>
        )}
        <div className="section-actions">
          <ParentPicker
            label={parentId ? 'Change parent' : 'Set parent'}
            projectId={item.project}
            excludeId={item.id}
            onSelect={(next) =>
              parent.mutate({ parentId: next.id, baseRev: item.rev, parent: next })
            }
          />
          {parentId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => parent.mutate({ parentId: null, baseRev: item.rev })}
            >
              Remove parent
            </Button>
          )}
        </div>
        {parent.isError && (
          <p role="alert" className="notice notice-error">
            {apiError(parent.error).code === 'CONFLICT'
              ? 'This item changed in Azure DevOps. Review it, then try the parent change again.'
              : parent.error.message}
          </p>
        )}
      </section>

      <section className="item-section" aria-label="Children">
        <h3>Children</h3>
        {children.length === 0 && <p className="muted-text">No children.</p>}
        <ul className="linked-list">
          {children.map((child) => (
            <li key={typeof child === 'number' ? child : child.id}>
              {typeof child === 'number' ? (
                <span className="muted-text">#{child} could not be read.</span>
              ) : (
                <ItemLink item={child} variant={variant} />
              )}
            </li>
          ))}
        </ul>
        {missingIds.length > 0 && (
          <p className="muted-text">
            Some linked items may be deleted or outside your permissions.
          </p>
        )}
        <Button variant="outline" size="sm" onClick={() => openCreate({ parentId: item.id })}>
          Add child
        </Button>
      </section>
    </article>
  );
}

const stringField = (referenceName: string, name: string): FieldDefinition => ({
  referenceName,
  name,
  type: 'string',
  required: false,
  readOnly: false,
  allowedValues: [],
  defaultValue: null,
});

const PROBLEMS: Partial<Record<string, string>> = {
  CONFLICT:
    'This item changed in Azure DevOps. Your change is kept here. Review the item, then save your change again or discard it.',
  UNKNOWN_OUTCOME:
    'Eruza lost contact while saving. The change may already be saved. Check the item before saving again.',
};

/** A failed save with its draft kept, plus any fields ADO needs to accept it. */
function SaveProblem(props: {
  failure: Pending;
  defs: Map<string, FieldDefinition>;
  onRetry: (fields: FieldChanges) => void;
  onDiscard: () => void;
}) {
  const error = apiError(props.failure.error);
  const needed = Object.keys(error.fieldErrors ?? {}).filter(
    (ref) => !(ref in props.failure.save.fields) && props.defs.has(ref),
  );
  const [extra, setExtra] = useState<FieldChanges>({});
  const changed = Object.keys(props.failure.save.fields)
    .map((ref) => props.defs.get(ref)?.name ?? ref)
    .join(', ');
  return (
    <div role="alert" className="save-problem">
      <p>
        <strong>Not saved: {changed}.</strong> {PROBLEMS[error.code] ?? error.message}
      </p>
      {needed.map((ref) => (
        <div key={ref} className="form-field">
          <label htmlFor={`needed-${ref}`}>{props.defs.get(ref)!.name}</label>
          <FieldInput
            id={`needed-${ref}`}
            def={props.defs.get(ref)!}
            value={extra[ref] ?? null}
            onChange={(next) => setExtra((current) => ({ ...current, [ref]: next }))}
          />
          <small className="field-error">{error.fieldErrors![ref]}</small>
        </div>
      ))}
      <div className="section-actions">
        <Button size="sm" onClick={() => props.onRetry({ ...props.failure.save.fields, ...extra })}>
          {needed.length ? 'Save together' : 'Save again'}
        </Button>
        <Button size="sm" variant="ghost" onClick={props.onDiscard}>
          Discard my change
        </Button>
      </div>
    </div>
  );
}
