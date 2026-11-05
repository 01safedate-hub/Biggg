# Commission agent and hub verification acceptance tests

Run only against a disposable/staging Supabase project after applying repository migrations in timestamp order. Do not use live customer or payment records for test fixtures.

## Hub verification gate
1. Create a staff test account with the `commission_agent` role and a complete online profile in `submitted` state.
2. Attempt `verify_staff(user_id, true, null)` before a hub record. Expected: `hub_verification_required`; onboarding must not become `verified`.
3. Attempt `record_staff_hub_verification` with outcome `passed` but any required identity checkbox false. Expected: `hub_checks_required`.
4. Record a passed hub check with the agent physically present, NIN document checked, NIN/profile match, and photo/person match. Then approve the online profile. Expected: onboarding becomes `verified`.
5. Record a failed hub check. Expected: onboarding is reset to `submitted` and commission accrual is blocked.
6. As a non-super-admin user, attempt to read `staff_hub_verifications` and the NIN-bearing staff profile. Expected: no access to hub records or NIN.

## Referral payment and idempotency
1. Create a test customer whose `profiles.onboarded_by` points to the verified test commission agent.
2. Insert a successful eligible `items` payment for a test order. Expected: exactly one commission row for that payment, assigned to the referring agent and using the configured first-order rate.
3. Deliver the same payment notification again / update an already-successful payment. Expected: commission row count remains one because the trigger ignores success-to-success updates and `commissions.payment_id` is unique.
4. Repeat with a successful `extra_clothes` payment; it should accrue under the configured repeat-order rate when a prior eligible order exists.
5. Verify a transport/demurrage payment produces no commission.
6. Repeat payment with an unverified or hub-rejected agent. Expected: no commission row is created.
7. Verify admin review and payout state transitions, including that only approved, unpaid commission rows can be paid.

Record the staging project reference, migration versions, test fixture IDs, and pass/fail evidence in the PR before production activation.

## Agent-added customer invitation lifecycle
Run against disposable/staging Auth and database fixtures; do not invite real customers.
1. As a verified delivery agent, add a brand-new customer using a new email and phone. Expected: one `client_invites` row is created before the Auth invitation, with status `invited`, a seven-day expiry and resend count zero.
2. Complete the invited user's signup through the normal auth callback. Expected: `private.accept_client_invite()` links `profiles.onboarded_by` to the inviting agent and changes the invite to `signed_up`.
3. Retry with an email already registered to a customer, then with a phone already registered to a customer. Expected: `409 client_exists`; no new Auth user or invite.
4. Retry an email or phone with an unexpired invitation. Expected: `409 invite_pending`; no duplicate invitation.
5. Expire an unused invitation after seven days and attempt onboarding again. Expected: the old invitation becomes `expired` and the prospective customer can be invited by a different verified agent.
6. Force the Auth invitation operation to fail. Expected: the pre-created invitation is changed to `cancelled`; no orphaned active invite remains.
7. Verify the invitation's resend RPC permits no more than two resends and rejects expired, signed-up or other-agent invitations.
8. Attempt onboarding as an unverified delivery agent and as a commission agent without a passed hub check. Expected: `403 not_allowed`; no invitation or Auth user is created.
9. Verify a customer who signs up without an agent invitation remains a house client, and that only a super admin can subsequently change ownership through the audited `set_client_owner` RPC.
 
## Staff referral page acceptance tests
1. Sign in as a verified delivery agent. Expected: Staff navigation includes **Referrals**, and `/staff/referrals` loads inside the staff shell.
2. Sign in as a verified commission agent. Expected: the same referral page and customer-invite form are available; submitting the form is permitted by the server action role gate.
3. Invite a new test customer. Expected: the page shows the invitation as **Invitation sent**, with its creation and expiry dates.
4. Complete signup through the invitation. Expected: the invitation changes to **Joined** and the customer appears in **Customers who joined** with order count and last-order information.
5. Sign in as a different agent. Expected: the first agent's invitations and customers are not visible; `client_invites` reads are scoped to the authenticated `agent_id`.
6. Verify the earnings summary reads only the signed-in agent's existing commission rows and does not create recruitment rewards or alter commission calculations.

## Agent custody and discipline acceptance tests
Run only against staging orders and disposable test-agent accounts after applying the agent custody migration.
1. Move a paid test pickup through customer count acceptance to `count_confirmed`. Expected: one custody record is created with the assigned pickup agent and pickup timestamp.
2. Mark the same order received at the hub. Expected: `hub_in_at` is recorded exactly once and the pickup leg is closed.
3. Move a received test order to `out_for_delivery` with a delivery agent. Expected: the delivery agent and hub sign-out timestamp are recorded.
4. Verify the delivery code. Expected: `delivered_at` is recorded and the delivery custody leg is closed.
5. Leave a disposable paid pickup unreceived for more than three hours, then run `process_agent_custody_alerts()`. Expected: one late alert is recorded, order event written, and active desk/admin users plus the pickup agent receive a notification. Running it again must not duplicate alerts.
6. Verify an assigned agent can read only their own custody row; a different agent cannot read it; super admin can inspect all rows.
7. Record a first strike. Expected: warning notification and strike number 1; no commission hold or deactivation.
8. Record a second strike. Expected: a commission hold ending 14 days later; approval and payout creation are blocked while the hold is active.
9. Record a third strike. Expected: profile becomes restricted and agent onboarding is no longer verified, blocking agent-gated actions.
10. Record a lost/damaged item incident against the correct pickup or delivery custodian. Expected: an open investigation appears in the admin page. Resolve as liable or not liable with a note. No deduction is applied automatically because the PDF leaves the full-value-versus-share deduction policy open.
11. Verify the new admin route is visible only to super admin, and all strike/incident RPCs reject unauthorized roles.
12. Verify no WhatsApp function, trigger, webhook, or notification workflow was changed by this migration.

13. Verify the pickup deadline uses the configured `commission.hub_dropoff_hours` and, when earlier, the same-day `business.closing_time`.
14. Sign a return bag out from the hub and leave it undelivered across the Africa/Lagos date boundary. Expected: one overnight custody alert is sent to the desk and delivery agent; repeat cron runs do not duplicate it.
15. Sign in as either a delivery agent or commission agent. Expected: the My commissions page is available and displays any active 14-day commission hold with its end date.

16. Create 11 invitations for one agent on the same Africa/Lagos calendar day. Expected: one `daily_client_adds` flag is created and commission approval/payout is blocked while it is open.
17. Create staging-only referred customers and cancel/refund enough of their first orders to exceed half of the agent's referred customers with a first order. Expected: a `first_order_cancellation_pattern` flag is created; the admin page shows the count ratio.
18. Clear or dismiss each fraud flag with an admin note. Expected: the decision is audited in the flag row; commission approval/payout remains blocked if any other flag for that agent is still open.
19. Verify device-overlap and shared-location-pin flags are not emitted until the application has explicit, privacy-reviewed device identifiers and a separate agent-location reference. Do not treat the agent's normal GPS arrival at a customer address as fraud.

20. As a verified commission-only agent, have one of your referred customers book a subscription pickup. Expected: the order is assigned to that agent and appears in **My jobs** without entering the general dispatch pool.
21. Repeat with a one-time customer booking. Expected: no pickup job is actionable before the pickup fare succeeds; after successful fare payment, the order is assigned to the referred customer's verified commission agent.
22. Attempt to open or act on another agent's customer's order. Expected: RLS and `private.agent_order()` reject access.
23. When an own-customer order is ready, the original agent can claim the return delivery only if the customer selected delivery and the delivery fare is paid (or the order is subscription-covered). Expected: delivery agent is set and the customer receives an in-app notification.
24. Attempt to claim another agent's return, a collect-at-hub order, an unpaid return, or an order already assigned to another delivery agent. Expected: the claim is rejected.
25. As desk staff, reassign the return leg to a staff delivery agent when the original agent is unavailable. Expected: the commission ownership remains with the original onboarder; the staff agent only performs the trip.
