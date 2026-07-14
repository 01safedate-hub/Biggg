'use client';

import {useState} from 'react';
import {Search} from 'lucide-react';

interface SearchBarProps {
  onSearch: (query: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

export function SearchBar({onSearch, onFocus, onBlur}: SearchBarProps) {
  const [value, setValue] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && value.trim()) {
      onSearch(value.trim());
    }
  };

  return (
    <div className="flex items-center gap-2 bg-peach rounded-xl px-3 py-3">
      <Search className="w-4 h-4 text-[#B79C82]" />
      <input
        type="text"
        placeholder="What are you craving?"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        className="w-full bg-transparent outline-none text-ink text-[13px] placeholder:text-[#B79C82]"
      />
    </div>
  );
}
