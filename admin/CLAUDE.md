# admin/CLAUDE.md — Admin app (Next.js 14, port 3001)

Small internal console for the platform owner: review doctor registrations, approve/reject, and set account tiers (`primary` / `secondary` / `premium`) via the server's `admin` module. Pages live in `app/` (no `src/components` — keep it that way unless it grows); HTTP via `src/lib/api.ts`.

Rules:

- **Shares the API and its auth cookies** with the doctor client (same `api.muqsithealthsystem.com` host in prod). Cookie/refresh semantics changed on the server affect both — test admin login after auth changes.
- `NEXT_PUBLIC_API_URL` must exist in **`.env.production`** (committed) as well as `.env.local`; a missing prod value silently points the deployed build at `localhost:4000` (this was a real outage). Prod: `https://api.muqsithealthsystem.com/api`.
- Tier changes are patient-safety adjacent: setting a user to `secondary` locks them out of their own practice (upgrade gate), and admin evict (`revokeAllForUser`) kills sessions within one access-token lifetime. Confirmations required in the UI for both.
- Deployed by the same GitHub Actions workflow (`pm2 restart muqsit-admin`); admin build failures are non-fatal in the pipeline — check the Actions log if a change doesn't appear.
- `npx tsc --noEmit` before commit, same as the other apps.
