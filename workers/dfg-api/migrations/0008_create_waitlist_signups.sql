-- Waitlist signups for invite-only alpha access.
-- Public POST /waitlist endpoint accepts an email + Turnstile token and stores a signup.
-- Captain reviews pending rows, promotes to Clerk allowlist, sends invite manually.

CREATE TABLE IF NOT EXISTS waitlist_signups (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  signed_up_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  confirmed_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'invited', 'closed', 'unsubscribed')),
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  referrer TEXT,
  landing_path TEXT,
  ip_country TEXT,
  user_agent TEXT,
  unsubscribe_token TEXT NOT NULL,
  notes TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_waitlist_signups_email
  ON waitlist_signups(email);

CREATE INDEX IF NOT EXISTS idx_waitlist_signups_status
  ON waitlist_signups(status, signed_up_at DESC);
