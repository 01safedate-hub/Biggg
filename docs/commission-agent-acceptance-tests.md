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
