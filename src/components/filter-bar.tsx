import * as Popover from '@radix-ui/react-popover';
import { UNASSIGNED, useFilters } from '../lib/filters';
import { useSetSearch } from '../lib/scope';
import { Button } from './ui/button';

/** Shared filters for board and grid. `tags` are the tags found in the current sprint. */
export function FilterBar({ tags }: { tags: string[] }) {
  const { values, members, areaOptions, problems } = useFilters();
  const setSearch = useSetSearch();
  const selectedTags = values.tags ?? [];
  const allTags = [...new Set([...tags, ...selectedTags])].sort((a, b) => a.localeCompare(b));
  const active = values.assignee || values.area || selectedTags.length || values.text;

  const toggleTag = (tag: string) => {
    const next = selectedTags.includes(tag)
      ? selectedTags.filter((t) => t !== tag)
      : [...selectedTags, tag];
    setSearch({ tags: next.length ? next : undefined });
  };

  return (
    <>
      <div className="filter-bar" role="group" aria-label="Filters">
        <label className="inline-control">
          Assignee
          <select
            className="select"
            value={values.assignee ?? ''}
            onChange={(e) => setSearch({ assignee: e.target.value || undefined })}
          >
            <option value="">Anyone</option>
            <option value={UNASSIGNED}>Unassigned</option>
            {values.assignee &&
              values.assignee !== UNASSIGNED &&
              !members.some((m) => m.id === values.assignee) && (
                <option value={values.assignee}>Selected assignee</option>
              )}
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-control">
          Area
          <select
            className="select"
            value={values.area ?? ''}
            onChange={(e) => setSearch({ area: e.target.value || undefined })}
          >
            <option value="">All team areas</option>
            {values.area && !areaOptions.includes(values.area) && (
              <option value={values.area}>{values.area}</option>
            )}
            {areaOptions.map((path) => (
              <option key={path} value={path}>
                {path}
              </option>
            ))}
          </select>
        </label>
        <Popover.Root>
          <Popover.Trigger className="picker-trigger filter-tags">
            {selectedTags.length ? `Tags: ${selectedTags.join(', ')}` : 'Tags'}
          </Popover.Trigger>
          <Popover.Content className="popover tag-popover" align="start" sideOffset={4}>
            {allTags.length === 0 && <p className="command-note">No tags in this sprint.</p>}
            {allTags.map((tag) => (
              <label key={tag} className="check-row">
                <input
                  type="checkbox"
                  checked={selectedTags.includes(tag)}
                  onChange={() => toggleTag(tag)}
                />
                {tag}
              </label>
            ))}
          </Popover.Content>
        </Popover.Root>
        <input
          type="search"
          className="input filter-search"
          aria-label="Search by ID or title"
          placeholder="Search by ID or title"
          value={values.text ?? ''}
          onChange={(e) => setSearch({ text: e.target.value || undefined }, true)}
        />
        {active && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setSearch({ assignee: undefined, area: undefined, tags: undefined, text: undefined })
            }
          >
            Clear filters
          </Button>
        )}
      </div>
      {problems.map((problem) => (
        <p key={problem} role="alert" className="notice notice-error">
          {problem}
        </p>
      ))}
    </>
  );
}
