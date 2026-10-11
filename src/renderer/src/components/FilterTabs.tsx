import type { Platform } from '../../../shared/types';
import { ROOT_FILTERS, type RootFilter } from '../root-search';
import { Keycaps } from './Keycaps';

interface FilterTabsProps {
  value: RootFilter;
  /** Matches per tab; hidden when there's nothing typed. */
  counts: Record<RootFilter, number> | null;
  platform: Platform;
  onChange(filter: RootFilter): void;
}

/** What the root search looks through: everything, or one kind of thing. Tab cycles. */
export function FilterTabs({ value, counts, platform, onChange }: FilterTabsProps) {
  return (
    <div className="filters">
      <div className="filters__tabs" role="tablist" aria-label="Show">
        {ROOT_FILTERS.map((filter) => (
          <button
            key={filter.id}
            type="button"
            role="tab"
            tabIndex={-1}
            aria-selected={filter.id === value}
            className="filters__tab"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onChange(filter.id)}
          >
            {filter.label}
            {counts && <span className="filters__count">{counts[filter.id]}</span>}
          </button>
        ))}
      </div>
      <span className="filters__hint">
        <Keycaps keys={[platform === 'darwin' ? '⇥' : 'Tab']} />
        to switch
      </span>
    </div>
  );
}
