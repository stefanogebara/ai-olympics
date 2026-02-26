export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          display_name: string | null;
          avatar_url: string | null;
          is_verified: boolean;
          is_admin: boolean;
          wallet_balance: number;
          created_at: string;
        };
        Insert: {
          id: string;
          username: string;
          display_name?: string | null;
          avatar_url?: string | null;
          is_verified?: boolean;
          is_admin?: boolean;
          wallet_balance?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          is_verified?: boolean;
          is_admin?: boolean;
          wallet_balance?: number;
          created_at?: string;
        };
      };
      agents: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          slug: string;
          description: string | null;
          color: string;
          agent_type: 'webhook' | 'api_key';
          webhook_url: string | null;
          webhook_secret: string | null;
          provider: string | null;
          model: string | null;
          api_key_encrypted: string | null;
          system_prompt: string | null;
          elo_rating: number;
          rating_deviation: number;
          volatility: number;
          total_competitions: number;
          total_wins: number;
          is_active: boolean;
          is_public: boolean;
          verification_status: 'unverified' | 'verified' | 'flagged';
          last_verification_score: number;
          last_verified_at: string | null;
          persona_name: string | null;
          persona_description: string | null;
          persona_style: 'formal' | 'casual' | 'technical' | 'dramatic' | 'minimal' | null;
          strategy: 'aggressive' | 'cautious' | 'balanced' | 'creative' | 'analytical' | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          slug: string;
          description?: string | null;
          color?: string;
          agent_type: 'webhook' | 'api_key';
          webhook_url?: string | null;
          webhook_secret?: string | null;
          provider?: string | null;
          model?: string | null;
          api_key_encrypted?: string | null;
          system_prompt?: string | null;
          elo_rating?: number;
          rating_deviation?: number;
          volatility?: number;
          total_competitions?: number;
          total_wins?: number;
          is_active?: boolean;
          is_public?: boolean;
          verification_status?: 'unverified' | 'verified' | 'flagged';
          last_verification_score?: number;
          last_verified_at?: string | null;
          persona_name?: string | null;
          persona_description?: string | null;
          persona_style?: 'formal' | 'casual' | 'technical' | 'dramatic' | 'minimal' | null;
          strategy?: 'aggressive' | 'cautious' | 'balanced' | 'creative' | 'analytical' | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          color?: string;
          agent_type?: 'webhook' | 'api_key';
          webhook_url?: string | null;
          webhook_secret?: string | null;
          provider?: string | null;
          model?: string | null;
          api_key_encrypted?: string | null;
          system_prompt?: string | null;
          elo_rating?: number;
          rating_deviation?: number;
          volatility?: number;
          total_competitions?: number;
          total_wins?: number;
          is_active?: boolean;
          is_public?: boolean;
          verification_status?: 'unverified' | 'verified' | 'flagged';
          last_verification_score?: number;
          last_verified_at?: string | null;
          persona_name?: string | null;
          persona_description?: string | null;
          persona_style?: 'formal' | 'casual' | 'technical' | 'dramatic' | 'minimal' | null;
          strategy?: 'aggressive' | 'cautious' | 'balanced' | 'creative' | 'analytical' | null;
          created_at?: string;
        };
      };
      domains: {
        Row: {
          id: string;
          slug: string;
          name: string;
          description: string | null;
          icon: string | null;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          description?: string | null;
          icon?: string | null;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          description?: string | null;
          icon?: string | null;
        };
      };
      competitions: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          domain_id: string | null;
          task_ids: string[] | null;
          stake_mode: 'sandbox' | 'real';
          status: 'scheduled' | 'lobby' | 'running' | 'completed' | 'cancelled';
          entry_fee: number;
          prize_pool: number;
          max_participants: number;
          created_by: string | null;
          scheduled_start: string | null;
          auto_start: boolean;
          recurrence_interval: string | null;
          started_at: string | null;
          ended_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          domain_id?: string | null;
          task_ids?: string[] | null;
          stake_mode?: 'sandbox' | 'real';
          status?: 'scheduled' | 'lobby' | 'running' | 'completed' | 'cancelled';
          entry_fee?: number;
          prize_pool?: number;
          max_participants?: number;
          created_by?: string | null;
          scheduled_start?: string | null;
          auto_start?: boolean;
          recurrence_interval?: string | null;
          started_at?: string | null;
          ended_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          domain_id?: string | null;
          task_ids?: string[] | null;
          stake_mode?: 'sandbox' | 'real';
          status?: 'scheduled' | 'lobby' | 'running' | 'completed' | 'cancelled';
          entry_fee?: number;
          prize_pool?: number;
          max_participants?: number;
          created_by?: string | null;
          scheduled_start?: string | null;
          auto_start?: boolean;
          recurrence_interval?: string | null;
          started_at?: string | null;
          ended_at?: string | null;
          created_at?: string;
        };
      };
      competition_participants: {
        Row: {
          id: string;
          competition_id: string;
          agent_id: string;
          user_id: string;
          joined_at: string;
          final_rank: number | null;
          final_score: number;
        };
        Insert: {
          id?: string;
          competition_id: string;
          agent_id: string;
          user_id: string;
          joined_at?: string;
          final_rank?: number | null;
          final_score?: number;
        };
        Update: {
          id?: string;
          competition_id?: string;
          agent_id?: string;
          user_id?: string;
          joined_at?: string;
          final_rank?: number | null;
          final_score?: number;
        };
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
  };
}

// Helper types
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Agent = Database['public']['Tables']['agents']['Row'];
export type Domain = Database['public']['Tables']['domains']['Row'];
export type Competition = Database['public']['Tables']['competitions']['Row'];
export type CompetitionParticipant = Database['public']['Tables']['competition_participants']['Row'];
