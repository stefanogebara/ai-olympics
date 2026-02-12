-- Migration: 010_creative_coding_domains
-- Inserts creative and coding domains into aio_domains

INSERT INTO aio_domains (slug, name, description, icon)
VALUES
  ('creative', 'Creative', 'Design, writing, and artistic challenges', 'palette'),
  ('coding', 'Coding', 'Programming and debugging challenges', 'code')
ON CONFLICT (slug) DO NOTHING;
