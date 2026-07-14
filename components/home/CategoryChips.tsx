'use client';

interface CategoryChipsProps {
  active: string;
  onChange: (category: string) => void;
}

const categories = [
  'All',
  'Local & Native',
  'Fast food',
  'Drinks & snacks',
  'Home kitchens',
];

export function CategoryChips({active, onChange}: CategoryChipsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 mt-4 scrollbar-hide">
      {categories.map((cat) => (
        <button
          key={cat}
          onClick={() => onChange(cat)}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full border text-[11.5px] font-medium transition-colors ${
            active === cat
              ? 'bg-ink text-white border-ink'
              : 'border-line text-gray hover:border-ink hover:text-ink'
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}
