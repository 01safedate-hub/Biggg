'use client';

import type {Restaurant} from '@/types/database';

interface RestaurantListProps {
  restaurants: Restaurant[];
  onSelect: (slug: string) => void;
  title?: string;
  showLink?: boolean;
}

export function RestaurantList({
  restaurants,
  onSelect,
  title = 'All restaurants',
  showLink = true,
}: RestaurantListProps) {
  if (restaurants.length === 0) return null;

  return (
    <div className="mt-6">
      <div className="flex justify-between items-baseline mb-3">
        <h2 className="font-display text-[15px] font-semibold">{title}</h2>
        {showLink && (
          <button className="text-[11px] text-orange font-semibold">
            See all
          </button>
        )}
      </div>
      <div className="divide-y divide-line">
        {restaurants.map((r) => (
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
                <span>
                  {r.delivery_time_min}–{r.delivery_time_max} min
                </span>
                <span className="w-[3px] h-[3px] rounded-full bg-line" />
                <span>{r.zone}</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
