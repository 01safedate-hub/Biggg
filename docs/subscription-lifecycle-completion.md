# Subscription lifecycle completion — implementation plan

Tracking issue: #35
Target branch: `main`
Feature branch: `feat/subscription-lifecycle-completion`

## Guardrails
- No edits to production customer subscriptions, invoices, payments, or live plan prices during development.
- No production migrations or Edge Function deployments until the feature PR is reviewed and explicitly approved.
- Keep current monthly subscriptions compatible; introduce multi-period billing without silently changing existing active records.
- All payable amounts must be calculated server-side from trusted plan and billing-period data.
- Paystack and Flutterwave verification must independently verify transaction status, provider reference, NGN currency, exact amount, customer/payment ownership, and idempotent settlement.
- Never allow cash collection by pickup agents for subscription overages.
- Keep subscription triggers private from direct anonymous/authenticated invocation unless a specific authenticated API contract requires it.

## Confirmed subscription policy
- **Two pickups per subscription month.**
- **The second pickup is scheduled 14 days after the first.**
- The monthly clothes allowance is shared across both pickups; it is not doubled for each pickup.
- Pickup generation must be deterministic and idempotent, with no duplicate orders or extra allowance when a pickup is skipped, missed, retried, or regenerated.
- This is the target policy for the feature implementation. Do not rewrite existing production subscriptions or live settings during development.

## Implementation sequence
1. Payment recovery: subscription invoice lookup and verify endpoint; authorize the current customer; provider-side verification; idempotent call to settlement; tests for pending/success/failed/mismatch/foreign-owner/replayed callbacks.
2. Billing periods: model explicit 1/6/12 month duration; calculate total and any approved discount server-side; persist invoice period; settle without hardcoded one-month extension; adjust renewal reminder and expiry lifecycle; update checkout UI.
3. Plan policy: capture decisions for Starter 70 vs live 75, category caps for Family plans, and Family Max annual discount. Do not mutate existing plan data until policy is approved.
4. Pickup generation: generate exactly two scheduled pickup opportunities per subscription month, 14 days apart; deterministic/idempotent keys; create or link orders only once; handle skip/missed/cancelled without granting extra pickups or allowance.
5. Renewal communications: in-app/email/WhatsApp with explicit stages; user consent and opt-out respected; idempotent event identifiers; retry and delivery status.
6. Overage: calculate eligible allowance usage separately from excluded categories and category cap excess; ensure no double charge; online-only checkout and settlement.
7. Custom plan workflow: lead enquiry → schedule/home visit → quote → approval → invoice/payment → activation; role restrictions and audit trail.
8. Security: restrict execution on public SECURITY DEFINER trigger/helper functions; retain trigger firing; confirm customer/staff RLS boundaries.
9. Automated tests: SQL/pgTAP + TypeScript/Edge Function + app tests; include payment, billing-period, renewal, pickup, category, overage, cancellation, ownership/security and non-subscription regression cases.
10. Operator runbook: explain configuration, manual recovery, payment reconciliation, retry handling and rollout/rollback.

## Remaining policy decisions to record before release
- Starter allowance: handover states 70, production database currently says 75.
- Family Bond / Family Max category limits: handover says separate caps, live category_limits currently empty.
- Family Max annual discount: live database currently says 0%, other plans say 10%.
- Confirm multi-period discount calculation and whether discounts compound with annual discount.

## Acceptance checks
- CI/build/typecheck pass.
- DB tests pass against disposable/test data.
- Paystack and Flutterwave sandbox verification passes; no live charge.
- Test invoice-based recovery after a simulated missed webhook.
- Security/performance advisors reviewed; no unexpected public EXECUTE exposure.
- Production deployment only after explicit approval.
