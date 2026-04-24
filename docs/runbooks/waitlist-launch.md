# Waitlist + Parallel Auth Launch Runbook (Phase 3a)

Manual setup steps to bring the new landing + waitlist + parallel-auth (Clerk alongside legacy NextAuth) live on `durganfieldguide.com`. Code is in PR; this is the operator checklist.

**Phase 3a is a parallel-auth window.** Both `/login` (NextAuth) and `/sign-in` (Clerk) work simultaneously. Captain keeps operational access via either path. After ≥5 days of stable Clerk operation, Phase 3b removes NextAuth, `/login`, the `ALLOWED_USERS` env var, and the `next-auth` dependency.

## 1. Vercel custom domain

`durganfieldguide.com` is registered (smd-llc team) but not yet linked to the `dfg-console` Vercel project.

- Vercel project `dfg-console` → Settings → Domains → Add `durganfieldguide.com`
- Vercel issues DNS records (apex A/ALIAS, optional `www` CNAME).
- Add records to Cloudflare (durganfieldguide.com zone). Existing Google Workspace MX records stay untouched.
- Verify Vercel reports `Valid Configuration`.

## 2. Clerk app provisioning

Clerk Pro (already paid for via DC) covers all four ventures.

- https://dashboard.clerk.com → New application → "Durgan Field Guide"
- Settings → Restrictions → enable **Allowlist mode**
- Allowlist → add `smdurgan@venturecrane.com` (the only allowed user during alpha)
- Settings → Email & SMS → Magic link → enable as primary sign-in method
- Customize the magic-link email template (sender: `hello@mail.durganfieldguide.com`, body styled to DFG brand voice — analytical-confident)
- Save the Clerk publishable + secret keys → Vercel env vars on `dfg-console`
- Save `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` in Infisical `/dfg`

## 3. Resend domain verification

We send from `mail.durganfieldguide.com` to isolate from existing Google Workspace MX on the apex.

- https://resend.com/domains → Add domain → `mail.durganfieldguide.com`
- Add the SPF + DKIM TXT records and DMARC record to Cloudflare (durganfieldguide.com zone). Subdomain-scoped — apex SPF (Google + Hostinger) untouched.
- Wait for `Verified`.
- Save `RESEND_API_KEY` in Infisical `/dfg` (or reuse the Crane-wide Resend account key).

## 4. Cloudflare Turnstile

- https://dash.cloudflare.com → Turnstile → Add site
- Site name: `durganfieldguide.com waitlist`
- Domain: `durganfieldguide.com`
- Widget mode: **Managed**
- Save site key (public) and secret key.
- Save `TURNSTILE_SECRET_KEY` in Infisical `/dfg`.

## 5. Worker secrets

```bash
cd workers/dfg-api
infisical run --env=prod --path=/dfg -- bash -c '
  echo "$RESEND_API_KEY" | wrangler secret put RESEND_API_KEY --env production
  echo "$TURNSTILE_SECRET_KEY" | wrangler secret put TURNSTILE_SECRET_KEY --env production
'
```

## 6. Vercel env vars

- Vercel project `dfg-console` → Settings → Environment Variables (Production + Preview):
  - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (public Turnstile site key)
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
  - `CLERK_SECRET_KEY`
  - `NEXT_PUBLIC_DFG_API_URL` (e.g., `https://dfg-api.automation-ab6.workers.dev`) — only if defaulting to the wrong Worker URL
- Trigger a redeploy.

## 7. D1 migration

```bash
cd workers/dfg-api
wrangler d1 migrations apply dfg-scout-db --remote --env production
```

## 8. End-to-end verification

### Marketing + waitlist

1. Visit https://durganfieldguide.com — landing renders, six sections present, brand-correct (steel-blue / slate, mono accents, dark mode default adapts to light).
2. Submit waitlist with a test email → success state appears.
3. Confirmation email arrives in test inbox.
4. Captain notification email arrives at `smdurgan@venturecrane.com`.
5. Submit the same email again → "you are already on the list" state.
6. Tail the worker:
   ```bash
   cd workers/dfg-api && wrangler tail --env production
   ```
   Submit a test signup. Confirm structured `waitlist_signup` log line.

### Parallel auth (the safety-critical part)

7. Sign out everywhere first.
8. **Path A — legacy NextAuth still works:** Visit `/login`, enter Captain credentials → reach `/dashboard`. Verify operator console renders with data.
9. Sign out.
10. **Path B — new Clerk path works:** Visit `/sign-in`, enter `smdurgan@venturecrane.com` → magic-link email arrives → click-through completes sign-in → reach `/dashboard`. Verify operator console renders with data.
11. **Path C — non-allowlisted email blocked:** Try to sign in with a different email → blocked at Clerk.
12. **Path D — unauth visitor protected:** Sign out, visit `/dashboard` directly → redirect to `/sign-in` (new Clerk path, not legacy `/login`).

### 5-day soak before Phase 3b

- Use Clerk path (`/sign-in`) for at least 5 days as Captain's primary auth.
- Confirm magic-link delivery works on every device you use (desktop browsers, iOS, Android).
- Confirm no operational regression on opportunities, sources, settings.
- After 5 clean days, ship Phase 3b PR (NextAuth removal).

## 9. Reviewing waitlist signups

```bash
cd workers/dfg-api
wrangler d1 execute dfg-scout-db --remote --env production --command \
  "SELECT id, email, signed_up_at, status, utm_source, ip_country FROM waitlist_signups ORDER BY signed_up_at DESC LIMIT 50"
```

To promote: copy email → Clerk Allowlist → mark row as `invited`:

```bash
wrangler d1 execute dfg-scout-db --remote --env production --command \
  "UPDATE waitlist_signups SET status = 'invited' WHERE email = 'foo@example.com'"
```

## 10. Phase 3b (separate PR, ≥5 days later)

When Captain confirms Clerk-only operation is stable:

- Delete `apps/dfg-app/src/app/api/auth/[...nextauth]/route.ts`
- Delete `apps/dfg-app/src/app/login/page.tsx`
- Remove `ALLOWED_USERS` env var (Vercel + Infisical)
- Remove `NEXTAUTH_SECRET` env var
- Update `apps/dfg-app/src/middleware.ts` — drop the NextAuth fallback branch
- Drop `next-auth` from `apps/dfg-app/package.json`
- Final verification: Captain signs out everywhere, signs in only via Clerk, no broken paths.
