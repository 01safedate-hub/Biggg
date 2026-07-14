'use client';

import {useState, Suspense} from 'react';
import {useCart} from '@/hooks/useCart';
import {SearchBar} from '@/components/home/SearchBar';
import {SearchSuggestions} from '@/components/home/SearchSuggestions';
import {CategoryChips} from '@/components/home/CategoryChips';
import {PromotedRow} from '@/components/home/PromotedRow';
import {RestaurantList} from '@/components/home/RestaurantList';
import {SearchResults} from '@/components/home/SearchResults';
import {MenuScreen} from '@/components/home/MenuScreen';
import {OrderTray} from '@/components/home/OrderTray';
import {mockRestaurants, mockMenuItems} from '@/lib/mock-data';
import Link from 'next/link';
import {ArrowLeft} from 'lucide-react';

type View = 'home' | 'search' | 'menu';

function OrderContent() {
  const [view, setView] = useState<View>('home');
  const [category, setCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [sortBy, setSortBy] = useState<'distance' | 'rating' | undefined>();
  const [filterUnder20, setFilterUnder20] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedRestaurantSlug, setSelectedRestaurantSlug] = useState<string | null>(null);

  const promotedRestaurants = mockRestaurants.filter((r) => r.is_promoted);
  const selectedRestaurant = mockRestaurants.find((r) => r.slug === selectedRestaurantSlug);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setView('search');
    setShowSuggestions(false);
  };

  const handleSelectRestaurant = (slug: string) => {
    setSelectedRestaurantSlug(slug);
    setView('menu');
  };

  const handleBackToHome = () => {
    setView('home');
    setSearchQuery('');
    setSelectedRestaurantSlug(null);
  };

  const handleSortChange = (sort: 'distance' | 'rating' | undefined) => {
    setSortBy(sort);
  };

  const handleFilterChange = (filter: 'under20' | 'open', value: boolean) => {
    if (filter === 'under20') setFilterUnder20(value);
    if (filter === 'open') setFilterOpen(value);
  };

  let searchResults = mockRestaurants.map((r, i) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    rating: r.rating,
    zone: r.zone,
    deliveryTimeMin: r.delivery_time_min,
    deliveryTimeMax: r.delivery_time_max,
    isOpen: r.is_open,
    matchName: r.name,
    matchPrice: 2500,
    distance: 0.5 + i * 0.4,
  }));

  if (filterUnder20) searchResults = searchResults.filter((r) => r.deliveryTimeMax <= 20);
  if (filterOpen) searchResults = searchResults.filter((r) => r.isOpen);
  if (sortBy === 'rating') searchResults = [...searchResults].sort((a, b) => b.rating - a.rating);
  if (sortBy === 'distance') searchResults = [...searchResults].sort((a, b) => a.distance - b.distance);

  return (
    <div className="w-full max-w-[380px] mx-auto px-4 py-8 pb-20 relative">
      {/* Brand Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Link href="/" className="mr-1 text-gray hover:text-ink transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="w-5 h-5 rounded-md flex-shrink-0" style={{background: 'var(--orange)'}} />
          <div
            className="font-semibold text-[15px] tracking-tight"
            style={{fontFamily: "'Space Grotesk', sans-serif"}}
          >
            BigFoods
          </div>
        </div>
        <div className="text-[11px]" style={{color: 'var(--gray)'}}>Awka, Anambra</div>
      </div>

      {view === 'home' && (
        <>
          <SearchBar
            onSearch={handleSearch}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          />
          <SearchSuggestions visible={showSuggestions} onSearch={handleSearch} />
          <CategoryChips active={category} onChange={setCategory} />
          <PromotedRow restaurants={promotedRestaurants} onSelect={handleSelectRestaurant} />
          <RestaurantList restaurants={mockRestaurants} onSelect={handleSelectRestaurant} />
        </>
      )}

      {view === 'search' && (
        <SearchResults
          results={searchResults}
          query={searchQuery}
          sortBy={sortBy}
          filterUnder20Min={filterUnder20}
          filterOpenNow={filterOpen}
          onSortChange={handleSortChange}
          onFilterChange={handleFilterChange}
          onSelect={handleSelectRestaurant}
          onBack={handleBackToHome}
        />
      )}

      {view === 'menu' && selectedRestaurant && (
        <MenuScreen
          restaurant={selectedRestaurant}
          menuItems={mockMenuItems.filter((m) => m.restaurant_id === selectedRestaurant.id)}
          onBack={() => setView('home')}
        />
      )}

      <OrderTray />
    </div>
  );
}

export default function OrderPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
      <OrderContent />
    </Suspense>
  );
}
