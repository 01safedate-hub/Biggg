'use client';

import {useState, useCallback} from 'react';

interface SearchResult {
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
}

interface SearchOptions {
  sortBy?: 'distance' | 'rating';
  filterUnder20Min?: boolean;
  filterOpenNow?: boolean;
}

export function useSearch() {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<SearchOptions>({});
  const [hasSearched, setHasSearched] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const search = useCallback((q: string) => {
    setQuery(q);
    setHasSearched(true);
  }, []);

  const setSortBy = useCallback((sortBy: SearchOptions['sortBy']) => {
    setOptions((prev) => ({...prev, sortBy}));
  }, []);

  const setFilterUnder20Min = useCallback((value: boolean) => {
    setOptions((prev) => ({...prev, filterUnder20Min: value}));
  }, []);

  const setFilterOpenNow = useCallback((value: boolean) => {
    setOptions((prev) => ({...prev, filterOpenNow: value}));
  }, []);

  return {
    query,
    isLoading,
    error: null,
    hasSearched,
    search,
    setSortBy,
    setFilterUnder20Min,
    setFilterOpenNow,
    options,
  };
}
