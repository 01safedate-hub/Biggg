# Customer subscription implementation acceptance checklist

## Customer navigation
- [ ] Responsive customer navigation: My orders, Monthly plans, Book a pickup, Extra-clothes bills.
- [ ] Show current and past orders, active plan, remaining monthly pieces, excess bills, amounts, and payment status.

## Monthly plan rules
- [ ] Monthly payment covers pickup, laundry, and delivery for pieces within the plan allowance.
- [ ] Count total pieces regardless of clothing type. Share allowance across two pickups during the monthly period.
- [ ] Enforce allowance server-side; never trust client-submitted plan price, customer ID, or remaining quota.
- [ ] Remove old one-time booking from customer-facing navigation only after subscription pickup works; preserve historical orders.

## Pickup and excess billing
- [ ] Pickup agent records actual piece count and itemizes excess at the second pickup when allowance is exceeded.
- [ ] Calculate excess against remaining allowance transactionally and create an online bill linked to customer and order.
- [ ] Customer pays from authenticated dashboard. Agents do not collect cash.
- [ ] Subscription orders within allowance incur no separate pickup or delivery fees.

## Payment and verification
- [ ] Verify provider payment server-side against reference, provider, and expected amount.
- [ ] Make settlement idempotent; duplicate callbacks must not double-activate plans or double-credit quota.
- [ ] Make payment settlement and allowance/order updates atomic and authorized.

## Tests before customer testing
- [ ] Checkout for each plan and failed/cancelled payment.
- [ ] Exact allowance boundary, partial usage, second pickup, and overage cases.
- [ ] Cross-customer access denied for orders and bills.
- [ ] Duplicate and amount-mismatched payment callbacks.
- [ ] Existing non-subscription payments and historical orders remain unaffected.
- [ ] Run lint, typecheck, automated tests; review migration and RLS policies.

## Known blocker
The current create_payment_intent routine rejects items payments for orders with source subscription. The current settle_online_payment routine does not activate subscriptions or settle monthly allowance. These must be fixed in the implementation, not worked around in the UI.
