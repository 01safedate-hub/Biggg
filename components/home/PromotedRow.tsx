'use client';

import type {Restaurant} from '@/types/database';

interface PromotedRowProps {
  restaurants: Restaurant[];
  onSelect: (slug: string) => void;
}

export function PromotedRow({restaurants, onSelect}: PromotedRowProps) {
  if (restaurants.length === 0) return null;

  return (
    <div className="mt-6">
      <div className="flex justify-between items-baseline mb-3">
        <h2 className="font-display text-[15px] font-semibold">Promoted near you</h2>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
        {restaurants.map((r) => (
          <button
            key={r.id}
            onClick={() => onSelect(r.slug)}
            className="flex-shrink-0 w-[150px] text-left"
          >
            <div className="w-[150px] h-[100px] rounded-xl bg-gradient-to-br from-peach to-[#FFD9B3] relative overflow-hidden mb-2">
              <span className="absolute top-2 left-2 bg-orange text-white text-[9px] font-bold px-2 py-0.5 rounded-full">
                Promoted
              </span>
            </div>
            <div className="font-semibold text-[12.5px] text-ink">{r.name}</div>
            <div className="text-[10.5px] text-gray">
              {r.category} · {r.delivery_time_min}-{r.delivery_time_max} min
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
