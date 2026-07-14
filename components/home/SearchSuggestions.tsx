'use client';

interface SearchSuggestionsProps {
  visible: boolean;
  onSearch: (query: string) => void;
}

const suggestions = [
  'Jollof Rice',
  'Suya',
  'Shawarma',
  'Small Chops',
  'Amala',
  'Pepper Soup',
  'Zobo',
];

export function SearchSuggestions({visible, onSearch}: SearchSuggestionsProps) {
  return (
    <div
      className={`overflow-hidden transition-all duration-200 ${
        visible ? 'max-h-40 opacity-100 mt-2.5' : 'max-h-0 opacity-0'
      }`}
    >
      <div className="text-xxs text-gray uppercase tracking-wide mb-2">
        Popular searches
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((term) => (
          <button
            key={term}
            onMouseDown={() => onSearch(term)}
            className="px-3 py-1.5 rounded-full bg-white border border-line text-ink text-[11.5px] font-medium hover:border-orange hover:text-orange-dark transition-colors"
          >
            {term}
          </button>
        ))}
      </div>
    </div>
  );
}
