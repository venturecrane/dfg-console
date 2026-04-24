# Waitlist + Clerk Migration Launch Runbook

Manual setup steps to bring the new landing + waitlist + Clerk auth live on `durganfieldguide.com`. Code is in PR; this is the operator checklist.

NextAuth is removed in this PR. The only sign-in path is `/sign-in` (Clerk allowlist + magic link). If Clerk magic links fail to deliver during launch, rollback the deploy in Vercel (single click) and the previous NextAuth-based version is back instantly.

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

### Clerk auth verification

7. Sign out everywhere first.
8. Visit `/sign-in`, enter `smdurgan@venturecrane.com` → magic-link email arrives → click-through completes sign-in → reach `/dashboard`. Verify operator console renders with data.
9. Sign out.
10. Try `/sign-in` with a non-allowlisted email → blocked at Clerk.
11. Sign out, visit `/dashboard` directly → redirect to `/sign-in`.

### Rollback path if magic-link delivery is broken

If Clerk magic links don't arrive in your inbox after the deploy:

- Vercel project `dfg-console` → Deployments → previous deploy → "Promote to Production" (single click).
- The pre-PR version (NextAuth credentials) is instantly back. Total downtime: under a minute.
- Investigate Clerk + Resend deliverability before re-deploying.

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

## 10. Env vars to remove from Vercel + Infisical

After the deploy is verified, these env vars are no longer used and can be deleted from Vercel project settings + Infisical `/dfg`:

- `ALLOWED_USERS` (was the NextAuth credentials list)
- `NEXTAUTH_SECRET` (was the NextAuth JWT signing key)

Code references to both are already gone in this PR.
