-- Migration: Stripe Connect accounts table for payouts
-- Users must onboard via Stripe Connect Express before withdrawing to bank

CREATE TABLE IF NOT EXISTS aio_stripe_connect_accounts (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_account_id TEXT UNIQUE NOT NULL,
  payouts_enabled BOOLEAN DEFAULT false,
  onboarded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: users can only view their own row
ALTER TABLE aio_stripe_connect_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own connect account"
  ON aio_stripe_connect_accounts
  FOR SELECT
  USING ((select auth.uid()) = user_id);

-- Service role manages inserts/updates (done via serviceClient in backend)
CREATE POLICY "Service role manages connect accounts"
  ON aio_stripe_connect_accounts
  FOR ALL
  USING (true)
  WITH CHECK (true);
