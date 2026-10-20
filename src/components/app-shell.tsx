import { Link, Outlet, useSearch } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Columns3, ListTree, Moon, Plus, Sun, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { Button } from './ui/button';
import { LoginBanner } from './login-banner';
import { ProjectTeamControls, SprintControl } from './scope-controls';
import { CreateContext, type CreateRequest } from '../features/work-items/create';
import { CreateDialog } from '../features/work-items/create-dialog';
import { DetailPanel } from '../features/work-items/detail-panel';
import { sessionQuery } from '../lib/queries';
import { useScope, type ScopeSearch } from '../lib/scope';

const keepScope = ({ project, team, sprint }: ScopeSearch) => ({ project, team, sprint });

export function AppShell() {
  const session = useQuery(sessionQuery);
  const { project, team } = useScope();
  const { item } = useSearch({ from: '__root__' });
  const [createRequest, setCreateRequest] = useState<CreateRequest | null>(null);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('eruza-theme', next ? 'dark' : 'light');
  }

  return (
    <CreateContext.Provider value={(request = {}) => setCreateRequest(request)}>
      <div className="app-layout">
        <a className="skip-link" href="#content">
          Skip to content
        </a>
        <aside className="sidebar">
          <Link to="/board" search={keepScope} className="brand" aria-label="Eruza home">
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
            <Link to="/board" search={keepScope} className="nav-link">
              <Columns3 size={17} />
              Board
            </Link>
            <div className="nav-section">SPRINT MEETINGS</div>
            <Link
              to="/grid"
              search={(prev) => ({ ...keepScope(prev), grouping: 'person' as const })}
              className="nav-link"
              activeOptions={{ includeSearch: true }}
            >
              <UsersRound size={17} />
              Sprint update
            </Link>
            <Link
              to="/grid"
              search={(prev) => ({ ...keepScope(prev), grouping: 'story' as const })}
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
        {createRequest && (
          <CreateDialog request={createRequest} onClose={() => setCreateRequest(null)} />
        )}
      </div>
    </CreateContext.Provider>
  );
}
