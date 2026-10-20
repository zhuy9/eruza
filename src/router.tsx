import { createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router';
import { AppShell } from './components/app-shell';
import { ItemPage } from './routes/item-page';
import { BoardView } from './features/board/board';
import { MeetingGrid } from './features/grid/grid';
import type { ViewSearch } from './lib/scope';

// Search values arrive JSON-parsed, so a numeric text search comes back as a number.
const text = (value: unknown) =>
  typeof value === 'number'
    ? String(value)
    : typeof value === 'string' && value
      ? value
      : undefined;
const texts = (value: unknown) =>
  Array.isArray(value) && value.length
    ? value.filter((v): v is string => typeof v === 'string')
    : undefined;
const itemId = (value: unknown) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : undefined;
};

const rootRoute = createRootRoute({
  component: AppShell,
  validateSearch: (search: Record<string, unknown>): ViewSearch & { item?: number } => ({
    project: text(search.project),
    team: text(search.team),
    sprint: text(search.sprint),
    assignee: text(search.assignee),
    area: text(search.area),
    tags: texts(search.tags),
    text: text(search.text),
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
  validateSearch: (search: Record<string, unknown>): { type?: string } => ({
    type: text(search.type),
  }),
  component: BoardView,
});
const gridRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/grid',
  validateSearch: (search: Record<string, unknown>): { grouping: 'person' | 'story' } => ({
    grouping: search.grouping === 'story' ? 'story' : 'person',
  }),
  component: MeetingGrid,
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
