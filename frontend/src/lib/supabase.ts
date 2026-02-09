import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Using any for now to avoid strict typing issues
// In production, generate types with: npx supabase gen types typescript
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
