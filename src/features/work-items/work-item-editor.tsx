import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
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
  expectedRev,
  usePendingFields,
  useSaveFields,
  useSetParent,
  type FieldChanges,
  type Pending,
} from '../../lib/saves';
import { keepView, useScope, type ViewSearch } from '../../lib/scope';
import { useToast } from '../../lib/toast';
import { useCreate } from './create';
import { DraftInput, FieldInput, FormField } from './field-inputs';
import { ItemActions } from './item-actions';
import { AssigneePicker, ParentPicker } from './pickers';
import { LazyComments, LazyRichTextField as RichTextField } from './lazy-rich-text';

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
  if (!view.data) {
    return (
      <p role="alert" className="notice notice-error">
        {view.error?.message}
      </p>
    );
  }
  // Keyed by item so edit state never carries over to another item.
  return (
    <>
      {view.isError && (
        <p role="alert" className="notice notice-error">
          Could not refresh this item. Showing the last loaded version. {view.error.message}
        </p>
      )}
      <EditorBody
        key={view.data.item.id}
        view={view.data}
        variant={variant}
        refreshFailed={view.isError}
      />
    </>
  );
}

/** The URL project and team that item links keep. */
type ItemContext = Pick<ViewSearch, 'project' | 'team'>;

function ItemLink(props: { item: WorkItemSummary; variant: Variant; context: ItemContext }) {
  const { item, variant, context } = props;
  const label = (
    <>
      <span className="item-number">#{item.id}</span> {item.title}
      <span className="muted-text">
        {item.type} · {item.state}
      </span>
    </>
  );
  return variant === 'page' ? (
    <Link to="/items/$id" params={{ id: String(item.id) }} search={context} className="linked-item">
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

function EditorBody(props: { view: WorkItemView; variant: Variant; refreshFailed: boolean }) {
  const { view, variant } = props;
  const { item, related, missingIds } = view;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const parent = useSetParent(item.id);
  const pending = usePendingFields(item.id);
  const openCreate = useCreate();
  const session = useQuery(sessionQuery);
  const { project, team, context } = useScope(item.project);
  const defs = useQuery(fieldsQuery(item.project, item.type));
  const states = useQuery(statesQuery(item.project, item.type));
  const members = useQuery(membersQuery(project?.id, team?.id));
  const iterations = useQuery(iterationsQuery(project?.id, team?.id));
  const areas = useQuery(areasQuery(item.project));
  const byRef = new Map((defs.data ?? []).map((d) => [d.referenceName, d]));
  const me = session.data?.user;
  const toast = useToast();
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // A draft sent while leaving can fail after this editor is gone, so say so elsewhere.
  const save = useSaveFields(item.id, (_error, failed) => {
    const names = Object.keys(failed.fields).map((ref) => byRef.get(ref)?.name ?? ref);
    if (!mounted.current) toast(`#${item.id}: ${names.join(', ')} not saved. Open it to review.`);
  });

  const commit = (fields: FieldChanges, baseRev = item.rev) => {
    // A new edit replaces older failed drafts of the same fields, so one Discard clears them.
    for (const old of Object.values(pending)) {
      const covered = Object.keys(old.save.fields).every((ref) => ref in fields);
      if (old.status === 'error' && old.mutation && covered) {
        queryClient.getMutationCache().remove(old.mutation);
      }
    }
    save.mutate({ fields, baseRev });
  };

  /** The loaded Azure DevOps value. People are identities. */
  const saved = (ref: string): FieldValue | Identity => {
    if (ref === 'System.Description') return item.description;
    if (ref === 'System.AssignedTo') return item.assignee;
    return item.fields[ref] ?? null;
  };
  const value = (ref: string): FieldValue => {
    if (ref in pending) return pending[ref].value;
    const current = saved(ref);
    return current !== null && typeof current === 'object' ? current.id : current;
  };
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
    ...Object.values(item.fields).filter((v) => v !== null && typeof v === 'object'),
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

  // Without options, FieldInput uses the field's allowed values, a checkbox, or a picker.
  const select = (
    ref: string,
    label: string,
    options?: string[],
    optionsQuery?: { isLoading: boolean; isError: boolean },
  ) => (
    <FormField key={ref} label={label} htmlFor={`field-${ref}`} error={fieldError(ref)}>
      <FieldInput
        id={`field-${ref}`}
        def={byRef.get(ref) ?? stringField(ref, label)}
        people={people}
        me={me}
        value={value(ref)}
        options={options}
        optionsQuery={optionsQuery}
        rev={item.rev}
        invalid={!!fieldError(ref)}
        onChange={(next, baseRev) => commit({ [ref]: next }, baseRev)}
      />
    </FormField>
  );
  const draft = (ref: string, label: string, numeric = false) => (
    <FormField key={ref} label={label} htmlFor={`field-${ref}`} error={fieldError(ref)}>
      <DraftInput
        id={`field-${ref}`}
        numeric={numeric}
        value={value(ref)}
        rev={pending[ref]?.save.baseRev ?? item.rev}
        invalid={!!fieldError(ref)}
        onCommit={(next, rev) => commit({ [ref]: next }, rev)}
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
          <Link
            to="/items/$id"
            params={{ id: String(item.id) }}
            search={context}
            className="text-link"
          >
            Open full page
          </Link>
        )}
        <ItemActions
          item={item}
          context={context}
          webUrl={view.webUrl}
          onDeleted={() =>
            variant === 'panel'
              ? navigate({
                  to: '.',
                  search: (prev: Record<string, unknown>) => ({ ...prev, item: undefined }),
                })
              : navigate({ to: '/board', search: keepView })
          }
        />
      </div>
      <DraftInput
        id="field-System.Title"
        label="Title"
        className="title-input"
        value={value('System.Title')}
        rev={pending['System.Title']?.save.baseRev ?? item.rev}
        invalid={!!fieldError('System.Title')}
        onCommit={(next, rev) => commit({ 'System.Title': next }, rev)}
      />
      {fieldError('System.Title') && (
        <small className="field-error">{fieldError('System.Title')}</small>
      )}

      {failures.map((failure) => (
        <SaveProblem
          key={String(failure.mutation?.mutationId)}
          failure={failure}
          defs={byRef}
          people={people}
          me={me}
          // A conflict means ADO is past the sent revision, so only a later load has its value.
          saved={item.rev > expectedRev(item.id, failure.save.baseRev) ? saved : undefined}
          refreshFailed={props.refreshFailed}
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
          'State',
          (states.data ?? []).map((s) => s.name),
          states,
        )}
        <FormField label="Assignee" error={fieldError('System.AssignedTo')}>
          <AssigneePicker
            assignee={assignee}
            me={me}
            members={members.data ?? []}
            onChange={(id) => commit({ 'System.AssignedTo': id })}
          />
        </FormField>
        {byRef.has(PRIORITY) && select(PRIORITY, 'Priority')}
        {draft('System.Tags', 'Tags')}
        {select('System.AreaPath', 'Area', areas.data ?? [], areas)}
        {select(
          'System.IterationPath',
          'Iteration',
          (iterations.data ?? []).map((i) => i.path),
          iterations,
        )}
        {estimate && draft(estimate, byRef.get(estimate)!.name, true)}
        {byRef.has(REMAINING) && draft(REMAINING, byRef.get(REMAINING)!.name, true)}
        {extras.map((d) =>
          d.allowedValues.length || d.type === 'boolean' || d.type === 'identity'
            ? select(d.referenceName, d.name)
            : draft(d.referenceName, d.name, d.type === 'integer' || d.type === 'double'),
        )}
      </div>

      <section className="item-section" aria-label="Description">
        <h3>Description</h3>
        <RichTextField
          label="Description"
          html={String(value('System.Description') ?? '')}
          rev={pending['System.Description']?.save.baseRev ?? item.rev}
          onSave={(html, rev) => commit({ 'System.Description': html }, rev)}
        />
      </section>

      <section className="item-section" aria-label="Parent">
        <h3>Parent</h3>
        {parentId ? (
          parentItem ? (
            <ItemLink item={parentItem} variant={variant} context={context} />
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
                <ItemLink item={child} variant={variant} context={context} />
              )}
            </li>
          ))}
        </ul>
        {missingIds.length > 0 && (
          <p className="muted-text">
            Some linked items may be deleted or outside your permissions.
          </p>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => openCreate({ parentId: item.id, project: item.project })}
        >
          Add child
        </Button>
      </section>

      <section className="item-section" aria-label="Comments">
        <h3>Comments</h3>
        <LazyComments id={item.id} projectId={item.project} />
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

/** HTML as plain text, with a space for each line break and block. */
function htmlText(html: string) {
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  body
    .querySelectorAll('br,p,div,li,tr,td,th,h1,h2,h3,h4,h5,h6,blockquote,pre')
    .forEach((el) => el.after(' '));
  return body.textContent;
}

/** A loaded value as short plain text. Description HTML is parsed inert, never rendered. */
function shownValue(ref: string, value: FieldValue | Identity) {
  const text =
    value !== null && typeof value === 'object'
      ? value.displayName
      : ref === 'System.Description'
        ? htmlText(String(value))
        : String(value ?? '');
  const plain = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!plain) return '(empty)';
  return plain.length > 200 ? `${plain.slice(0, 200)}…` : plain;
}

/** A failed save with its draft kept, plus any fields ADO needs to accept it. */
function SaveProblem(props: {
  failure: Pending;
  defs: Map<string, FieldDefinition>;
  people: Identity[];
  me?: Identity;
  /** The loaded Azure DevOps value, once the item has reloaded since the conflict. */
  saved?: (ref: string) => FieldValue | Identity;
  refreshFailed: boolean;
  onRetry: (fields: FieldChanges) => void;
  onDiscard: () => void;
}) {
  const error = apiError(props.failure.error);
  const needed = Object.keys(error.fieldErrors ?? {}).filter(
    (ref) => !(ref in props.failure.save.fields) && props.defs.has(ref),
  );
  const [extra, setExtra] = useState<FieldChanges>({});
  const { saved } = props;
  const failed = Object.keys(props.failure.save.fields);
  const name = (ref: string) => props.defs.get(ref)?.name ?? ref;
  return (
    <div role="alert" className="save-problem">
      <p>
        <strong>Not saved: {failed.map(name).join(', ')}.</strong>{' '}
        {PROBLEMS[error.code] ?? error.message}
      </p>
      {/* The loaded revision is the one Save again replaces, so show what it would overwrite. */}
      {error.code === 'CONFLICT' &&
        (saved ? (
          failed.map((ref) => (
            <p key={ref}>
              Azure DevOps now has {name(ref)}: {shownValue(ref, saved(ref))}
            </p>
          ))
        ) : (
          <p>
            {props.refreshFailed
              ? 'Could not load the current Azure DevOps value.'
              : 'Loading the current Azure DevOps value…'}
          </p>
        ))}
      {needed.map((ref) => (
        <div key={ref} className="form-field">
          <label htmlFor={`needed-${ref}`}>{props.defs.get(ref)!.name}</label>
          <FieldInput
            id={`needed-${ref}`}
            def={props.defs.get(ref)!}
            people={props.people}
            me={props.me}
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
