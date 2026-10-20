import type { WorkItemList } from '../../shared/contracts';
import type { SprintChoice } from '../lib/sprints';

const SPRINT_PROBLEMS = {
  none: 'This team has no current sprint. Choose a sprint above.',
  ambiguous: 'More than one sprint is current. Choose a sprint above.',
};

/** Sprint problems, load errors, and incomplete or partly unreadable results. */
export function ListNotices(props: {
  sprint?: SprintChoice;
  error: Error | null;
  data?: WorkItemList;
  loading: boolean;
}) {
  const { sprint, error, data } = props;
  return (
    <>
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
      {props.loading && (
        <p role="status" className="empty-state">
          Loading work items…
        </p>
      )}
    </>
  );
}
