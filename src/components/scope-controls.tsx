import { useNavigate } from '@tanstack/react-router';
import { useScope, type ScopeSearch } from '../lib/scope';
import { sprintOptions } from '../lib/sprints';

function useSetScope() {
  const navigate = useNavigate();
  return (change: ScopeSearch) =>
    void navigate({ to: '.', search: (prev: ScopeSearch) => ({ ...prev, ...change }) });
}

export function ProjectTeamControls() {
  const { projects, project, teams, team } = useScope();
  const setScope = useSetScope();
  return (
    <div className="scope-controls">
      <label htmlFor="project-select">Project</label>
      <select
        id="project-select"
        className="select"
        value={project?.id ?? ''}
        disabled={!projects.data}
        onChange={(e) => setScope({ project: e.target.value, team: undefined, sprint: undefined })}
      >
        {projects.data?.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <label htmlFor="team-select">Team</label>
      <select
        id="team-select"
        className="select"
        value={team?.id ?? ''}
        disabled={!teams.data}
        onChange={(e) => setScope({ team: e.target.value, sprint: undefined })}
      >
        {teams.data?.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SprintControl() {
  const { iterations, sprint } = useScope();
  const setScope = useSetScope();
  return (
    <label className="sprint-control">
      <span>Sprint</span>
      <select
        className="select"
        value={sprint && 'path' in sprint ? sprint.path : ''}
        disabled={!iterations.data}
        onChange={(e) => setScope({ sprint: e.target.value })}
      >
        {(!sprint || 'problem' in sprint) && (
          <option value="" disabled>
            Choose a sprint
          </option>
        )}
        {sprintOptions(iterations.data ?? []).map((i) => (
          <option key={i.id} value={i.path}>
            {i.timeFrame === 'current' ? `${i.name} (current)` : i.name}
          </option>
        ))}
      </select>
    </label>
  );
}
