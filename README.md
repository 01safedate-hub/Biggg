# LaundryPoint

Laundry pickup, delivery, monthly plans, staff, finance and payroll. Next.js 15, React 19, Tailwind 3.4, Supabase.

## Stack
- `app/`, `components/`: web app. The landing page reads plans, settings and live zones from Supabase.
- `lib/supabase/`: `client.ts` (browser), `server.ts` (cookies), `public.ts` (cookie-free, cacheable public reads).
- `types/database.ts`: generated from the database. Regenerate after every migration.
- `supabase/functions/`: edge function source (`waitlist` is deployed).
- Database: project `laundrypoint` (`aqxitpnektmkjpfbbfhz`, eu-west-2). All business values (fares, plans, hours, fees) live in tables, never in code.

## Develop
```bash
cp .env.example .env.local   # add the publishable key from the Supabase dashboard
npm install
npm run typecheck
npm run build
npm run dev
```

## Secrets
Web variables live in Netlify. Edge function secrets live in Supabase. The service-role key is only used inside edge functions. Nothing secret is committed.

## Content rules
Never hard-code a town in public headings, never describe delivery as free, say "Request pickup", and keep "transport paid before the agent leaves" visible.

## Email
All email goes through Resend. Sign-up and password-reset emails use a Supabase "Send Email" auth hook that calls the
`auth-email` edge function (sent instantly). Order, waitlist and demurrage emails are queued in `email_outbox` and sent by
`email-worker` every 5 minutes. Edge function secrets: `RESEND_API_KEY`, `EMAIL_FROM`, `SEND_EMAIL_HOOK_SECRET`, optional `EMAIL_REPLY_TO`.


## Database copies and tests

- `scripts/export-schema.sh` saves an exact copy of the live database structure to `supabase/schema.sql` (needs `DB_URL`). Run it after every migration and commit the result. The numbered files in `supabase/migrations` are the history; some are notes only.
- `supabase/tests/access_matrix.sql` checks what each role (customer, agent, secretary, admin, super admin) can and cannot do. Paste it into the Supabase SQL editor. It saves nothing and always ends with a message starting `RESULT`: `ALL PASS` or the list of failures. Run it after every migration.
