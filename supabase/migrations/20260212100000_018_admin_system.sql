-- Add admin flag to profiles
ALTER TABLE aio_profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- Add approval workflow to agents
ALTER TABLE aio_agents ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending_review'
  CHECK (approval_status IN ('pending_review', 'approved', 'rejected'));
ALTER TABLE aio_agents ADD COLUMN IF NOT EXISTS approval_note TEXT;
ALTER TABLE aio_agents ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES aio_profiles(id);
ALTER TABLE aio_agents ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Index for admin queries
CREATE INDEX IF NOT EXISTS idx_agents_approval_status ON aio_agents(approval_status);
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin ON aio_profiles(is_admin) WHERE is_admin = true;
