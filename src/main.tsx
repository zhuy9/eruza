import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { TooltipProvider } from './components/ui/tooltip';
import { ApiRequestError } from './lib/api';
import { sessionQuery } from './lib/queries';
import { router } from './router';
import './styles.css';

document.documentElement.classList.toggle('dark', localStorage.getItem('eruza-theme') === 'dark');
const queryClient = new QueryClient({
  // A sign-in failure on any read refreshes the session, which shows the login banner.
  queryCache: new QueryCache({
    onError: (error) => {
      const code = error instanceof ApiRequestError ? error.error.code : null;
      if (code === 'AUTH_REQUIRED' || code === 'CLI_UNAVAILABLE') {
        void queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey });
      }
    },
  }),
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* One provider, so moving between tooltips shows the next one at once. */}
      <TooltipProvider delayDuration={300}>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
