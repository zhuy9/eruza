import { createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router';
import { AppShell } from './components/app-shell';
import { MeetingView, WorkspaceView } from './routes/workspace';

const rootRoute = createRootRoute({ component: AppShell });
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
export const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, boardRoute, gridRoute]),
});
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
