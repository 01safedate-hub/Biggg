'use client';

import type {Restaurant} from '@/types/database';

interface SearchResultsProps {
  results: {
    id: string;
    name: string;
    slug: string;
    rating: number;
    zone: string;
    deliveryTimeMin: number;
    deliveryTimeMax: number;
    isOpen: boolean;
    matchName: string;
    matchPrice: number;
    distance: number;
  }[];
  query: string;
  sortBy?: 'distance' | 'rating';
  filterUnder20Min?: boolean;
  filterOpenNow?: boolean;
  onSortChange: (sort: 'distance' | 'rating' | undefined) => void;
  onFilterChange: (filter: 'under20' | 'open', value: boolean) => void;
  onSelect: (slug: string) => void;
  onBack: () => void;
}

export function SearchResults({
  results,
  query,
  sortBy,
  filterUnder20Min,
  filterOpenNow,
  onSortChange,
  onFilterChange,
  onSelect,
  onBack,
}: SearchResultsProps) {
  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-2.5 mb-4 text-gray"
      >
        <span className="text-base">←</span>
        <span className="text-[12.5px]">Back to home</span>
      </button>

      <div className="flex items-center gap-2 bg-peach rounded-xl px-3 py-3 mb-3">
        <span>🔍</span>
        <input
          type="text"
          defaultValue={query}
          className="w-full bg-transparent outline-none text-ink text-[13px]"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide mb-3">
        <button
          onClick={() => onSortChange(sortBy === 'distance' ? undefined : 'distance')}
          className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full border text-[11.5px] font-medium transition-colors ${
            sortBy === 'distance'
              ? 'bg-peach border-orange text-orange-dark'
              : 'border-line text-gray'
          }`}
        >
          📍 Closest to me
        </button>
        <button
          onClick={() => onSortChange(sortBy === 'rating' ? undefined : 'rating')}
          className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full border text-[11.5px] font-medium transition-colors ${
            sortBy === 'rating'
              ? 'bg-peach border-orange text-orange-dark'
              : 'border-line text-gray'
          }`}
        >
          ⭐ Top rated
        </button>
        <button
          onClick={() => onFilterChange('under20', !filterUnder20Min)}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full border text-[11.5px] font-medium transition-colors ${
            filterUnder20Min
              ? 'bg-peach border-orange text-orange-dark'
              : 'border-line text-gray'
          }`}
        >
          Under 20 min
        </button>
        <button
          onClick={() => onFilterChange('open', !filterOpenNow)}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full border text-[11.5px] font-medium transition-colors ${
            filterOpenNow
              ? 'bg-peach border-orange text-orange-dark'
              : 'border-line text-gray'
          }`}
        >
          Open now
        </button>
      </div>

      <div className="text-[11.5px] text-gray mb-3">
        <b className="text-ink">{results.length}</b> results for "{query}"
      </div>

      <div className="divide-y divide-line">
        {results.map((r) => (
          <button
            key={r.id}
            onClick={() => onSelect(r.slug)}
            className="flex gap-3 items-center py-3 w-full text-left"
          >
            <div className="w-14 h-14 rounded-[10px] bg-gradient-to-br from-[#FFE3C7] to-peach flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[13px] text-ink">{r.name}</div>
              <div className="flex gap-1.5 items-center text-[11px] text-gray">
                <span className="text-orange font-semibold">{r.rating}</span>
                <span className="w-[3px] h-[3px] rounded-full bg-line" />
                <span>{r.distance.toFixed(1)} km</span>
                <span className="w-[3px] h-[3px] rounded-full bg-line" />
                <span>{r.deliveryTimeMin} min</span>
                {!r.isOpen && (
                  <>
                    <span className="w-[3px] h-[3px] rounded-full bg-line" />
                    <span className="text-red font-semibold">Closed</span>
                  </>
                )}
              </div>
              <div className="text-[10.5px] text-orange-dark mt-0.5">
                {r.matchName} · ₦{r.matchPrice.toLocaleString()}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
