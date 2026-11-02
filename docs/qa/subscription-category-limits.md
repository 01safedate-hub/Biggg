# Subscription category limits — QA checklist

Use a controlled test subscription and test orders only. Do not change a real customer's subscription or payment records.

## Plan editor
- [ ] An unchecked category has no separate category cap.
- [ ] A category configured with limit 0 is displayed as **Not included — charge every piece**.
- [ ] A category configured with a positive limit is displayed as **Included up to N pieces**.
- [ ] The saved plan reloads with the same category settings.
- [ ] Customers can see category inclusion/exclusion rules before subscribing.
- [ ] Pickup agents see the relevant category rule while counting garments.

## Controlled counting tests
Set the overall allowance and category caps to small values on a dedicated test plan, then verify the database rows and customer-facing charge before approving any real charge.

1. **Uncapped category within allowance:** pieces count toward the plan-wide allowance; no category-specific overage.
2. **Excluded category:** every piece in that category is chargeable, even when unused overall allowance remains.
3. **Positive category cap:** pieces up to the cap are included; pieces above it are chargeable.
4. **Overall allowance exceeded:** only included/eligible pieces exceeding the remaining overall allowance are charged as total overage.
5. **Combined case:** an excluded category plus another category exceeding its cap plus an overall allowance excess; verify each garment is charged at most once.
6. **Two pickups in one billing period:** verify category usage and total-piece usage accumulate across both pickups.
7. **New billing period:** verify usage resets to the current billing period.
8. **Skipped/missed pickup:** verify it does not consume allowance.
9. **Removed order item:** verify it is not counted or billed.
10. **No subscription / walk-in order:** verify existing non-subscription garment pricing remains unchanged.

## Release evidence to record
For each test, record the plan ID, subscription ID, pickup/order ID, category slugs, quantities, prior usage, configured limits, expected chargeable pieces, actual `pieces_counted`, `overage_pieces`, and `overage_kobo`. Compare database values with the agent UI and final customer amount.

## Important
This checklist is not evidence that the tests have passed. Keep the PR open until the controlled billing tests and production build have been checked. Do not use real customer orders for test cases.
