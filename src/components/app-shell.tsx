import { Link, Outlet, useSearch } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Columns3, ListTree, Moon, Plus, Sun, UsersRound } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { CommandPalette } from './command-palette';
import { Button } from './ui/button';
import { LoginBanner } from './login-banner';
import { ProjectTeamControls, SprintControl } from './scope-controls';
import { CreateContext, type CreateRequest } from '../features/work-items/create';
import { CreateDialog } from '../features/work-items/create-dialog';
import { DetailPanel } from '../features/work-items/detail-panel';
import { sessionQuery } from '../lib/queries';
import { inDialog, isShortcut } from '../lib/keys';
import { keepView, useScope } from '../lib/scope';
import { ToastContext } from '../lib/toast';

const TOAST_MS = 6000;

export function AppShell() {
  const session = useQuery(sessionQuery);
  const { project, team } = useScope();
  const { item } = useSearch({ from: '__root__' });
  // Each open gets a new key, so a C pressed while the last dialog is still closing
  // starts a fresh dialog instead of reusing the one whose close event is pending.
  const [create, setCreate] = useState<{ request: CreateRequest; key: number } | null>(null);
  const setCreateRequest = useCallback(
    (request: CreateRequest | null) =>
      setCreate((old) => request && { request, key: (old?.key ?? 0) + 1 }),
    [],
  );
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);
  const toast = useCallback((message: string) => {
    const id = Math.random();
    setToasts((current) => [...current, { id, message }]);
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), TOAST_MS);
  }, []);

  // C opens the create form; Ctrl/Cmd+K opens the palette. Neither fires inside a dialog.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'k' &&
        !inDialog(event.target)
      ) {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      } else if (isShortcut(event, 'c')) {
        event.preventDefault();
        setCreateRequest({});
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setCreateRequest]);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('eruza-theme', next ? 'dark' : 'light');
  }

  return (
    <ToastContext.Provider value={toast}>
      <CreateContext.Provider value={(request = {}) => setCreateRequest(request)}>
        <div className="app-layout">
          <a className="skip-link" href="#content">
            Skip to content
          </a>
          <aside className="sidebar">
            <Link to="/board" search={keepView} className="brand">
              <span className="brand-mark" aria-hidden="true">
                e
              </span>
              <span>
                eruza<span className="brand-dot">.</span>
              </span>
            </Link>
            <div className="workspace-label">WORKSPACE</div>
            <ProjectTeamControls />
            <nav aria-label="Workspace views">
              <Link to="/board" search={keepView} className="nav-link">
                <Columns3 size={17} />
                Board
              </Link>
              <div className="nav-section">SPRINT MEETINGS</div>
              <Link
                to="/grid"
                search={(prev) => ({ ...keepView(prev), grouping: 'person' as const })}
                className="nav-link"
                activeOptions={{ includeSearch: true }}
              >
                <UsersRound size={17} />
                Sprint update
              </Link>
              <Link
                to="/grid"
                search={(prev) => ({ ...keepView(prev), grouping: 'story' as const })}
                className="nav-link"
                activeOptions={{ includeSearch: true }}
              >
                <ListTree size={17} />
                Sprint retro
              </Link>
            </nav>
            <div className="sidebar-footer">
              <div className="user-avatar">{session.data?.user?.displayName.charAt(0) ?? '·'}</div>
              <div className="user-label">
                {session.data?.user?.displayName ?? 'Connecting…'}
                <small>{session.data?.mode === 'mock' ? 'Sample data' : 'Azure DevOps'}</small>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                aria-label="Toggle dark mode"
                aria-pressed={dark}
              >
                {dark ? <Sun size={16} /> : <Moon size={16} />}
              </Button>
            </div>
          </aside>
          <div className="workspace-main">
            <header className="topbar">
              <span>
                {project?.name ?? 'Projects'} <span className="breadcrumb-divider">/</span>{' '}
                {team?.name ?? 'Teams'}
              </span>
              <div className="topbar-actions">
                <SprintControl />
                <Button size="sm" onClick={() => setCreateRequest({})}>
                  <Plus size={14} />
                  New
                </Button>
                {session.data?.mode === 'mock' && (
                  <span className="mode-badge">
                    <span />
                    Mock mode
                  </span>
                )}
              </div>
            </header>
            <main id="content" tabIndex={-1}>
              {session.data?.status === 'error' && <LoginBanner session={session.data} />}
              {session.isError ? (
                <div role="alert" className="error-box">
                  Could not reach the local Eruza server.
                  <Button variant="outline" onClick={() => void session.refetch()}>
                    Try again
                  </Button>
                </div>
              ) : (
                <Outlet />
              )}
            </main>
            {item && <DetailPanel id={item} />}
          </div>
          {create && (
            <CreateDialog
              key={create.key}
              request={create.request}
              onClose={() => setCreateRequest(null)}
            />
          )}
          <CommandPalette
            open={paletteOpen}
            onOpenChange={setPaletteOpen}
            onCreate={setCreateRequest}
          />
          <div className="toasts" role="status" aria-live="polite">
            {toasts.map((t) => (
              <div key={t.id} className="toast">
                {t.message}
              </div>
            ))}
          </div>
        </div>
      </CreateContext.Provider>
    </ToastContext.Provider>
  );
}
