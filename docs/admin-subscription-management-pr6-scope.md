# PR #6 — Admin subscription management

## Purpose
Audit and complete the admin-facing subscription features described in the LaundryPoint Handover, without duplicating existing routes or changing production data.

## Handover requirements to verify
- Plans editor: plan price, monthly piece allowance, category limits where supported, and active/inactive status.
- Subscribers list: customer, plan, subscription status, billing period, current allowance usage/remaining balance, and upcoming pickups.
- Subscription revenue reporting: successful subscription payments grouped by plan.
- Extra-clothes revenue reporting: successful extra-clothes payments reported separately from subscription fees.
- Churn reporting: cancellations/lost subscriptions over a selectable period.
- Related operational requirement to check: a desk call list for today's and tomorrow's subscription pickups.

## Implementation approach
1. Inventory existing admin routes, components, database tables, RPCs, and RLS policies.
2. Record each requirement as implemented, partial, or missing, with evidence from the code.
3. Implement only confirmed gaps in this PR.
4. Keep financial metrics grounded in successful payment records; do not count pending or failed payments as revenue.
5. Preserve customer allowance and extra-clothes payment rules. Do not apply production schema changes without separate verification.

## Acceptance checks
- Admin-only access is enforced server-side and by database policies.
- Subscribers and pickup information reflect persisted subscription records.
- Plan edits validate prices/allowances and cannot silently alter existing billing history.
- Revenue separates subscription and extra-clothes payments and excludes pending/failed payments.
- Churn definitions and reporting period are explicit.
- TypeScript, lint/build checks, and relevant tests pass.
- No live payment attempts or production data changes are part of this PR.
