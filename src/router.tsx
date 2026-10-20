import { createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router';
import { AppShell } from './components/app-shell';
import { ItemPage } from './routes/item-page';
import { MeetingView, WorkspaceView } from './routes/workspace';

const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined);
const itemId = (value: unknown) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : undefined;
};

const rootRoute = createRootRoute({
  component: AppShell,
  validateSearch: (
    search: Record<string, unknown>,
  ): { project?: string; team?: string; sprint?: string; item?: number } => ({
    project: text(search.project),
    team: text(search.team),
    sprint: text(search.sprint),
    item: itemId(search.item),
  }),
});
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/board' });
  },
});
const boardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/board',
  component: () => (
    <WorkspaceView
      title="Board"
      description="A little less noise. A clearer view of what's moving."
    />
  ),
});
const gridRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/grid',
  validateSearch: (search: Record<string, unknown>): { grouping: 'person' | 'story' } => ({
    grouping: search.grouping === 'story' ? 'story' : 'person',
  }),
  component: MeetingView,
});
const itemRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/items/$id',
  component: ItemPage,
});
export const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, boardRoute, gridRoute, itemRoute]),
});
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
