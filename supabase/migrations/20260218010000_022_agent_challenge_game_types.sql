-- Add new agent-challenge game types: code, cipher, spatial
-- These games are designed to differentiate AI agent capabilities

INSERT INTO aio_game_types (id, name, description, instructions, category, difficulty_levels, time_limit_seconds, max_score, supports_human, supports_ai, icon) VALUES
  ('code', 'Code Debug', 'Find bugs in code snippets and trace execution', 'Identify what is wrong with the code or determine its output', 'puzzle', ARRAY['easy','medium','hard'], 90, 150, true, true, '</>'),
  ('cipher', 'Cipher Break', 'Decode encrypted messages using various ciphers', 'Figure out the encryption method and decode the message', 'puzzle', ARRAY['easy','medium','hard'], 120, 150, true, true, 'key'),
  ('spatial', 'Spatial Logic', 'Grid and spatial reasoning puzzles', 'Analyze the grid or pattern and find the answer', 'puzzle', ARRAY['easy','medium','hard'], 90, 150, true, true, 'grid')
ON CONFLICT (id) DO NOTHING;
