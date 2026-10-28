# Automatic WhatsApp notifications

This feature adds a consent-gated WhatsApp outbox and Meta Cloud API worker. It is intentionally not activated against production until the database migration is reviewed, Meta credentials are installed, and the required Utility templates are approved.

## Before rollout

1. Apply migrations in filename order through the team's normal Supabase migration pipeline.
2. Regenerate `types/database.ts` from the migrated project and run the app's typecheck/build plus the existing rollback-only online and walk-in flow tests.
3. Add the Edge Function secrets below. Do not commit secret values.
4. Configure Meta webhook URL as `https://aqxitpnektmkjpfbbfhz.supabase.co/functions/v1/whatsapp-webhook`, subscribe to messages/statuses, and validate the challenge.
5. Configure each `WA_TEMPLATE_*` value with the actual approved Meta template name. Template parameter order must match the template contract.
6. Run tests with a dedicated test phone number and approved templates. Do not enable customer sends before those tests pass.

## Edge Function secrets

Worker:
- `WA_TOKEN`
- `WA_PHONE_NUMBER_ID`
- `WA_GRAPH_VERSION` (optional; default is set in code)
- `WA_TEMPLATE_PICKUP_CONFIRMED`
- `WA_TEMPLATE_AGENT_ASSIGNED`
- `WA_TEMPLATE_AGENT_ARRIVED`
- `WA_TEMPLATE_COUNT_READY`
- `WA_TEMPLATE_COUNT_REMINDER`
- `WA_TEMPLATE_STAIN_NOTICE`
- `WA_TEMPLATE_PAYMENT_RECEIPT`
- `WA_TEMPLATE_HUB_RECEIVED`
- `WA_TEMPLATE_INSTANT_STARTED`
- `WA_TEMPLATE_INSTANT_LATE`
- `WA_TEMPLATE_ORDER_READY`
- `WA_TEMPLATE_READY_REMINDER`
- `WA_TEMPLATE_DELIVERY_PAYMENT_LINK`
- `WA_TEMPLATE_DELIVERY_PAYMENT_REMINDER`
- `WA_TEMPLATE_RIDER_ASSIGNED`
- `WA_TEMPLATE_DELIVERY_FAILED`
- `WA_TEMPLATE_DELIVERED`
- `WA_TEMPLATE_RATE_REMINDER`
- `WA_TEMPLATE_STORAGE_WARNING`
- `WA_TEMPLATE_STORAGE_STARTED`
- `WA_TEMPLATE_SUBSCRIPTION_PICKUP`
- `WA_TEMPLATE_SUBSCRIPTION_INVOICE`

Webhook:
- `WA_APP_SECRET`
- `WA_VERIFY_TOKEN`

The database creates a separate random Vault secret, `whatsapp_worker_secret`, for the cron-to-worker call. The value is not stored in Git.

## Events covered in the initial integration

- Pickup paid/confirmed, pickup agent assigned, agent arrived
- Count recorded and 2-hour count acceptance reminder
- Stain photo event
- Successful payment receipt
- Hub receipt, instant washing start and instant target missed
- Ready notification and 24/72-hour collection reminders
- Delivery attempt/payment transition, rider assignment, delivery failure and delivered
- Two-hour rating reminder
- Storage warning and storage fee start
- Subscription pickup/invoice template identifiers reserved for the subscription event integration

## Safety notes and known follow-up

- `whatsapp_opt_in` defaults to false. Existing customers are not opted in automatically.
- Customers can opt out with the exact `STOP` message; provider webhook signature is validated before accepting status or opt-out events.
- The worker re-checks consent and recipient phone before sending.
- Reminders are held from 21:00 to 07:00 Africa/Lagos. Transactional messages are not suppressed by this reminder-only quiet-hours policy.
- Failed sends use bounded exponential retry; provider delivery/read receipts update the outbox row.
- Review template variable ordering and URL/button requirements against the exact approved Meta templates before go-live.
- Customer sign-up has an unchecked WhatsApp order-updates checkbox and submits `whatsapp_opt_in` in auth metadata. The `desk-walkin` Edge Function now persists explicit `whatsapp_opt_in` and `whatsapp_opt_in_at` values for newly created walk-in profiles; missing/false values remain opted out.\n- **Walk-in UI integration remains unverified/incomplete:** locate the front-desk caller of `desk-walkin`, add an unchecked consent checkbox, and send the boolean `whatsapp_opt_in` in the request. Existing-customer and upgrade flows must not silently change consent. Do not mark this item complete until tested end-to-end.\n- A customer profile-settings consent control is not included in this PR; do not claim it is implemented.
- A read-only check of the connected production schema confirmed `public.order_ratings` exists. The WhatsApp outbox, consent columns, and WhatsApp-specific RPCs were not present in the live schema at the time of the check, consistent with the feature migrations not yet being applied.
- Extend flow tests to assert one outbox entry per idempotency key, opt-out behaviour, status updates, retry/backoff, and that delayed reminders cancel after customer action.\n- Latest inspected feature commit `ea5d8cccc51ce4f4c18cb5c2f0b2bb1df5fb494f` has a successful CI workflow run, but this does not replace disposable-database migration testing or Meta provider tests.\n- Do not merge or deploy until the walk-in caller is wired and verified, migrations pass in a disposable Supabase environment, the application typecheck/build and flow tests pass, and approved Meta template names/parameter ordering are verified with a dedicated test recipient.
