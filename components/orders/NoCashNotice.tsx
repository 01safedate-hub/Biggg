import { ShieldAlert } from "lucide-react";

/** Shown at booking and on every open order until the clothes are with us. */
export function NoCashNotice({ compact, subscription = false }: { compact?: boolean; subscription?: boolean }) {
  return (
    <div role="note" className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
      <ShieldAlert aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
      <div className="text-sm leading-6">
        <p className="font-semibold">Never give cash to our agent.</p>
        {!compact && (
          <p>
            {subscription
              ? "Pickup, laundry and delivery for included garments are covered by your monthly plan. Your agent counts all garments at collection. If the total exceeds your remaining monthly allowance, the extra pieces are billed to your phone for online payment. Do not pay the agent in cash."
              : "Our agents cannot take money. Your agent will count your clothes by category on their phone and send you the bill here. You pay on your own phone, through Paystack or Flutterwave, and the agent leaves once your payment shows. If anyone asks you for cash, say no and contact us."}
          </p>
        )}
      </div>
    </div>
  );
}
