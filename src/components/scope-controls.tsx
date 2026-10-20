import { useScope, useSetSearch } from '../lib/scope';
import { sprintOptions } from '../lib/sprints';

export function ProjectTeamControls() {
  const { projects, project, teams, team } = useScope();
  const setScope = useSetSearch();
  return (
    <div className="scope-controls">
      <label htmlFor="project-select">Project</label>
      <select
        id="project-select"
        className="select"
        value={project?.id ?? ''}
        disabled={!projects.data}
        onChange={(e) =>
          // Team-specific choices do not carry over to another project.
          setScope({
            project: e.target.value,
            team: undefined,
            sprint: undefined,
            assignee: undefined,
            area: undefined,
            tags: undefined,
            type: undefined,
          })
        }
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
        onChange={(e) =>
          setScope({
            team: e.target.value,
            sprint: undefined,
            assignee: undefined,
            area: undefined,
          })
        }
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
  const setScope = useSetSearch();
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
