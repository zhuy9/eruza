import { useScope, useSetSearch } from '../lib/scope';
import { sprintOptions } from '../lib/sprints';
import { NativeSelect } from './ui/native-select';

export function ProjectTeamControls() {
  const { projects, project, teams, team } = useScope();
  const setScope = useSetSearch();
  return (
    <div className="scope-controls">
      <label htmlFor="project-select">Project</label>
      <NativeSelect
        id="project-select"
        className="w-full"
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
      </NativeSelect>
      <label htmlFor="team-select">Team</label>
      <NativeSelect
        id="team-select"
        className="w-full"
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
      </NativeSelect>
    </div>
  );
}

export function SprintControl() {
  const { iterations, sprint } = useScope();
  const setScope = useSetSearch();
  return (
    <label className="sprint-control">
      <span>Sprint</span>
      <NativeSelect
        className="min-w-[170px]"
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
      </NativeSelect>
    </label>
  );
}
