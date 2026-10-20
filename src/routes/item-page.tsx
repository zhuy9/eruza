import { getRouteApi } from '@tanstack/react-router';
import { WorkItemEditor } from '../features/work-items/work-item-editor';

const itemRoute = getRouteApi('/items/$id');

export function ItemPage() {
  const { id } = itemRoute.useParams();
  const itemId = Number(id);
  return (
    <section className="workspace-view item-page">
      {Number.isInteger(itemId) && itemId > 0 ? (
        <WorkItemEditor id={itemId} variant="page" />
      ) : (
        <p role="alert" className="notice notice-error">
          This work item ID is not valid.
        </p>
      )}
    </section>
  );
}
