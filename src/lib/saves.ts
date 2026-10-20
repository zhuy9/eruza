import {
  useMutation,
  useMutationState,
  useQueryClient,
  type Mutation,
  type QueryClient,
} from '@tanstack/react-query';
import {
  workItemDetailSchema,
  workItemSchema,
  type FieldValue,
  type WorkItemDetail,
  type WorkItemList,
  type WorkItemSummary,
  type WorkItemView,
} from '../../shared/contracts';
import { apiError, sendJson } from './api';
import { workItemQuery } from './queries';

export type FieldChanges = Record<string, FieldValue>;
/** A field save. `baseRev` is the revision the user was looking at when the edit began. */
export type Save = { fields: FieldChanges; baseRev: number };

/** Our own successful saves per item: revision before → revision after. */
const ownSaves = new Map<number, Map<number, number>>();

/**
 * The revision to send for an edit that began at `baseRev`. It follows only our own
 * saves forward, so a change made elsewhere still fails the /rev test as a conflict.
 */
export function expectedRev(id: number, baseRev: number) {
  const chain = ownSaves.get(id);
  let rev = baseRev;
  while (chain?.has(rev)) rev = chain.get(rev)!;
  return rev;
}

export function recordSave(id: number, from: number, to: number) {
  if (!ownSaves.has(id)) ownSaves.set(id, new Map());
  ownSaves.get(id)!.set(from, to);
}

type SaveState = {
  save: Save;
  status: string;
  error: unknown;
  submittedAt: number;
  mutation?: Mutation<unknown, unknown, unknown>;
};
export type Pending = Omit<SaveState, 'submittedAt' | 'status'> & {
  value: FieldValue;
  status: 'pending' | 'error';
};

/**
 * Values to show over server data: the latest unsaved or failed value per field.
 * A later successful save of a field clears older failures of that field.
 */
export function pendingOverlay(saves: SaveState[]): Record<string, Pending> {
  const out: Record<string, Pending> = {};
  for (const state of [...saves].sort((a, b) => a.submittedAt - b.submittedAt)) {
    for (const [field, value] of Object.entries(state.save.fields)) {
      if (state.status === 'success') delete out[field];
      else {
        out[field] = {
          value,
          status: state.status as Pending['status'],
          error: state.error,
          save: state.save,
          mutation: state.mutation,
        };
      }
    }
  }
  return out;
}

/** Writes a saved item into every cache that shows it. */
export function applySaved(queryClient: QueryClient, item: WorkItemDetail) {
  queryClient.setQueryData<WorkItemView>(workItemQuery(item.id).queryKey, (view) =>
    view ? { ...view, item } : view,
  );
  const summary = workItemSchema.parse(item);
  const swap = <T extends { id: number }>(list: T[]) =>
    list.map((entry) => (entry.id === item.id ? { ...entry, ...summary } : entry));
  queryClient.setQueriesData<WorkItemList>({ queryKey: ['work-items'] }, (list) =>
    list ? { ...list, items: swap(list.items), ancestors: swap(list.ancestors) } : list,
  );
  void queryClient.invalidateQueries({ queryKey: ['work-items'] });
}

const scope = (id: number) => ({ id: `item-${id}` });

/** Sends a write for an edit that began at `baseRev`, and records the revision it produced. */
async function writeAtRev(id: number, baseRev: number, method: string, path: string, body: object) {
  const rev = expectedRev(id, baseRev);
  const item = await sendJson(method, path, { ...body, expectedRev: rev }, workItemDetailSchema);
  recordSave(id, rev, item.rev);
  return item;
}

/** Refetches the item when the outcome is a conflict or unknown, keeping the draft. */
function recheck(queryClient: QueryClient, id: number, error: unknown) {
  const { code } = apiError(error);
  if (code === 'CONFLICT' || code === 'UNKNOWN_OUTCOME') {
    void queryClient.invalidateQueries({ queryKey: workItemQuery(id).queryKey });
  }
}

/** Field saves for one item run one at a time, in order. */
export function useSaveFields(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['save', id],
    scope: scope(id),
    // Failed saves hold the user's draft, so keep them until retried or discarded.
    // ponytail: successful saves also stay until reload; prune them if sessions get long.
    gcTime: Infinity,
    onMutate: () => queryClient.cancelQueries({ queryKey: workItemQuery(id).queryKey }),
    mutationFn: ({ fields, baseRev }: Save) =>
      writeAtRev(id, baseRev, 'PATCH', `/work-items/${id}`, { fields }),
    onSuccess: (item) => applySaved(queryClient, item),
    onError: (error) => recheck(queryClient, id, error),
  });
}

/** `parent` is only for showing the choice before the save finishes. */
type ParentChange = { parentId: number | null; baseRev: number; parent?: WorkItemSummary };

/** Sets, changes, or removes the parent. Shares the item's save queue. */
export function useSetParent(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['parent', id],
    scope: scope(id),
    mutationFn: ({ parentId, baseRev }: ParentChange) =>
      writeAtRev(id, baseRev, 'PUT', `/work-items/${id}/parent`, { parentId }),
    onSuccess: (item) => {
      applySaved(queryClient, item);
      void queryClient.invalidateQueries({ queryKey: ['work-item'] });
    },
    onError: (error) => recheck(queryClient, id, error),
  });
}

/** Unsaved and failed field values for one item, for every view of it. */
export function usePendingFields(id: number) {
  const saves = useMutationState({
    filters: { mutationKey: ['save', id] },
    select: (mutation): SaveState => ({
      save: (mutation.state.variables as Save | undefined) ?? { fields: {}, baseRev: 0 },
      status: mutation.state.status,
      error: mutation.state.error,
      submittedAt: mutation.state.submittedAt,
      mutation: mutation as Mutation<unknown, unknown, unknown>,
    }),
  });
  return pendingOverlay(saves);
}
