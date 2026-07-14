'use client';

import {useCart} from '@/hooks/useCart';

export function OrderTray() {
  const {count, total} = useCart();

  if (count === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 px-4 pb-4 pointer-events-none">
      <div className="max-w-[380px] mx-auto">
        <button className="w-full flex items-center justify-between bg-ink text-white rounded-xl px-4 py-3 shadow-tray pointer-events-auto">
          <div className="text-[12px]">
            <b className="font-display text-[14px] block">{count} item{count !== 1 ? 's' : ''}</b>
            View cart
          </div>
          <div className="text-[12px] font-semibold text-orange flex items-center gap-1.5">
            <span>₦{total.toLocaleString()}</span>
            <span>→</span>
          </div>
        </button>
      </div>
    </div>
  );
}
