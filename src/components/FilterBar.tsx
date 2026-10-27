import { ListFilter, X } from 'lucide-react'
import { EMPTY_FILTERS, PLATFORMS, PROGRAMS, STATUSES, type PostFilters } from '../types'
import { hasActiveFilters } from '../utils/posts'

interface FilterBarProps {
  filters: PostFilters
  onChange: (filters: PostFilters) => void
  shown: number
  total: number
}

export function FilterBar({ filters, onChange, shown, total }: FilterBarProps) {
  const active = hasActiveFilters(filters)

  return (
    <div className="filter-bar" role="search" aria-label="Filter posts">
      <span className="filter-bar-icon" aria-hidden="true">
        <ListFilter />
      </span>
      <label className="filter-field">
        <span>Program</span>
        <select
          value={filters.program}
          className={filters.program !== 'All' ? 'is-set' : undefined}
          onChange={(e) => onChange({ ...filters, program: e.target.value as PostFilters['program'] })}
        >
          <option value="All">All programs</option>
          {PROGRAMS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label className="filter-field">
        <span>Status</span>
        <select
          value={filters.status}
          className={filters.status !== 'All' ? 'is-set' : undefined}
          onChange={(e) => onChange({ ...filters, status: e.target.value as PostFilters['status'] })}
        >
          <option value="All">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="filter-field">
        <span>Platform</span>
        <select
          value={filters.platform}
          className={filters.platform !== 'All' ? 'is-set' : undefined}
          onChange={(e) => onChange({ ...filters, platform: e.target.value as PostFilters['platform'] })}
        >
          <option value="All">All platforms</option>
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <div className="filter-summary">
        <span>{active ? `Showing ${shown} of ${total}` : `${total} posts`}</span>
        {active && (
          <button type="button" className="link-button" onClick={() => onChange(EMPTY_FILTERS)}>
            <X aria-hidden="true" />
            Clear filters
          </button>
        )}
      </div>
    </div>
  )
}
