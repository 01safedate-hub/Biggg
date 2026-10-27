# PR #4 reconciliation status

Date: 2026-10-28

## Current state

PR #4 remains open and in draft. Its feature branch (`feat/subscription-checkout-enforcement`) is 150 commits behind and 131 commits ahead of `main`; GitHub currently reports it as not mergeable. Do not merge the original branch without reconciliation.

The protected integration branch `integration/pr-4-reconcile-2026-10-28` was created from current `main`. It currently has no changes compared with `main`; no subscription feature files have yet been ported to it.

## Live Supabase state observed

The production project reports these migrations as applied:

- `20261027160553_subscription_checkout_payment_activation`
- `20261027160702_subscription_extra_clothes_online_billing`
- `20261027160814_align_subscription_plans_and_invoice_constraints`
- `20261027164705_secure_service_area_waitlist_submission`
- `20261027195456_subscription_only_pickup_requests`
- `20261027195928_disable_legacy_transport_checkout`
- `20261027200035_subscription_delivery_no_fare`
- `20261027200514_restrict_subscription_payment_rpc_access`
- `20261027201356_cancel_subscription_pickup_without_refund`
- `20261027201836_subscription_category_corrections_no_rebilling`
- `20261027222636_fix_arrival_code_step_state`

Do not reapply these migrations as new production migrations. Repository copies still need to be reconciled/committed so repository migration history matches the live database history.

## Findings to resolve before merge

1. `components/auth/LoginForm.tsx` in PR #4 overrides the requested post-login destination with `/onboarding/location` whenever the user has no saved address. It does not first distinguish staff from customers. This can redirect staff away from their intended page.
2. `components/ops/PickupLocationMap.tsx` uses OpenStreetMap tiles, but its fallback text reportedly still directs the agent to a Google Maps link. Update that wording to avoid reintroducing the removed map provider.
3. PR #4's live subscription flow depends on `subscription_pickups`, payment-intent functions, order/item count logic, and payment settlement. Before merge, reconcile SQL functions against the live project and verify server-side total-piece quota and overage settlement; do not treat the existence of the migrations alone as proof that end-to-end payment works.
4. Confirm that the extra-clothes payment button's `pay-init` request shape and provider callback/settlement logic match the currently deployed Edge Function.
5. Port changes in small reviewable commits from the feature PR to the integration branch, compare against current `main`, run the repository's available `typecheck` and `build` scripts, and only then open a replacement PR.

## Supabase advisor snapshot

The Security Advisor flagged `public.agent_locations` as RLS-enabled with no policies, three `SECURITY DEFINER` functions executable by `anon` (`join_service_waitlist`, `quote_pickup`, `unsubscribe_marketing`), and a broader set of authenticated-callable `SECURITY DEFINER` functions that require function-by-function authorization review. It also reports leaked-password protection disabled. These findings need scoped remediation; blanket revokes could break active workflows.

The Performance Advisor reports 27 foreign-key indexes missing in its latest snapshot. Review/index changes separately to avoid mixing unrelated production tuning into PR #4.

## Verification not yet completed

- No clean build/typecheck has been run against a reconciled integration branch.
- No end-to-end payment/pickup/overage/arrival-code tests have been run as part of this reconciliation.
- No production schema changes were made during this reconciliation review.
