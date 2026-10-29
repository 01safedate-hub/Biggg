# LaundryPoint post-merge acceptance test plan

This pull request is the continuing QA workspace after PR #10 and PR #11. It contains test documentation only; do not use live customer orders or real payment methods for test execution.

## Scope
- One-time pickup checkout and verified payment settlement.
- Ready-order fulfillment choice: collect or deliver.
- Saved GPS and fresh device GPS, including delivery fare recalculation.
- Staff delivery arrangement and collection handover.
- Walk-in order behavior.
- Payment history integrity, including previously successful transport and laundry payments.
- Subscription delivery behavior remains unchanged.

## Test environment and safety
- Use staging/test-mode payment credentials and dedicated test customers/orders.
- Never replay or modify a successful production payment to test idempotency.
- Verify database snapshots before and after each scenario; record order IDs, payment IDs, expected/actual status, and screenshots/log references without secrets or full personal addresses.
- Confirm production migration state separately; never execute destructive cleanup on production data.

## Acceptance scenarios

| ID | Scenario | Expected result |
|---|---|---|
| QA-01 | Customer without an active subscription requests a one-time pickup | Booking is created with the current quoted transport fare and remains awaiting fare payment until provider verification succeeds. |
| QA-02 | Transport payment succeeds | Verified callback advances the order exactly once; duplicate callbacks do not duplicate payment credits or dispatch transitions. |
| QA-03 | Payment fails or is abandoned | Order is not dispatched; customer can safely retry without duplicate successful payment rows. |
| QA-04 | Ready customer chooses collection | No new delivery fee is due; staff must confirm physical handover; existing successful payment records and historical fare fields remain unchanged. |
| QA-05 | Ready customer chooses delivery using saved GPS | Server recalculates the fare from current quote rules and displays it before payment. |
| QA-06 | Ready customer updates address and/or uses current device GPS | Stale quote is cleared; a fresh quote is required before payment. |
| QA-07 | Delivery destination is outside service area or location is invalid | A clear error is shown; no delivery payment intent or agent assignment is created. |
| QA-08 | Delivery fare payment succeeds | Verified payment allows the existing dispatch/agent assignment workflow to proceed exactly once. |
| QA-09 | Customer attempts to choose fulfillment for another customer's order | RPC rejects access; no order, payment, or location data is modified. |
| QA-10 | Anonymous caller attempts fulfillment RPC | Permission denied. Authenticated owner can call only for an eligible order. |
| QA-11 | Staff arranges delivery for a walk-in and a one-time order | Both supported sources use the correct current quote and staff workflow; subscription behavior is unaffected. |
| QA-12 | Subscription order is ready | Existing included-delivery behavior remains unchanged; no new delivery fare is requested. |
| QA-13 | Historical successful transport payment (including order #96) | Payment rows and paid amounts remain exactly as recorded; no double-charge or rewriting of payment purpose/status. |
| QA-14 | Collection is selected after a pending delivery attempt | Pending delivery-fare intents are safely invalidated; successful payment history is never rewritten. |
| QA-15 | Full build/typecheck and deployed smoke test | CI passes and customer/staff screens work against the migrated schema before release is considered complete. |

## Evidence checklist
- [ ] CI typecheck passes on the final merge commit.
- [ ] CI production build passes on the final merge commit.
- [ ] Test-mode one-time checkout success/failure/retry tested.
- [ ] Delivery quote recalculation tested with saved and fresh coordinates.
- [ ] Collection handover and delivery dispatch tested with staff accounts.
- [ ] Authorization/RLS checks pass for owner, other customer, staff, and anon contexts.
- [ ] Before/after comparison confirms successful payment rows are unchanged.
- [ ] Deployment smoke test completed and recorded.
- [ ] Any failures are fixed in a follow-up commit and retested.

## Current baseline
PR #10 and PR #11 have been merged to main. CI for PR #10 and PR #11 reported success; test-mode payment-provider and full customer/staff end-to-end acceptance still need explicit evidence. This checklist is not itself evidence that the scenarios have passed.
