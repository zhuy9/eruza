import { Link, Outlet } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Columns3, ListTree, Moon, Sun, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { Button } from './ui/button';
import { projectsQuery, sessionQuery } from '../lib/queries';

export function AppShell() {
  const session = useQuery(sessionQuery);
  const projects = useQuery(projectsQuery);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('eruza-theme', next ? 'dark' : 'light');
  }

  return (
    <div className="app-layout">
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link to="/board" className="brand" aria-label="Eruza home">
          <span className="brand-mark" aria-hidden="true">
            e
          </span>
          <span>
            eruza<span className="brand-dot">.</span>
          </span>
        </Link>
        <div className="workspace-label">WORKSPACE</div>
        <div className="project-name">{projects.data?.[0]?.name ?? 'Loading workspace…'}</div>
        <nav aria-label="Workspace views">
          <Link to="/board" className="nav-link">
            <Columns3 size={17} />
            Board
          </Link>
          <div className="nav-section">SPRINT MEETINGS</div>
          <Link
            to="/grid"
            search={{ grouping: 'person' }}
            className="nav-link"
            activeOptions={{ includeSearch: true }}
          >
            <UsersRound size={17} />
            Sprint update
          </Link>
          <Link
            to="/grid"
            search={{ grouping: 'story' }}
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
            <small>Personal workspace</small>
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
            Workspace <span className="breadcrumb-divider">/</span>{' '}
            {projects.data?.[0]?.name ?? 'Projects'}
          </span>
          {session.data?.mode === 'mock' && (
            <span className="mode-badge">
              <span />
              Mock mode
            </span>
          )}
        </header>
        <main id="content" tabIndex={-1}>
          {session.isError || projects.isError ? (
            <div role="alert" className="error-box">
              Could not load the workspace.
              <Button
                variant="outline"
                onClick={() => {
                  void session.refetch();
                  void projects.refetch();
                }}
              >
                Try again
              </Button>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </div>
  );
}
