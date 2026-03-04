-- Phase 7: Stripe Connect accounts for bank payouts

CREATE TABLE IF NOT EXISTS aio_stripe_connect_accounts (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_account_id TEXT UNIQUE NOT NULL,
  payouts_enabled BOOLEAN DEFAULT false,
  onboarded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE aio_stripe_connect_accounts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'aio_stripe_connect_accounts'
      AND policyname = 'stripe_connect_select_own'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "stripe_connect_select_own"
        ON aio_stripe_connect_accounts FOR SELECT
        TO authenticated
        USING ((select auth.uid()) = user_id)
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'aio_stripe_connect_accounts'
      AND policyname = 'stripe_connect_service_role_all'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "stripe_connect_service_role_all"
        ON aio_stripe_connect_accounts FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true)
    $policy$;
  END IF;
END $$;
