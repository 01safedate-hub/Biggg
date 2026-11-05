# Agent Operations — Production Acceptance Test

This checklist is for validating the agent referral, booking, return-delivery, custody, commission and fraud-control work already merged to main.

## Test safety
- Use dedicated test accounts and test customer details.
- Do not use an active agent's account for strike escalation or fraud-trigger tests.
- Do not make real payments unless an approved test-payment method is available.
- Record invitation IDs and order IDs, but do not include passwords, OTPs or customer-sensitive data in screenshots.

## A. Customer invitations
- [ ] Add a test customer from the agent Referrals page.
- [ ] Confirm the invitation appears with the expected pending status.
- [ ] Confirm the invitation email arrives and its link opens.
- [ ] Resend the invitation and confirm a new email arrives.
- [ ] Verify the resend limit is two resends.
- [ ] Verify expired invitations cannot be resent.
- [ ] Complete signup and email confirmation.
- [ ] Confirm the referral changes to joined/signed-up and remains owned by the inviting agent.
- [ ] Specifically test resending for an existing unconfirmed account; this path has not yet had live end-to-end verification.

## B. Booking assignment
- [ ] Create a subscription booking for the agent's referred customer; verify eligible auto-assignment.
- [ ] Create a one-time booking; verify it is not assigned before pickup-fare payment.
- [ ] Complete a successful pickup-fare payment; verify the one-time booking becomes assigned.
- [ ] Verify a staff delivery agent does not receive automatic assignment merely because they referred the customer.

## C. Return delivery
- [ ] Move an eligible own-customer order to the return-delivery stage.
- [ ] Verify the commission-only agent can claim the eligible return trip.
- [ ] Verify another agent's customer cannot be claimed.
- [ ] Verify already-assigned, customer-collection, disputed, and unpaid-ineligible orders cannot be claimed.
- [ ] Verify staff can reassign the return trip to a delivery agent.

## D. Bag custody and alerts
- [ ] Verify pickup custody is recorded at count_confirmed.
- [ ] Verify hub arrival is recorded at received.
- [ ] Verify hub departure is recorded at out_for_delivery.
- [ ] Verify delivery completion is recorded at delivered.
- [ ] Verify relevant agent and authorised staff can see custody records.
- [ ] Verify late-drop and overnight alerts; allow for the 15-minute scheduled check interval.

## E. Strikes, holds and fraud controls
Use a dedicated test agent only.
- [ ] First strike records a warning.
- [ ] Second strike creates the 14-day commission hold.
- [ ] Third strike restricts the agent profile and rejects the staff profile.
- [ ] More than 10 invitations in the Africa/Lagos day raises the invitation-volume fraud flag.
- [ ] A qualifying first-order cancellation/refund pattern raises a fraud flag.
- [ ] Open fraud flags block commission approval and payout.
- [ ] An authorised admin can review and clear a fraud flag.

## Evidence to capture for failures
For each failure, record the page, action, expected result, actual result, timestamp, and relevant invitation/order ID. Redact personal information and never share credentials or verification codes.

## Known boundaries
- Device-overlap and shared-location fraud flags are not enabled.
- Lost/damaged item commission deductions are not applied pending an approved policy.
- Weekly commission payout integration remains outside this acceptance test.
- This PR adds the QA checklist only; it does not change application behaviour, database schema, Edge Functions, or WhatsApp integration.
