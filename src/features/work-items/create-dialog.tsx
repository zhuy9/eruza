import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  workItemDetailSchema,
  type CreateWorkItemInput,
  type FieldValue,
} from '../../../shared/contracts';
import { Button } from '../../components/ui/button';
import { apiError, sendJson } from '../../lib/api';
import {
  areasQuery,
  backlogsQuery,
  fieldsQuery,
  iterationsQuery,
  membersQuery,
  sessionQuery,
  teamSettingsQuery,
  typesQuery,
} from '../../lib/queries';
import { useScope } from '../../lib/scope';
import type { CreateRequest } from './create';
import { FieldInput, FormField } from './field-inputs';
import { AssigneePicker } from './pickers';
import { LazyRichTextField as RichTextField } from './lazy-rich-text';

/** Fields with their own controls in the form. Other required fields are added below them. */
const FORM_FIELDS = new Set([
  'System.Title',
  'System.Description',
  'System.AssignedTo',
  'Microsoft.VSTS.Common.Priority',
  'System.Tags',
  'System.AreaPath',
  'System.IterationPath',
  'System.State',
]);
const PRIORITY = 'Microsoft.VSTS.Common.Priority';

export function CreateDialog({
  request,
  onClose,
}: {
  request: CreateRequest;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLInputElement>(null);
  // showModal focuses the first field (Type), so move focus to the title afterwards.
  useEffect(() => {
    dialog.current?.showModal();
    title.current?.focus();
  }, []);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { project, team, sprint } = useScope();
  const types = useQuery(typesQuery(project?.id));
  const backlogs = useQuery(backlogsQuery(project?.id, team?.id));
  const settings = useQuery(teamSettingsQuery(project?.id, team?.id));
  const areas = useQuery(areasQuery(project?.id));
  const iterations = useQuery(iterationsQuery(project?.id, team?.id));
  const members = useQuery(membersQuery(project?.id, team?.id));
  const session = useQuery(sessionQuery);

  const firstOf = (level: string) => backlogs.data?.find((b) => b.type === level)?.workItemTypes[0];
  const [chosenType, setChosenType] = useState<string>();
  const type =
    chosenType ??
    request.type ??
    (request.parentId ? firstOf('task') : firstOf('requirement')) ??
    types.data?.[0]?.name;
  const defs = useQuery(fieldsQuery(project?.id, type));
  const byRef = new Map((defs.data ?? []).map((d) => [d.referenceName, d]));
  const extras = (defs.data ?? []).filter(
    (d) => d.required && !d.readOnly && !FORM_FIELDS.has(d.referenceName),
  );

  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const defaults: Record<string, FieldValue> = {
    'System.AreaPath': settings.data?.defaultAreaPath ?? null,
    'System.IterationPath':
      (sprint && 'path' in sprint ? sprint.path : settings.data?.defaultIterationPath) ?? null,
    [PRIORITY]: byRef.get(PRIORITY)?.defaultValue ?? null,
    ...Object.fromEntries(extras.map((d) => [d.referenceName, d.defaultValue])),
    ...(request.state && { 'System.State': request.state }),
  };
  const value = (ref: string) => (ref in values ? values[ref] : (defaults[ref] ?? null));
  const set = (ref: string, next: FieldValue) => {
    setValues((current) => ({ ...current, [ref]: next }));
    setErrors((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => key !== ref)),
    );
  };

  const create = useMutation({
    mutationFn: (input: CreateWorkItemInput) =>
      sendJson('POST', '/work-items', input, workItemDetailSchema),
    onSuccess: (item) => {
      void queryClient.invalidateQueries({ queryKey: ['work-items'] });
      if (request.parentId) {
        void queryClient.invalidateQueries({ queryKey: ['work-item', request.parentId] });
      }
      dialog.current?.close();
      void navigate({
        to: '.',
        search: (prev: Record<string, unknown>) => ({ ...prev, item: item.id }),
      });
    },
    onError: (error) => setErrors(apiError(error).fieldErrors ?? {}),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!project || !type || !defs.data) return;
    const refs = [
      'System.Title',
      'System.Description',
      'System.AssignedTo',
      'System.Tags',
      'System.AreaPath',
      'System.IterationPath',
      ...byRef.keys(),
    ];
    const fields = Object.fromEntries(
      [...new Set(refs)]
        .filter((ref) => ref === 'System.Title' || byRef.has(ref))
        .map((ref) => [ref, value(ref)] as const)
        .filter(([, v]) => v !== null && v !== ''),
    );
    const missing: Record<string, string> = {};
    if (!String(fields['System.Title'] ?? '').trim()) missing['System.Title'] = 'Enter a title.';
    for (const d of extras) {
      if (fields[d.referenceName] === undefined)
        missing[d.referenceName] = 'This field is required.';
    }
    if (Object.keys(missing).length) return setErrors(missing);
    create.mutate({
      projectId: project.id,
      type,
      fields,
      ...(request.parentId && { parentId: request.parentId }),
    });
  }

  const failure = create.error && apiError(create.error);
  const assigneeId = value('System.AssignedTo');
  const people = [...(members.data ?? []), ...(session.data?.user ? [session.data.user] : [])];

  return (
    <dialog ref={dialog} className="dialog" onClose={onClose} aria-labelledby="create-title">
      <form onSubmit={submit} noValidate>
        <h2 id="create-title">
          {request.parentId ? `New child of #${request.parentId}` : 'New work item'}
        </h2>
        <div className="form-grid">
          <FormField label="Type" htmlFor="create-type">
            <select
              id="create-type"
              className="select"
              value={type ?? ''}
              onChange={(e) => setChosenType(e.target.value)}
            >
              {types.data?.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Assignee">
            <AssigneePicker
              assignee={people.find((p) => p.id === assigneeId) ?? null}
              me={session.data?.user}
              members={members.data ?? []}
              onChange={(id) => set('System.AssignedTo', id)}
            />
          </FormField>
          <FormField label="Title" htmlFor="create-title-input" error={errors['System.Title']} wide>
            <input
              id="create-title-input"
              ref={title}
              className="input"
              aria-invalid={!!errors['System.Title']}
              value={String(value('System.Title') ?? '')}
              onChange={(e) => set('System.Title', e.target.value)}
            />
          </FormField>
          <FormField label="Description" wide>
            <RichTextField
              label="Description"
              html=""
              onChange={(html) => set('System.Description', html)}
            />
          </FormField>
          {byRef.has(PRIORITY) && (
            <FormField label="Priority" htmlFor="create-priority" error={errors[PRIORITY]}>
              <FieldInput
                id="create-priority"
                def={byRef.get(PRIORITY)!}
                value={value(PRIORITY)}
                onChange={(v) => set(PRIORITY, v)}
              />
            </FormField>
          )}
          <FormField label="Tags" htmlFor="create-tags">
            <input
              id="create-tags"
              className="input"
              placeholder="Separate tags with ;"
              value={String(value('System.Tags') ?? '')}
              onChange={(e) => set('System.Tags', e.target.value)}
            />
          </FormField>
          {(['System.AreaPath', 'System.IterationPath'] as const).map((ref) =>
            byRef.has(ref) ? (
              <FormField
                key={ref}
                label={byRef.get(ref)!.name}
                htmlFor={`create-${ref}`}
                error={errors[ref]}
              >
                <FieldInput
                  id={`create-${ref}`}
                  def={byRef.get(ref)!}
                  value={value(ref)}
                  onChange={(v) => set(ref, v)}
                  options={
                    ref === 'System.AreaPath'
                      ? (areas.data ?? [])
                      : (iterations.data ?? []).map((i) => i.path)
                  }
                />
              </FormField>
            ) : null,
          )}
          {extras.map((d) => (
            <FormField
              key={d.referenceName}
              label={d.name}
              htmlFor={`create-${d.referenceName}`}
              error={errors[d.referenceName]}
            >
              <FieldInput
                id={`create-${d.referenceName}`}
                def={d}
                value={value(d.referenceName)}
                invalid={!!errors[d.referenceName]}
                onChange={(v) => set(d.referenceName, v)}
              />
            </FormField>
          ))}
        </div>
        {request.state && <p className="muted-text">Starts in the {request.state} state.</p>}
        {failure && (
          <p role="alert" className="notice notice-error">
            {failure.code === 'UNKNOWN_OUTCOME'
              ? 'Eruza lost contact while creating the item. It may already exist. Check before creating it again.'
              : failure.message}
          </p>
        )}
        <div className="dialog-actions">
          <Button type="button" variant="ghost" onClick={() => dialog.current?.close()}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending || !defs.data}>
            {create.isPending ? 'Creating…' : 'Create'}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
