import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.generated';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Untyped client for backward compatibility with existing pages
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Typed client for new code - regenerate with: npm run db:types
export const typedSupabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

// Re-export Database type for direct usage
export type { Database };
