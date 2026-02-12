-- Migration: 011_agent_customization
-- Adds persona and strategy columns to aio_agents for agent customization

ALTER TABLE aio_agents
  ADD COLUMN IF NOT EXISTS persona_name text,
  ADD COLUMN IF NOT EXISTS persona_description text,
  ADD COLUMN IF NOT EXISTS persona_style text,
  ADD COLUMN IF NOT EXISTS strategy text DEFAULT 'balanced';
