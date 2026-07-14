'use client';

import {useState} from 'react';
import {Plus, Check} from 'lucide-react';
import {useCart} from '@/hooks/useCart';
import type {Restaurant, MenuItem} from '@/types/database';

interface MenuScreenProps {
  restaurant: Restaurant;
  menuItems: MenuItem[];
  onBack: () => void;
}

const categoryTabs = ['Popular', 'Soups', 'Rice dishes', 'Drinks'];

export function MenuScreen({restaurant, menuItems, onBack}: MenuScreenProps) {
  const [activeTab, setActiveTab] = useState('Popular');
  const [addedItems, setAddedItems] = useState<Set<string>>(new Set());
  const {addItem} = useCart();

  const handleAddItem = (item: MenuItem) => {
    const isAdded = addedItems.has(item.id);
    if (isAdded) {
      setAddedItems((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    } else {
      setAddedItems((prev) => new Set(prev).add(item.id));
      addItem({
        id: item.id,
        name: item.name,
        price: item.price,
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
      });
    }
  };

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-2.5 mb-4 text-gray"
      >
        <span className="text-base">←</span>
        <span className="text-[12.5px]">Back to restaurants</span>
      </button>

      <div className="h-[110px] rounded-xl bg-gradient-to-br from-[#FFD9B3] to-peach mb-3" />

      <div className="mb-4">
        <h1 className="font-display text-[19px] font-semibold text-ink">
          {restaurant.name}
        </h1>
        <div className="text-[11.5px] text-gray">
          {restaurant.rating} ★ · {restaurant.category} ·{' '}
          {restaurant.delivery_time_min}–{restaurant.delivery_time_max} min ·{' '}
          {restaurant.zone}
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto mb-3 scrollbar-hide border-b border-line pb-2">
        {categoryTabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-shrink-0 text-[12px] font-semibold px-1 pb-1 border-b-2 transition-colors ${
              activeTab === tab
                ? 'text-ink border-orange'
                : 'text-gray border-transparent'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="divide-y divide-line">
        {menuItems.map((item) => (
          <div
            key={item.id}
            className="flex gap-3 items-center py-3"
          >
            <div className="w-[50px] h-[50px] rounded-lg bg-peach flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[12.5px] text-ink">
                {item.name}
              </div>
              <div className="text-[11.5px] text-gray">
                ₦{item.price.toLocaleString()}
              </div>
            </div>
            <button
              onClick={() => handleAddItem(item)}
              className={`w-7 h-7 rounded-full border flex items-center justify-center transition-colors ${
                addedItems.has(item.id)
                  ? 'bg-orange border-orange text-white'
                  : 'border-orange text-orange'
              }`}
            >
              {addedItems.has(item.id) ? (
                <Check className="w-4 h-4" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
