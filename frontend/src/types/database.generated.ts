export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      agent_conversations: {
        Row: {
          agent_id: string | null
          agent_version: string | null
          called_phone: string | null
          caller_phone: string | null
          conversation_id: string | null
          created_at: string | null
          customer_email: string | null
          customer_name: string | null
          customer_sentiment: string | null
          duration_seconds: number | null
          ended_at: string | null
          errors_encountered: Json | null
          id: string
          language: string | null
          metadata: Json | null
          outcome: string | null
          party_size: number | null
          requested_date: string | null
          requested_time: string | null
          required_human_handoff: boolean | null
          reservation_id: string | null
          restaurant_info_id: string | null
          started_at: string
          successful_booking: boolean | null
          summary: string | null
          tools_used: Json | null
          transcript: Json | null
          updated_at: string | null
        }
        Insert: {
          agent_id?: string | null
          agent_version?: string | null
          called_phone?: string | null
          caller_phone?: string | null
          conversation_id?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_sentiment?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          errors_encountered?: Json | null
          id?: string
          language?: string | null
          metadata?: Json | null
          outcome?: string | null
          party_size?: number | null
          requested_date?: string | null
          requested_time?: string | null
          required_human_handoff?: boolean | null
          reservation_id?: string | null
          restaurant_info_id?: string | null
          started_at?: string
          successful_booking?: boolean | null
          summary?: string | null
          tools_used?: Json | null
          transcript?: Json | null
          updated_at?: string | null
        }
        Update: {
          agent_id?: string | null
          agent_version?: string | null
          called_phone?: string | null
          caller_phone?: string | null
          conversation_id?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_sentiment?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          errors_encountered?: Json | null
          id?: string
          language?: string | null
          metadata?: Json | null
          outcome?: string | null
          party_size?: number | null
          requested_date?: string | null
          requested_time?: string | null
          required_human_handoff?: boolean | null
          reservation_id?: string | null
          restaurant_info_id?: string | null
          started_at?: string
          successful_booking?: boolean | null
          summary?: string | null
          tools_used?: Json | null
          transcript?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      agent_insights: {
        Row: {
          acknowledged_at: string | null
          agent_type: string
          confidence: number | null
          created_at: string | null
          description: string
          expires_at: string | null
          id: string
          importance: number | null
          insight_data: Json | null
          insight_type: string
          is_acknowledged: boolean | null
          is_actionable: boolean | null
          title: string
          user_action_taken: string | null
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          agent_type: string
          confidence?: number | null
          created_at?: string | null
          description: string
          expires_at?: string | null
          id?: string
          importance?: number | null
          insight_data?: Json | null
          insight_type: string
          is_acknowledged?: boolean | null
          is_actionable?: boolean | null
          title: string
          user_action_taken?: string | null
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          agent_type?: string
          confidence?: number | null
          created_at?: string | null
          description?: string
          expires_at?: string | null
          id?: string
          importance?: number | null
          insight_data?: Json | null
          insight_type?: string
          is_acknowledged?: boolean | null
          is_actionable?: boolean | null
          title?: string
          user_action_taken?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_insights_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_memory: {
        Row: {
          access_count: number | null
          agent_type: string
          confidence: number | null
          created_at: string | null
          expires_at: string | null
          id: string
          key: string
          last_accessed_at: string | null
          memory_tier: string
          memory_type: string
          relevance_score: number | null
          source: string | null
          updated_at: string | null
          user_id: string
          value: Json
        }
        Insert: {
          access_count?: number | null
          agent_type: string
          confidence?: number | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          key: string
          last_accessed_at?: string | null
          memory_tier: string
          memory_type: string
          relevance_score?: number | null
          source?: string | null
          updated_at?: string | null
          user_id: string
          value: Json
        }
        Update: {
          access_count?: number | null
          agent_type?: string
          confidence?: number | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          key?: string
          last_accessed_at?: string | null
          memory_tier?: string
          memory_type?: string
          relevance_score?: number | null
          source?: string | null
          updated_at?: string | null
          user_id?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "agent_memory_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_music_playlists: {
        Row: {
          created_at: string | null
          description: string | null
          diversity_score: number | null
          generation_prompt: string | null
          id: string
          is_synced_to_spotify: boolean | null
          name: string
          novelty_score: number | null
          playlist_type: string
          relevance_score: number | null
          spotify_playlist_id: string | null
          spotify_playlist_url: string | null
          target_activity: string | null
          target_danceability: number | null
          target_duration_minutes: number | null
          target_energy: number | null
          target_mood: string | null
          target_tempo: number | null
          target_valence: number | null
          times_played: number | null
          tracks: Json | null
          updated_at: string | null
          user_feedback: string | null
          user_id: string
          user_rating: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          diversity_score?: number | null
          generation_prompt?: string | null
          id?: string
          is_synced_to_spotify?: boolean | null
          name: string
          novelty_score?: number | null
          playlist_type: string
          relevance_score?: number | null
          spotify_playlist_id?: string | null
          spotify_playlist_url?: string | null
          target_activity?: string | null
          target_danceability?: number | null
          target_duration_minutes?: number | null
          target_energy?: number | null
          target_mood?: string | null
          target_tempo?: number | null
          target_valence?: number | null
          times_played?: number | null
          tracks?: Json | null
          updated_at?: string | null
          user_feedback?: string | null
          user_id: string
          user_rating?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          diversity_score?: number | null
          generation_prompt?: string | null
          id?: string
          is_synced_to_spotify?: boolean | null
          name?: string
          novelty_score?: number | null
          playlist_type?: string
          relevance_score?: number | null
          spotify_playlist_id?: string | null
          spotify_playlist_url?: string | null
          target_activity?: string | null
          target_danceability?: number | null
          target_duration_minutes?: number | null
          target_energy?: number | null
          target_mood?: string | null
          target_tempo?: number | null
          target_valence?: number | null
          times_played?: number | null
          tracks?: Json | null
          updated_at?: string | null
          user_feedback?: string | null
          user_id?: string
          user_rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_music_playlists_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_music_preferences: {
        Row: {
          artist_preferences: Json | null
          confidence_score: number | null
          created_at: string | null
          genre_preferences: Json | null
          id: string
          last_learning_at: string | null
          listening_patterns: Json | null
          mood_preferences: Json | null
          preferred_acousticness: number | null
          preferred_danceability: number | null
          preferred_energy: number | null
          preferred_instrumentalness: number | null
          preferred_speechiness: number | null
          preferred_tempo: number | null
          preferred_valence: number | null
          total_tracks_analyzed: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          artist_preferences?: Json | null
          confidence_score?: number | null
          created_at?: string | null
          genre_preferences?: Json | null
          id?: string
          last_learning_at?: string | null
          listening_patterns?: Json | null
          mood_preferences?: Json | null
          preferred_acousticness?: number | null
          preferred_danceability?: number | null
          preferred_energy?: number | null
          preferred_instrumentalness?: number | null
          preferred_speechiness?: number | null
          preferred_tempo?: number | null
          preferred_valence?: number | null
          total_tracks_analyzed?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          artist_preferences?: Json | null
          confidence_score?: number | null
          created_at?: string | null
          genre_preferences?: Json | null
          id?: string
          last_learning_at?: string | null
          listening_patterns?: Json | null
          mood_preferences?: Json | null
          preferred_acousticness?: number | null
          preferred_danceability?: number | null
          preferred_energy?: number | null
          preferred_instrumentalness?: number | null
          preferred_speechiness?: number | null
          preferred_tempo?: number | null
          preferred_valence?: number | null
          total_tracks_analyzed?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_music_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_music_tracks: {
        Row: {
          acousticness: number | null
          activity_tags: Json | null
          album_name: string | null
          artist_name: string
          created_at: string | null
          danceability: number | null
          duration_ms: number | null
          embedding_vector: number[] | null
          energy: number | null
          genres: Json | null
          id: string
          instrumentalness: number | null
          last_played_at: string | null
          liveness: number | null
          loudness: number | null
          mood_tags: Json | null
          play_count: number | null
          release_date: string | null
          speechiness: number | null
          spotify_track_id: string
          tempo: number | null
          time_signature: number | null
          track_name: string
          updated_at: string | null
          user_id: string
          user_rating: number | null
          valence: number | null
        }
        Insert: {
          acousticness?: number | null
          activity_tags?: Json | null
          album_name?: string | null
          artist_name: string
          created_at?: string | null
          danceability?: number | null
          duration_ms?: number | null
          embedding_vector?: number[] | null
          energy?: number | null
          genres?: Json | null
          id?: string
          instrumentalness?: number | null
          last_played_at?: string | null
          liveness?: number | null
          loudness?: number | null
          mood_tags?: Json | null
          play_count?: number | null
          release_date?: string | null
          speechiness?: number | null
          spotify_track_id: string
          tempo?: number | null
          time_signature?: number | null
          track_name: string
          updated_at?: string | null
          user_id: string
          user_rating?: number | null
          valence?: number | null
        }
        Update: {
          acousticness?: number | null
          activity_tags?: Json | null
          album_name?: string | null
          artist_name?: string
          created_at?: string | null
          danceability?: number | null
          duration_ms?: number | null
          embedding_vector?: number[] | null
          energy?: number | null
          genres?: Json | null
          id?: string
          instrumentalness?: number | null
          last_played_at?: string | null
          liveness?: number | null
          loudness?: number | null
          mood_tags?: Json | null
          play_count?: number | null
          release_date?: string | null
          speechiness?: number | null
          spotify_track_id?: string
          tempo?: number | null
          time_signature?: number | null
          track_name?: string
          updated_at?: string | null
          user_id?: string
          user_rating?: number | null
          valence?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_music_tracks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_tasks: {
        Row: {
          agent_type: string
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          execution_time_ms: number | null
          id: string
          max_retries: number | null
          priority: number | null
          result: Json | null
          retry_count: number | null
          scheduled_for: string | null
          started_at: string | null
          status: string | null
          task_name: string
          task_parameters: Json | null
          task_prompt: string | null
          task_type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          agent_type: string
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          id?: string
          max_retries?: number | null
          priority?: number | null
          result?: Json | null
          retry_count?: number | null
          scheduled_for?: string | null
          started_at?: string | null
          status?: string | null
          task_name: string
          task_parameters?: Json | null
          task_prompt?: string | null
          task_type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          agent_type?: string
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          id?: string
          max_retries?: number | null
          priority?: number | null
          result?: Json | null
          retry_count?: number | null
          scheduled_for?: string | null
          started_at?: string | null
          status?: string | null
          task_name?: string
          task_parameters?: Json | null
          task_prompt?: string | null
          task_type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_tasks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_agent_betting_stats: {
        Row: {
          agent_id: string
          average_odds: number | null
          id: string
          last_featured_at: string | null
          losses: number | null
          markets_featured: number | null
          times_bet_on: number | null
          total_volume_on_agent: number | null
          updated_at: string | null
          win_rate: number | null
          wins: number | null
        }
        Insert: {
          agent_id: string
          average_odds?: number | null
          id?: string
          last_featured_at?: string | null
          losses?: number | null
          markets_featured?: number | null
          times_bet_on?: number | null
          total_volume_on_agent?: number | null
          updated_at?: string | null
          win_rate?: number | null
          wins?: number | null
        }
        Update: {
          agent_id?: string
          average_odds?: number | null
          id?: string
          last_featured_at?: string | null
          losses?: number | null
          markets_featured?: number | null
          times_bet_on?: number | null
          total_volume_on_agent?: number | null
          updated_at?: string | null
          win_rate?: number | null
          wins?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "aio_agent_betting_stats_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "aio_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_agent_domain_ratings: {
        Row: {
          agent_id: string
          competitions_in_domain: number
          domain_id: string
          elo_rating: number
          id: string
          rating_deviation: number | null
          updated_at: string
          volatility: number | null
          wins_in_domain: number
        }
        Insert: {
          agent_id: string
          competitions_in_domain?: number
          domain_id: string
          elo_rating?: number
          id?: string
          rating_deviation?: number | null
          updated_at?: string
          volatility?: number | null
          wins_in_domain?: number
        }
        Update: {
          agent_id?: string
          competitions_in_domain?: number
          domain_id?: string
          elo_rating?: number
          id?: string
          rating_deviation?: number | null
          updated_at?: string
          volatility?: number | null
          wins_in_domain?: number
        }
        Relationships: [
          {
            foreignKeyName: "aio_agent_domain_ratings_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "aio_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_agent_domain_ratings_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "aio_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_agent_popularity: {
        Row: {
          agent_id: string
          total_cheers: number | null
          total_mvp_votes: number | null
          total_win_predictions: number | null
        }
        Insert: {
          agent_id: string
          total_cheers?: number | null
          total_mvp_votes?: number | null
          total_win_predictions?: number | null
        }
        Update: {
          agent_id?: string
          total_cheers?: number | null
          total_mvp_votes?: number | null
          total_win_predictions?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "aio_agent_popularity_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "aio_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_agent_verification_history: {
        Row: {
          agent_id: string
          average_score: number | null
          created_at: string | null
          flag_reason: string | null
          id: string
          is_flagged: boolean | null
          median_response_time_ms: number | null
          total_passes: number | null
          total_verifications: number | null
          updated_at: string | null
        }
        Insert: {
          agent_id: string
          average_score?: number | null
          created_at?: string | null
          flag_reason?: string | null
          id?: string
          is_flagged?: boolean | null
          median_response_time_ms?: number | null
          total_passes?: number | null
          total_verifications?: number | null
          updated_at?: string | null
        }
        Update: {
          agent_id?: string
          average_score?: number | null
          created_at?: string | null
          flag_reason?: string | null
          id?: string
          is_flagged?: boolean | null
          median_response_time_ms?: number | null
          total_passes?: number | null
          total_verifications?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aio_agent_verification_history_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "aio_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_agents: {
        Row: {
          agent_type: string
          api_key_encrypted: string | null
          approval_note: string | null
          approval_status: string | null
          color: string | null
          created_at: string | null
          description: string | null
          elo_rating: number | null
          id: string
          is_active: boolean | null
          is_public: boolean | null
          last_verification_score: number | null
          last_verified_at: string | null
          model: string | null
          name: string
          owner_id: string
          persona_description: string | null
          persona_name: string | null
          persona_style: string | null
          provider: string | null
          rating_deviation: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          slug: string
          strategy: string | null
          system_prompt: string | null
          total_competitions: number | null
          total_wins: number | null
          verification_status: string | null
          volatility: number | null
          webhook_secret: string | null
          webhook_url: string | null
        }
        Insert: {
          agent_type: string
          api_key_encrypted?: string | null
          approval_note?: string | null
          approval_status?: string | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          elo_rating?: number | null
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          last_verification_score?: number | null
          last_verified_at?: string | null
          model?: string | null
          name: string
          owner_id: string
          persona_description?: string | null
          persona_name?: string | null
          persona_style?: string | null
          provider?: string | null
          rating_deviation?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          slug: string
          strategy?: string | null
          system_prompt?: string | null
          total_competitions?: number | null
          total_wins?: number | null
          verification_status?: string | null
          volatility?: number | null
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Update: {
          agent_type?: string
          api_key_encrypted?: string | null
          approval_note?: string | null
          approval_status?: string | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          elo_rating?: number | null
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          last_verification_score?: number | null
          last_verified_at?: string | null
          model?: string | null
          name?: string
          owner_id?: string
          persona_description?: string | null
          persona_name?: string | null
          persona_style?: string | null
          provider?: string | null
          rating_deviation?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          slug?: string
          strategy?: string | null
          system_prompt?: string | null
          total_competitions?: number | null
          total_wins?: number | null
          verification_status?: string | null
          volatility?: number | null
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aio_agents_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "aio_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_agents_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "aio_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_championship_participants: {
        Row: {
          agent_id: string
          championship_id: string
          current_rank: number | null
          id: string
          is_eliminated: boolean | null
          rounds_completed: number | null
          total_points: number | null
          user_id: string
        }
        Insert: {
          agent_id: string
          championship_id: string
          current_rank?: number | null
          id?: string
          is_eliminated?: boolean | null
          rounds_completed?: number | null
          total_points?: number | null
          user_id: string
        }
        Update: {
          agent_id?: string
          championship_id?: string
          current_rank?: number | null
          id?: string
          is_eliminated?: boolean | null
          rounds_completed?: number | null
          total_points?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aio_championship_participants_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "aio_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_championship_participants_championship_id_fkey"
            columns: ["championship_id"]
            isOneToOne: false
            referencedRelation: "aio_championships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_championship_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "aio_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_championship_round_results: {
        Row: {
          id: string
          participant_id: string
          points_awarded: number | null
          round_id: string
          round_rank: number | null
        }
        Insert: {
          id?: string
          participant_id: string
          points_awarded?: number | null
          round_id: string
          round_rank?: number | null
        }
        Update: {
          id?: string
          participant_id?: string
          points_awarded?: number | null
          round_id?: string
          round_rank?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "aio_championship_round_results_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "aio_championship_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_championship_round_results_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "aio_championship_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_championship_rounds: {
        Row: {
          championship_id: string
          competition_id: string | null
          id: string
          round_number: number
          scheduled_at: string | null
          status: string | null
          task_ids: string[] | null
        }
        Insert: {
          championship_id: string
          competition_id?: string | null
          id?: string
          round_number: number
          scheduled_at?: string | null
          status?: string | null
          task_ids?: string[] | null
        }
        Update: {
          championship_id?: string
          competition_id?: string | null
          id?: string
          round_number?: number
          scheduled_at?: string | null
          status?: string | null
          task_ids?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "aio_championship_rounds_championship_id_fkey"
            columns: ["championship_id"]
            isOneToOne: false
            referencedRelation: "aio_championships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_championship_rounds_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "aio_competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_championships: {
        Row: {
          created_at: string | null
          created_by: string | null
          current_round: number | null
          domain_id: string | null
          elimination_after_round: number | null
          ended_at: string | null
          entry_requirements: Json | null
          format: string | null
          id: string
          max_participants: number | null
          name: string
          points_config: Json | null
          registration_deadline: string | null
          round_schedule: Json | null
          started_at: string | null
          status: string | null
          total_rounds: number
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          current_round?: number | null
          domain_id?: string | null
          elimination_after_round?: number | null
          ended_at?: string | null
          entry_requirements?: Json | null
          format?: string | null
          id?: string
          max_participants?: number | null
          name: string
          points_config?: Json | null
          registration_deadline?: string | null
          round_schedule?: Json | null
          started_at?: string | null
          status?: string | null
          total_rounds?: number
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          current_round?: number | null
          domain_id?: string | null
          elimination_after_round?: number | null
          ended_at?: string | null
          entry_requirements?: Json | null
          format?: string | null
          id?: string
          max_participants?: number | null
          name?: string
          points_config?: Json | null
          registration_deadline?: string | null
          round_schedule?: Json | null
          started_at?: string | null
          status?: string | null
          total_rounds?: number
        }
        Relationships: [
          {
            foreignKeyName: "aio_championships_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "aio_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_championships_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "aio_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_competition_participants: {
        Row: {
          agent_id: string
          competition_id: string
          final_rank: number | null
          final_score: number | null
          id: string
          joined_at: string | null
          user_id: string
        }
        Insert: {
          agent_id: string
          competition_id: string
          final_rank?: number | null
          final_score?: number | null
          id?: string
          joined_at?: string | null
          user_id: string
        }
        Update: {
          agent_id?: string
          competition_id?: string
          final_rank?: number | null
          final_score?: number | null
          id?: string
          joined_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aio_competition_participants_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "aio_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_competition_participants_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "aio_competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_competition_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "aio_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_competitions: {
        Row: {
          created_at: string | null
          created_by: string | null
          domain_id: string | null
          ended_at: string | null
          entry_fee: number | null
          id: string
          max_participants: number | null
          name: string
          platform_fee_pct: number | null
          prize_pool: number | null
          scheduled_start: string | null
          stake_mode: string | null
          started_at: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          domain_id?: string | null
          ended_at?: string | null
          entry_fee?: number | null
          id?: string
          max_participants?: number | null
          name: string
          platform_fee_pct?: number | null
          prize_pool?: number | null
          scheduled_start?: string | null
          stake_mode?: string | null
          started_at?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          domain_id?: string | null
          ended_at?: string | null
          entry_fee?: number | null
          id?: string
          max_participants?: number | null
          name?: string
          platform_fee_pct?: number | null
          prize_pool?: number | null
          scheduled_start?: string | null
          stake_mode?: string | null
          started_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aio_competitions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "aio_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_competitions_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "aio_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_crypto_wallets: {
        Row: {
          created_at: string
          id: string
          is_verified: boolean
          user_id: string
          wallet_address: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_verified?: boolean
          user_id: string
          wallet_address: string
        }
        Update: {
          created_at?: string
          id?: string
          is_verified?: boolean
          user_id?: string
          wallet_address?: string
        }
        Relationships: []
      }
      aio_daily_challenges: {
        Row: {
          average_score: number | null
          bonus_multiplier: number | null
          challenge_date: string
          created_at: string | null
          game_type: string
          id: string
          participation_count: number | null
          puzzle_id: string | null
        }
        Insert: {
          average_score?: number | null
          bonus_multiplier?: number | null
          challenge_date?: string
          created_at?: string | null
          game_type: string
          id?: string
          participation_count?: number | null
          puzzle_id?: string | null
        }
        Update: {
          average_score?: number | null
          bonus_multiplier?: number | null
          challenge_date?: string
          created_at?: string | null
          game_type?: string
          id?: string
          participation_count?: number | null
          puzzle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aio_daily_challenges_game_type_fkey"
            columns: ["game_type"]
            isOneToOne: false
            referencedRelation: "aio_game_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_daily_challenges_puzzle_id_fkey"
            columns: ["puzzle_id"]
            isOneToOne: false
            referencedRelation: "aio_puzzles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_daily_challenges_puzzle_id_fkey"
            columns: ["puzzle_id"]
            isOneToOne: false
            referencedRelation: "aio_puzzles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_domains: {
        Row: {
          description: string | null
          icon: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      aio_elo_history: {
        Row: {
          agent_id: string
          competition_id: string
          created_at: string
          domain_id: string | null
          final_rank: number
          id: string
          participant_count: number
          rating_after: number
          rating_before: number
          rating_change: number
          rd_after: number | null
          rd_before: number | null
          volatility_after: number | null
          volatility_before: number | null
        }
        Insert: {
          agent_id: string
          competition_id: string
          created_at?: string
          domain_id?: string | null
          final_rank: number
          id?: string
          participant_count: number
          rating_after: number
          rating_before: number
          rating_change: number
          rd_after?: number | null
          rd_before?: number | null
          volatility_after?: number | null
          volatility_before?: number | null
        }
        Update: {
          agent_id?: string
          competition_id?: string
          created_at?: string
          domain_id?: string | null
          final_rank?: number
          id?: string
          participant_count?: number
          rating_after?: number
          rating_before?: number
          rating_change?: number
          rd_after?: number | null
          rd_before?: number | null
          volatility_after?: number | null
          volatility_before?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "aio_elo_history_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "aio_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_elo_history_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "aio_competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_elo_history_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "aio_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_exchange_credentials: {
        Row: {
          created_at: string
          encrypted_credentials: Json
          exchange: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          encrypted_credentials: Json
          exchange: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          encrypted_credentials?: Json
          exchange?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      aio_followed_traders: {
        Row: {
          created_at: string | null
          followed_id: string
          follower_id: string
          id: string
        }
        Insert: {
          created_at?: string | null
          followed_id: string
          follower_id: string
          id?: string
        }
        Update: {
          created_at?: string | null
          followed_id?: string
          follower_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aio_followed_traders_followed_id_fkey"
            columns: ["followed_id"]
            isOneToOne: false
            referencedRelation: "aio_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_followed_traders_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "aio_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_game_leaderboards: {
        Row: {
          accuracy: number | null
          agent_id: string | null
          average_time_ms: number | null
          best_streak: number | null
          game_type: string
          id: string
          last_played_at: string | null
          puzzles_attempted: number | null
          puzzles_solved: number | null
          sessions_completed: number | null
          total_score: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          accuracy?: number | null
          agent_id?: string | null
          average_time_ms?: number | null
          best_streak?: number | null
          game_type: string
          id?: string
          last_played_at?: string | null
          puzzles_attempted?: number | null
          puzzles_solved?: number | null
          sessions_completed?: number | null
          total_score?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          accuracy?: number | null
          agent_id?: string | null
          average_time_ms?: number | null
          best_streak?: number | null
          game_type?: string
          id?: string
          last_played_at?: string | null
          puzzles_attempted?: number | null
          puzzles_solved?: number | null
          sessions_completed?: number | null
          total_score?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aio_game_leaderboards_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "aio_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_game_leaderboards_game_type_fkey"
            columns: ["game_type"]
            isOneToOne: false
            referencedRelation: "aio_game_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_game_leaderboards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "aio_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_game_sessions: {
        Row: {
          agent_id: string | null
          best_streak: number | null
          completed_at: string | null
          difficulty: string
          game_type: string
          id: string
          puzzles_completed: number | null
          puzzles_correct: number | null
          started_at: string | null
          status: string | null
          streak: number | null
          total_puzzles: number | null
          total_score: number | null
          total_time_ms: number | null
          user_id: string | null
        }
        Insert: {
          agent_id?: string | null
          best_streak?: number | null
          completed_at?: string | null
          difficulty: string
          game_type: string
          id?: string
          puzzles_completed?: number | null
          puzzles_correct?: number | null
          started_at?: string | null
          status?: string | null
          streak?: number | null
          total_puzzles?: number | null
          total_score?: number | null
          total_time_ms?: number | null
          user_id?: string | null
        }
        Update: {
          agent_id?: string | null
          best_streak?: number | null
          completed_at?: string | null
          difficulty?: string
          game_type?: string
          id?: string
          puzzles_completed?: number | null
          puzzles_correct?: number | null
          started_at?: string | null
          status?: string | null
          streak?: number | null
          total_puzzles?: number | null
          total_score?: number | null
          total_time_ms?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aio_game_sessions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "aio_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_game_sessions_game_type_fkey"
            columns: ["game_type"]
            isOneToOne: false
            referencedRelation: "aio_game_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_game_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "aio_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_game_types: {
        Row: {
          category: string | null
          config: Json | null
          created_at: string | null
          description: string | null
          difficulty_levels: string[] | null
          external_api: string | null
          icon: string | null
          id: string
          instructions: string | null
          max_score: number | null
          name: string
          supports_ai: boolean | null
          supports_human: boolean | null
          time_limit_seconds: number | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          config?: Json | null
          created_at?: string | null
          description?: string | null
          difficulty_levels?: string[] | null
          external_api?: string | null
          icon?: string | null
          id: string
          instructions?: string | null
          max_score?: number | null
          name: string
          supports_ai?: boolean | null
          supports_human?: boolean | null
          time_limit_seconds?: number | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          config?: Json | null
          created_at?: string | null
          description?: string | null
          difficulty_levels?: string[] | null
          external_api?: string | null
          icon?: string | null
          id?: string
          instructions?: string | null
          max_score?: number | null
          name?: string
          supports_ai?: boolean | null
          supports_human?: boolean | null
          time_limit_seconds?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      aio_market_resolutions: {
        Row: {
          affected_bets_count: number
          id: string
          market_id: string
          market_source: string
          resolution: string
          resolution_source: string
          resolved_at: string
          total_payout_cents: number
        }
        Insert: {
          affected_bets_count?: number
          id?: string
          market_id: string
          market_source: string
          resolution: string
          resolution_source?: string
          resolved_at?: string
          total_payout_cents?: number
        }
        Update: {
          affected_bets_count?: number
          id?: string
          market_id?: string
          market_source?: string
          resolution?: string
          resolution_source?: string
          resolved_at?: string
          total_payout_cents?: number
        }
        Relationships: []
      }
      aio_market_snapshots: {
        Row: {
          close_time: string | null
          creator_username: string | null
          fetched_at: string | null
          id: string
          is_resolved: boolean | null
          manifold_market_id: string
          outcome_type: string | null
          pool: Json | null
          probability: number | null
          question: string
          resolution: string | null
          url: string | null
          volume: number | null
        }
        Insert: {
          close_time?: string | null
          creator_username?: string | null
          fetched_at?: string | null
          id?: string
          is_resolved?: boolean | null
          manifold_market_id: string
          outcome_type?: string | null
          pool?: Json | null
          probability?: number | null
          question: string
          resolution?: string | null
          url?: string | null
          volume?: number | null
        }
        Update: {
          close_time?: string | null
          creator_username?: string | null
          fetched_at?: string | null
          id?: string
          is_resolved?: boolean | null
          manifold_market_id?: string
          outcome_type?: string | null
          pool?: Json | null
          probability?: number | null
          question?: string
          resolution?: string | null
          url?: string | null
          volume?: number | null
        }
        Relationships: []
      }
      aio_markets: {
        Row: {
          category: string | null
          close_time: number | null
          created_at: string | null
          description: string | null
          id: string
          image: string | null
          liquidity: number | null
          outcomes: Json | null
          question: string
          source: string
          status: string | null
          synced_at: string | null
          total_volume: number | null
          url: string | null
          volume_24h: number | null
        }
        Insert: {
          category?: string | null
          close_time?: number | null
          created_at?: string | null
          description?: string | null
          id: string
          image?: string | null
          liquidity?: number | null
          outcomes?: Json | null
          question: string
          source?: string
          status?: string | null
          synced_at?: string | null
          total_volume?: number | null
          url?: string | null
          volume_24h?: number | null
        }
        Update: {
          category?: string | null
          close_time?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          image?: string | null
          liquidity?: number | null
          outcomes?: Json | null
          question?: string
          source?: string
          status?: string | null
          synced_at?: string | null
          total_volume?: number | null
          url?: string | null
          volume_24h?: number | null
        }
        Relationships: []
      }
      aio_meta_market_bets: {
        Row: {
          actual_payout: number | null
          amount: number
          created_at: string | null
          id: string
          market_id: string
          odds_at_bet: number
          outcome_id: string
          outcome_name: string
          potential_payout: number
          settled_at: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          actual_payout?: number | null
          amount: number
          created_at?: string | null
          id?: string
          market_id: string
          odds_at_bet: number
          outcome_id: string
          outcome_name: string
          potential_payout: number
          settled_at?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          actual_payout?: number | null
          amount?: number
          created_at?: string | null
          id?: string
          market_id?: string
          odds_at_bet?: number
          outcome_id?: string
          outcome_name?: string
          potential_payout?: number
          settled_at?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aio_meta_market_bets_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "aio_active_meta_markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_meta_market_bets_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "aio_meta_markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_meta_market_bets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "aio_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_meta_market_odds_history: {
        Row: {
          id: string
          market_id: string
          odds: number
          outcome_id: string
          recorded_at: string | null
        }
        Insert: {
          id?: string
          market_id: string
          odds: number
          outcome_id: string
          recorded_at?: string | null
        }
        Update: {
          id?: string
          market_id?: string
          odds?: number
          outcome_id?: string
          recorded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aio_meta_market_odds_history_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "aio_active_meta_markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_meta_market_odds_history_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "aio_meta_markets"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_meta_markets: {
        Row: {
          competition_id: string | null
          created_at: string | null
          current_odds: Json | null
          description: string | null
          id: string
          locks_at: string | null
          market_type: string | null
          opens_at: string | null
          outcomes: Json
          question: string
          resolution_data: Json | null
          resolved_outcome: string | null
          resolves_at: string | null
          status: string | null
          total_bets: number | null
          total_volume: number | null
          updated_at: string | null
        }
        Insert: {
          competition_id?: string | null
          created_at?: string | null
          current_odds?: Json | null
          description?: string | null
          id?: string
          locks_at?: string | null
          market_type?: string | null
          opens_at?: string | null
          outcomes: Json
          question: string
          resolution_data?: Json | null
          resolved_outcome?: string | null
          resolves_at?: string | null
          status?: string | null
          total_bets?: number | null
          total_volume?: number | null
          updated_at?: string | null
        }
        Update: {
          competition_id?: string | null
          created_at?: string | null
          current_odds?: Json | null
          description?: string | null
          id?: string
          locks_at?: string | null
          market_type?: string | null
          opens_at?: string | null
          outcomes?: Json
          question?: string
          resolution_data?: Json | null
          resolved_outcome?: string | null
          resolves_at?: string | null
          status?: string | null
          total_bets?: number | null
          total_volume?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aio_meta_markets_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "aio_competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_prediction_competitions: {
        Row: {
          allowed_market_types: string[] | null
          competition_id: string | null
          created_at: string | null
          id: string
          market_ids: string[] | null
          market_query: string | null
          max_bet_size: number | null
          resolution_mode: string | null
          starting_balance: number | null
        }
        Insert: {
          allowed_market_types?: string[] | null
          competition_id?: string | null
          created_at?: string | null
          id?: string
          market_ids?: string[] | null
          market_query?: string | null
          max_bet_size?: number | null
          resolution_mode?: string | null
          starting_balance?: number | null
        }
        Update: {
          allowed_market_types?: string[] | null
          competition_id?: string | null
          created_at?: string | null
          id?: string
          market_ids?: string[] | null
          market_query?: string | null
          max_bet_size?: number | null
          resolution_mode?: string | null
          starting_balance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "aio_prediction_competitions_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: true
            referencedRelation: "aio_competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          id: string
          is_admin: boolean | null
          is_verified: boolean | null
          username: string
          wallet_balance: number | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          id: string
          is_admin?: boolean | null
          is_verified?: boolean | null
          username: string
          wallet_balance?: number | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          is_admin?: boolean | null
          is_verified?: boolean | null
          username?: string
          wallet_balance?: number | null
        }
        Relationships: []
      }
      aio_puzzle_attempts: {
        Row: {
          agent_id: string | null
          correct_answer: string | null
          created_at: string | null
          difficulty: string
          game_type: string
          hints_used: number | null
          id: string
          is_correct: boolean | null
          puzzle_id: string | null
          question: string | null
          score: number | null
          time_ms: number | null
          user_answer: string | null
          user_id: string | null
        }
        Insert: {
          agent_id?: string | null
          correct_answer?: string | null
          created_at?: string | null
          difficulty: string
          game_type: string
          hints_used?: number | null
          id?: string
          is_correct?: boolean | null
          puzzle_id?: string | null
          question?: string | null
          score?: number | null
          time_ms?: number | null
          user_answer?: string | null
          user_id?: string | null
        }
        Update: {
          agent_id?: string | null
          correct_answer?: string | null
          created_at?: string | null
          difficulty?: string
          game_type?: string
          hints_used?: number | null
          id?: string
          is_correct?: boolean | null
          puzzle_id?: string | null
          question?: string | null
          score?: number | null
          time_ms?: number | null
          user_answer?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aio_puzzle_attempts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "aio_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_puzzle_attempts_game_type_fkey"
            columns: ["game_type"]
            isOneToOne: false
            referencedRelation: "aio_game_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_puzzle_attempts_puzzle_id_fkey"
            columns: ["puzzle_id"]
            isOneToOne: false
            referencedRelation: "aio_puzzles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_puzzle_attempts_puzzle_id_fkey"
            columns: ["puzzle_id"]
            isOneToOne: false
            referencedRelation: "aio_puzzles_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_puzzle_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "aio_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_puzzles: {
        Row: {
          answer_data: Json | null
          correct_answer: string | null
          created_at: string | null
          difficulty: string
          explanation: string | null
          game_type: string
          hint: string | null
          id: string
          metadata: Json | null
          options: Json | null
          points: number | null
          puzzle_id: string | null
          question: string
          source: string | null
          time_limit_seconds: number | null
        }
        Insert: {
          answer_data?: Json | null
          correct_answer?: string | null
          created_at?: string | null
          difficulty: string
          explanation?: string | null
          game_type: string
          hint?: string | null
          id?: string
          metadata?: Json | null
          options?: Json | null
          points?: number | null
          puzzle_id?: string | null
          question: string
          source?: string | null
          time_limit_seconds?: number | null
        }
        Update: {
          answer_data?: Json | null
          correct_answer?: string | null
          created_at?: string | null
          difficulty?: string
          explanation?: string | null
          game_type?: string
          hint?: string | null
          id?: string
          metadata?: Json | null
          options?: Json | null
          points?: number | null
          puzzle_id?: string | null
          question?: string
          source?: string | null
          time_limit_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "aio_puzzles_game_type_fkey"
            columns: ["game_type"]
            isOneToOne: false
            referencedRelation: "aio_game_types"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_real_bets: {
        Row: {
          amount_cents: number
          created_at: string
          exchange_order_id: string | null
          id: string
          market_id: string
          market_source: string
          outcome: string
          payout_cents: number | null
          price_per_share: number | null
          resolution: string | null
          resolved: boolean
          shares: number | null
          status: string
          updated_at: string
          user_id: string
          wallet_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          exchange_order_id?: string | null
          id?: string
          market_id: string
          market_source: string
          outcome: string
          payout_cents?: number | null
          price_per_share?: number | null
          resolution?: string | null
          resolved?: boolean
          shares?: number | null
          status?: string
          updated_at?: string
          user_id: string
          wallet_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          exchange_order_id?: string | null
          id?: string
          market_id?: string
          market_source?: string
          outcome?: string
          payout_cents?: number | null
          price_per_share?: number | null
          resolution?: string | null
          resolved?: boolean
          shares?: number | null
          status?: string
          updated_at?: string
          user_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aio_real_bets_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "aio_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_real_positions: {
        Row: {
          avg_price: number
          id: string
          market_id: string
          market_source: string
          outcome: string
          total_cost_cents: number
          total_shares: number
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_price?: number
          id?: string
          market_id: string
          market_source: string
          outcome: string
          total_cost_cents?: number
          total_shares?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_price?: number
          id?: string
          market_id?: string
          market_source?: string
          outcome?: string
          total_cost_cents?: number
          total_shares?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      aio_spectator_votes: {
        Row: {
          agent_id: string
          competition_id: string
          created_at: string | null
          id: string
          user_id: string
          vote_type: string | null
        }
        Insert: {
          agent_id: string
          competition_id: string
          created_at?: string | null
          id?: string
          user_id: string
          vote_type?: string | null
        }
        Update: {
          agent_id?: string
          competition_id?: string
          created_at?: string | null
          id?: string
          user_id?: string
          vote_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aio_spectator_votes_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "aio_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_spectator_votes_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "aio_competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_spectator_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "aio_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_stripe_customers: {
        Row: {
          created_at: string
          stripe_customer_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          stripe_customer_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          stripe_customer_id?: string
          user_id?: string
        }
        Relationships: []
      }
      aio_sync_status: {
        Row: {
          error: string | null
          id: string
          last_full_sync: string | null
          last_incremental_sync: string | null
          sync_duration_ms: number | null
          total_markets: number | null
          updated_at: string | null
        }
        Insert: {
          error?: string | null
          id: string
          last_full_sync?: string | null
          last_incremental_sync?: string | null
          sync_duration_ms?: number | null
          total_markets?: number | null
          updated_at?: string | null
        }
        Update: {
          error?: string | null
          id?: string
          last_full_sync?: string | null
          last_incremental_sync?: string | null
          sync_duration_ms?: number | null
          total_markets?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      aio_tournament_matches: {
        Row: {
          agent_1_id: string | null
          agent_1_score: number | null
          agent_2_id: string | null
          agent_2_score: number | null
          competition_id: string | null
          id: string
          is_bye: boolean | null
          match_number: number
          round_number: number
          status: string | null
          tournament_id: string
          winner_id: string | null
        }
        Insert: {
          agent_1_id?: string | null
          agent_1_score?: number | null
          agent_2_id?: string | null
          agent_2_score?: number | null
          competition_id?: string | null
          id?: string
          is_bye?: boolean | null
          match_number: number
          round_number: number
          status?: string | null
          tournament_id: string
          winner_id?: string | null
        }
        Update: {
          agent_1_id?: string | null
          agent_1_score?: number | null
          agent_2_id?: string | null
          agent_2_score?: number | null
          competition_id?: string | null
          id?: string
          is_bye?: boolean | null
          match_number?: number
          round_number?: number
          status?: string | null
          tournament_id?: string
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aio_tournament_matches_agent_1_id_fkey"
            columns: ["agent_1_id"]
            isOneToOne: false
            referencedRelation: "aio_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_tournament_matches_agent_2_id_fkey"
            columns: ["agent_2_id"]
            isOneToOne: false
            referencedRelation: "aio_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_tournament_matches_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "aio_competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_tournament_matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "aio_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_tournament_matches_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "aio_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_tournament_participants: {
        Row: {
          agent_id: string
          final_placement: number | null
          id: string
          matches_lost: number | null
          matches_won: number | null
          seed_number: number | null
          total_score: number | null
          tournament_id: string
          user_id: string
        }
        Insert: {
          agent_id: string
          final_placement?: number | null
          id?: string
          matches_lost?: number | null
          matches_won?: number | null
          seed_number?: number | null
          total_score?: number | null
          tournament_id: string
          user_id: string
        }
        Update: {
          agent_id?: string
          final_placement?: number | null
          id?: string
          matches_lost?: number | null
          matches_won?: number | null
          seed_number?: number | null
          total_score?: number | null
          tournament_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aio_tournament_participants_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "aio_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_tournament_participants_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "aio_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_tournament_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "aio_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_tournaments: {
        Row: {
          best_of: number | null
          bracket_data: Json | null
          bracket_type: string
          created_at: string | null
          created_by: string | null
          current_round: number | null
          domain_id: string | null
          ended_at: string | null
          id: string
          max_participants: number | null
          name: string
          seeds: Json | null
          started_at: string | null
          status: string | null
          task_ids: string[] | null
          total_rounds: number | null
        }
        Insert: {
          best_of?: number | null
          bracket_data?: Json | null
          bracket_type: string
          created_at?: string | null
          created_by?: string | null
          current_round?: number | null
          domain_id?: string | null
          ended_at?: string | null
          id?: string
          max_participants?: number | null
          name: string
          seeds?: Json | null
          started_at?: string | null
          status?: string | null
          task_ids?: string[] | null
          total_rounds?: number | null
        }
        Update: {
          best_of?: number | null
          bracket_data?: Json | null
          bracket_type?: string
          created_at?: string | null
          created_by?: string | null
          current_round?: number | null
          domain_id?: string | null
          ended_at?: string | null
          id?: string
          max_participants?: number | null
          name?: string
          seeds?: Json | null
          started_at?: string | null
          status?: string | null
          task_ids?: string[] | null
          total_rounds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "aio_tournaments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "aio_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_tournaments_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "aio_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_trade_notifications: {
        Row: {
          bet_id: string
          created_at: string | null
          id: string
          read: boolean | null
          trader_id: string
          user_id: string
        }
        Insert: {
          bet_id: string
          created_at?: string | null
          id?: string
          read?: boolean | null
          trader_id: string
          user_id: string
        }
        Update: {
          bet_id?: string
          created_at?: string | null
          id?: string
          read?: boolean | null
          trader_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aio_trade_notifications_bet_id_fkey"
            columns: ["bet_id"]
            isOneToOne: false
            referencedRelation: "aio_recent_trades"
            referencedColumns: ["bet_id"]
          },
          {
            foreignKeyName: "aio_trade_notifications_bet_id_fkey"
            columns: ["bet_id"]
            isOneToOne: false
            referencedRelation: "aio_user_bets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_trade_notifications_trader_id_fkey"
            columns: ["trader_id"]
            isOneToOne: false
            referencedRelation: "aio_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_trade_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "aio_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_transactions: {
        Row: {
          amount_cents: number
          balance_after_cents: number | null
          created_at: string
          id: string
          idempotency_key: string | null
          metadata: Json
          provider: string | null
          provider_ref: string | null
          status: string
          type: string
          wallet_id: string
        }
        Insert: {
          amount_cents: number
          balance_after_cents?: number | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          provider?: string | null
          provider_ref?: string | null
          status?: string
          type: string
          wallet_id: string
        }
        Update: {
          amount_cents?: number
          balance_after_cents?: number | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          provider?: string | null
          provider_ref?: string | null
          status?: string
          type?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aio_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "aio_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_user_bets: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          market_category: string | null
          market_id: string
          market_question: string | null
          market_source: string
          outcome: string
          payout: number | null
          portfolio_id: string | null
          price_at_bet: number | null
          probability_at_bet: number
          profit: number | null
          resolution: string | null
          resolved: boolean | null
          resolved_at: string | null
          shares: number
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          market_category?: string | null
          market_id: string
          market_question?: string | null
          market_source: string
          outcome: string
          payout?: number | null
          portfolio_id?: string | null
          price_at_bet?: number | null
          probability_at_bet: number
          profit?: number | null
          resolution?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          shares: number
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          market_category?: string | null
          market_id?: string
          market_question?: string | null
          market_source?: string
          outcome?: string
          payout?: number | null
          portfolio_id?: string | null
          price_at_bet?: number | null
          probability_at_bet?: number
          profit?: number | null
          resolution?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          shares?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aio_user_bets_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "aio_user_portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_user_bets_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "aio_user_prediction_leaderboard"
            referencedColumns: ["portfolio_id"]
          },
          {
            foreignKeyName: "aio_user_bets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "aio_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_user_portfolios: {
        Row: {
          best_streak: number | null
          brier_score: number | null
          created_at: string | null
          current_streak: number | null
          id: string
          starting_balance: number | null
          total_bets: number | null
          total_profit: number | null
          total_volume: number | null
          updated_at: string | null
          user_id: string
          virtual_balance: number | null
          winning_bets: number | null
        }
        Insert: {
          best_streak?: number | null
          brier_score?: number | null
          created_at?: string | null
          current_streak?: number | null
          id?: string
          starting_balance?: number | null
          total_bets?: number | null
          total_profit?: number | null
          total_volume?: number | null
          updated_at?: string | null
          user_id: string
          virtual_balance?: number | null
          winning_bets?: number | null
        }
        Update: {
          best_streak?: number | null
          brier_score?: number | null
          created_at?: string | null
          current_streak?: number | null
          id?: string
          starting_balance?: number | null
          total_bets?: number | null
          total_profit?: number | null
          total_volume?: number | null
          updated_at?: string | null
          user_id?: string
          virtual_balance?: number | null
          winning_bets?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "aio_user_portfolios_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "aio_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_user_positions: {
        Row: {
          average_cost: number
          current_value: number | null
          id: string
          market_category: string | null
          market_id: string
          market_question: string | null
          market_source: string
          outcome: string
          portfolio_id: string | null
          shares: number
          total_cost: number
          unrealized_pnl: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          average_cost: number
          current_value?: number | null
          id?: string
          market_category?: string | null
          market_id: string
          market_question?: string | null
          market_source: string
          outcome: string
          portfolio_id?: string | null
          shares: number
          total_cost: number
          unrealized_pnl?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          average_cost?: number
          current_value?: number | null
          id?: string
          market_category?: string | null
          market_id?: string
          market_question?: string | null
          market_source?: string
          outcome?: string
          portfolio_id?: string | null
          shares?: number
          total_cost?: number
          unrealized_pnl?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aio_user_positions_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "aio_user_portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_user_positions_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "aio_user_prediction_leaderboard"
            referencedColumns: ["portfolio_id"]
          },
          {
            foreignKeyName: "aio_user_positions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "aio_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_verification_challenges: {
        Row: {
          actual_answer: Json | null
          challenge_payload: Json
          challenge_type: string
          created_at: string | null
          expected_answer: Json | null
          id: string
          passed: boolean | null
          response_time_ms: number | null
          score: number | null
          session_id: string
        }
        Insert: {
          actual_answer?: Json | null
          challenge_payload?: Json
          challenge_type: string
          created_at?: string | null
          expected_answer?: Json | null
          id?: string
          passed?: boolean | null
          response_time_ms?: number | null
          score?: number | null
          session_id: string
        }
        Update: {
          actual_answer?: Json | null
          challenge_payload?: Json
          challenge_type?: string
          created_at?: string | null
          expected_answer?: Json | null
          id?: string
          passed?: boolean | null
          response_time_ms?: number | null
          score?: number | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aio_verification_challenges_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "aio_verification_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_verification_sessions: {
        Row: {
          agent_id: string
          behavioral_score: number | null
          competition_id: string | null
          completed_at: string | null
          created_at: string | null
          expected_answers_encrypted: string | null
          expires_at: string
          id: string
          session_type: string
          speed_score: number | null
          started_at: string | null
          status: string
          structured_score: number | null
          verification_score: number | null
        }
        Insert: {
          agent_id: string
          behavioral_score?: number | null
          competition_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          expected_answers_encrypted?: string | null
          expires_at?: string
          id?: string
          session_type?: string
          speed_score?: number | null
          started_at?: string | null
          status?: string
          structured_score?: number | null
          verification_score?: number | null
        }
        Update: {
          agent_id?: string
          behavioral_score?: number | null
          competition_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          expected_answers_encrypted?: string | null
          expires_at?: string
          id?: string
          session_type?: string
          speed_score?: number | null
          started_at?: string | null
          status?: string
          structured_score?: number | null
          verification_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "aio_verification_sessions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "aio_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_verification_sessions_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "aio_competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_virtual_bets: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          manifold_market_id: string
          market_question: string | null
          market_url: string | null
          outcome: string
          payout: number | null
          pool_snapshot: Json | null
          portfolio_id: string
          probability_at_bet: number
          resolution: string | null
          resolved: boolean | null
          resolved_at: string | null
          shares: number
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          manifold_market_id: string
          market_question?: string | null
          market_url?: string | null
          outcome: string
          payout?: number | null
          pool_snapshot?: Json | null
          portfolio_id: string
          probability_at_bet: number
          resolution?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          shares: number
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          manifold_market_id?: string
          market_question?: string | null
          market_url?: string | null
          outcome?: string
          payout?: number | null
          pool_snapshot?: Json | null
          portfolio_id?: string
          probability_at_bet?: number
          resolution?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          shares?: number
        }
        Relationships: [
          {
            foreignKeyName: "aio_virtual_bets_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "aio_prediction_leaderboard"
            referencedColumns: ["portfolio_id"]
          },
          {
            foreignKeyName: "aio_virtual_bets_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "aio_virtual_portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_virtual_portfolios: {
        Row: {
          agent_id: string
          brier_score: number | null
          competition_id: string
          created_at: string | null
          current_balance: number
          final_score: number | null
          id: string
          starting_balance: number
          total_profit: number | null
          updated_at: string | null
        }
        Insert: {
          agent_id: string
          brier_score?: number | null
          competition_id: string
          created_at?: string | null
          current_balance?: number
          final_score?: number | null
          id?: string
          starting_balance?: number
          total_profit?: number | null
          updated_at?: string | null
        }
        Update: {
          agent_id?: string
          brier_score?: number | null
          competition_id?: string
          created_at?: string | null
          current_balance?: number
          final_score?: number | null
          id?: string
          starting_balance?: number
          total_profit?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aio_virtual_portfolios_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "aio_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_virtual_portfolios_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "aio_competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_wallets: {
        Row: {
          balance_cents: number
          created_at: string
          currency: string
          id: string
          pending_cents: number
          total_deposited_cents: number
          total_withdrawn_cents: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance_cents?: number
          created_at?: string
          currency?: string
          id?: string
          pending_cents?: number
          total_deposited_cents?: number
          total_withdrawn_cents?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance_cents?: number
          created_at?: string
          currency?: string
          id?: string
          pending_cents?: number
          total_deposited_cents?: number
          total_withdrawn_cents?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          created_at: string | null
          event_data: Json | null
          event_type: string
          id: string
          ip_address: string | null
          session_id: string | null
          timestamp: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          ip_address?: string | null
          session_id?: string | null
          timestamp?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          ip_address?: string | null
          session_id?: string | null
          timestamp?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      analytics_sessions: {
        Row: {
          created_at: string | null
          duration_seconds: number | null
          ended_at: string | null
          events_count: number | null
          id: string
          ip_address: string | null
          page_views: number | null
          session_id: string
          started_at: string | null
          updated_at: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          events_count?: number | null
          id?: string
          ip_address?: string | null
          page_views?: number | null
          session_id: string
          started_at?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          events_count?: number | null
          id?: string
          ip_address?: string | null
          page_views?: number | null
          session_id?: string
          started_at?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          key_hash: string
          last_used_at: string | null
          name: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_hash: string
          last_used_at?: string | null
          name?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_hash?: string
          last_used_at?: string | null
          name?: string | null
          user_id?: string
        }
        Relationships: []
      }
      audience_configurations: {
        Row: {
          cluster_overrides: Json | null
          color: string | null
          created_at: string | null
          default_privacy_level: number
          description: string | null
          icon: string | null
          id: string
          is_custom: boolean | null
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cluster_overrides?: Json | null
          color?: string | null
          created_at?: string | null
          default_privacy_level?: number
          description?: string | null
          icon?: string | null
          id?: string
          is_custom?: boolean | null
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cluster_overrides?: Json | null
          color?: string | null
          created_at?: string | null
          default_privacy_level?: number
          description?: string | null
          icon?: string | null
          id?: string
          is_custom?: boolean | null
          name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      automation_rules: {
        Row: {
          actions: Json
          conditions: Json
          confidence_threshold: number | null
          created_at: string | null
          executions_count: number | null
          id: string
          is_active: boolean | null
          last_triggered: string | null
          max_daily_executions: number | null
          requires_approval: boolean | null
          rule_name: string
          rule_type: string
          success_rate: number | null
          user_id: string
          user_satisfaction_score: number | null
        }
        Insert: {
          actions: Json
          conditions: Json
          confidence_threshold?: number | null
          created_at?: string | null
          executions_count?: number | null
          id?: string
          is_active?: boolean | null
          last_triggered?: string | null
          max_daily_executions?: number | null
          requires_approval?: boolean | null
          rule_name: string
          rule_type: string
          success_rate?: number | null
          user_id: string
          user_satisfaction_score?: number | null
        }
        Update: {
          actions?: Json
          conditions?: Json
          confidence_threshold?: number | null
          created_at?: string | null
          executions_count?: number | null
          id?: string
          is_active?: boolean | null
          last_triggered?: string | null
          max_daily_executions?: number | null
          requires_approval?: boolean | null
          rule_name?: string
          rule_type?: string
          success_rate?: number | null
          user_id?: string
          user_satisfaction_score?: number | null
        }
        Relationships: []
      }
      behavioral_evidence: {
        Row: {
          confidence_score: number | null
          correlation_strength: number | null
          created_at: string | null
          dimension: string
          evidence_description: string | null
          feature_name: string
          feature_value: number
          id: string
          platform: string
          raw_value: Json | null
          research_citation: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          confidence_score?: number | null
          correlation_strength?: number | null
          created_at?: string | null
          dimension: string
          evidence_description?: string | null
          feature_name: string
          feature_value: number
          id?: string
          platform: string
          raw_value?: Json | null
          research_citation?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          confidence_score?: number | null
          correlation_strength?: number | null
          created_at?: string | null
          dimension?: string
          evidence_description?: string | null
          feature_name?: string
          feature_value?: number
          id?: string
          platform?: string
          raw_value?: Json | null
          research_citation?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      behavioral_features: {
        Row: {
          confidence_score: number | null
          contributes_to: string | null
          contribution_weight: number | null
          evidence: Json | null
          extracted_at: string | null
          feature_type: string
          feature_value: number
          id: string
          normalized_value: number | null
          platform: string
          sample_size: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          confidence_score?: number | null
          contributes_to?: string | null
          contribution_weight?: number | null
          evidence?: Json | null
          extracted_at?: string | null
          feature_type: string
          feature_value: number
          id?: string
          normalized_value?: number | null
          platform: string
          sample_size?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          confidence_score?: number | null
          contributes_to?: string | null
          contribution_weight?: number | null
          evidence?: Json | null
          extracted_at?: string | null
          feature_type?: string
          feature_value?: number
          id?: string
          normalized_value?: number | null
          platform?: string
          sample_size?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "behavioral_features_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      behavioral_inferences: {
        Row: {
          actual_event: string | null
          confidence: number
          created_at: string
          feedback_at: string | null
          id: string
          inference_type: string
          is_confirmed: boolean | null
          signals: Json
          summary: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          actual_event?: string | null
          confidence: number
          created_at?: string
          feedback_at?: string | null
          id?: string
          inference_type: string
          is_confirmed?: boolean | null
          signals?: Json
          summary?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          actual_event?: string | null
          confidence?: number
          created_at?: string
          feedback_at?: string | null
          id?: string
          inference_type?: string
          is_confirmed?: boolean | null
          signals?: Json
          summary?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      behavioral_patterns: {
        Row: {
          ai_insight: string | null
          auto_detected: boolean | null
          confidence_score: number | null
          consistency_rate: number | null
          created_at: string | null
          emotional_state: string | null
          first_observed_at: string
          hypothesized_purpose: string | null
          id: string
          is_active: boolean | null
          last_confidence_update: string | null
          last_confirmed: string | null
          last_observed_at: string
          next_predicted_occurrence: string | null
          occurrence_count: number | null
          pattern_description: string | null
          pattern_name: string
          pattern_type: string
          response_data: Json
          response_platform: string
          response_type: string
          time_offset_minutes: number
          time_window_minutes: number | null
          trigger_keywords: Json | null
          trigger_metadata: Json | null
          trigger_type: string | null
          updated_at: string | null
          user_confirmed: boolean | null
          user_id: string
          user_notes: string | null
        }
        Insert: {
          ai_insight?: string | null
          auto_detected?: boolean | null
          confidence_score?: number | null
          consistency_rate?: number | null
          created_at?: string | null
          emotional_state?: string | null
          first_observed_at: string
          hypothesized_purpose?: string | null
          id?: string
          is_active?: boolean | null
          last_confidence_update?: string | null
          last_confirmed?: string | null
          last_observed_at: string
          next_predicted_occurrence?: string | null
          occurrence_count?: number | null
          pattern_description?: string | null
          pattern_name: string
          pattern_type: string
          response_data: Json
          response_platform: string
          response_type: string
          time_offset_minutes: number
          time_window_minutes?: number | null
          trigger_keywords?: Json | null
          trigger_metadata?: Json | null
          trigger_type?: string | null
          updated_at?: string | null
          user_confirmed?: boolean | null
          user_id: string
          user_notes?: string | null
        }
        Update: {
          ai_insight?: string | null
          auto_detected?: boolean | null
          confidence_score?: number | null
          consistency_rate?: number | null
          created_at?: string | null
          emotional_state?: string | null
          first_observed_at?: string
          hypothesized_purpose?: string | null
          id?: string
          is_active?: boolean | null
          last_confidence_update?: string | null
          last_confirmed?: string | null
          last_observed_at?: string
          next_predicted_occurrence?: string | null
          occurrence_count?: number | null
          pattern_description?: string | null
          pattern_name?: string
          pattern_type?: string
          response_data?: Json
          response_platform?: string
          response_type?: string
          time_offset_minutes?: number
          time_window_minutes?: number | null
          trigger_keywords?: Json | null
          trigger_metadata?: Json | null
          trigger_type?: string | null
          updated_at?: string | null
          user_confirmed?: boolean | null
          user_id?: string
          user_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "behavioral_patterns_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      behavioral_trait_correlations: {
        Row: {
          confidence_level: number | null
          correlation_coefficient: number | null
          created_at: string | null
          dimension: string
          effect_size: string | null
          feature_name: string
          id: string
          last_calculated_at: string | null
          platform: string
          research_citation: string | null
          sample_size: number | null
          validated: boolean | null
        }
        Insert: {
          confidence_level?: number | null
          correlation_coefficient?: number | null
          created_at?: string | null
          dimension: string
          effect_size?: string | null
          feature_name: string
          id?: string
          last_calculated_at?: string | null
          platform: string
          research_citation?: string | null
          sample_size?: number | null
          validated?: boolean | null
        }
        Update: {
          confidence_level?: number | null
          correlation_coefficient?: number | null
          created_at?: string | null
          dimension?: string
          effect_size?: string | null
          feature_name?: string
          id?: string
          last_calculated_at?: string | null
          platform?: string
          research_citation?: string | null
          sample_size?: number | null
          validated?: boolean | null
        }
        Relationships: []
      }
      big_five_responses: {
        Row: {
          created_at: string | null
          id: string
          question_id: string
          response_time_ms: number | null
          response_value: number
          session_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          question_id: string
          response_time_ms?: number | null
          response_value: number
          session_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          question_id?: string
          response_time_ms?: number | null
          response_value?: number
          session_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      big_five_scores: {
        Row: {
          agreeableness_ci: number | null
          agreeableness_percentile: number | null
          agreeableness_raw: number | null
          agreeableness_t: number | null
          behavioral_weight: number | null
          conscientiousness_ci: number | null
          conscientiousness_percentile: number | null
          conscientiousness_raw: number | null
          conscientiousness_t: number | null
          created_at: string | null
          extraversion_ci: number | null
          extraversion_percentile: number | null
          extraversion_raw: number | null
          extraversion_t: number | null
          id: string
          neuroticism_ci: number | null
          neuroticism_percentile: number | null
          neuroticism_raw: number | null
          neuroticism_t: number | null
          openness_ci: number | null
          openness_percentile: number | null
          openness_raw: number | null
          openness_t: number | null
          questionnaire_version: string | null
          questions_answered: number | null
          source_type: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          agreeableness_ci?: number | null
          agreeableness_percentile?: number | null
          agreeableness_raw?: number | null
          agreeableness_t?: number | null
          behavioral_weight?: number | null
          conscientiousness_ci?: number | null
          conscientiousness_percentile?: number | null
          conscientiousness_raw?: number | null
          conscientiousness_t?: number | null
          created_at?: string | null
          extraversion_ci?: number | null
          extraversion_percentile?: number | null
          extraversion_raw?: number | null
          extraversion_t?: number | null
          id?: string
          neuroticism_ci?: number | null
          neuroticism_percentile?: number | null
          neuroticism_raw?: number | null
          neuroticism_t?: number | null
          openness_ci?: number | null
          openness_percentile?: number | null
          openness_raw?: number | null
          openness_t?: number | null
          questionnaire_version?: string | null
          questions_answered?: number | null
          source_type?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          agreeableness_ci?: number | null
          agreeableness_percentile?: number | null
          agreeableness_raw?: number | null
          agreeableness_t?: number | null
          behavioral_weight?: number | null
          conscientiousness_ci?: number | null
          conscientiousness_percentile?: number | null
          conscientiousness_raw?: number | null
          conscientiousness_t?: number | null
          created_at?: string | null
          extraversion_ci?: number | null
          extraversion_percentile?: number | null
          extraversion_raw?: number | null
          extraversion_t?: number | null
          id?: string
          neuroticism_ci?: number | null
          neuroticism_percentile?: number | null
          neuroticism_raw?: number | null
          neuroticism_t?: number | null
          openness_ci?: number | null
          openness_percentile?: number | null
          openness_raw?: number | null
          openness_t?: number | null
          questionnaire_version?: string | null
          questions_answered?: number | null
          source_type?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      brain_activity_log: {
        Row: {
          activity_type: string
          change_data: Json | null
          created_at: string | null
          entity_id: string | null
          entity_type: string
          id: string
          trigger_id: string | null
          trigger_source: string | null
          user_id: string | null
        }
        Insert: {
          activity_type: string
          change_data?: Json | null
          created_at?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          trigger_id?: string | null
          trigger_source?: string | null
          user_id?: string | null
        }
        Update: {
          activity_type?: string
          change_data?: Json | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          trigger_id?: string | null
          trigger_source?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brain_activity_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_edges: {
        Row: {
          confidence: number | null
          context: string | null
          created_at: string | null
          discovered_at: string | null
          evidence: Json | null
          from_node_id: string | null
          id: string
          last_observed: string | null
          observation_count: number | null
          relationship_type: string
          strength: number | null
          to_node_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          confidence?: number | null
          context?: string | null
          created_at?: string | null
          discovered_at?: string | null
          evidence?: Json | null
          from_node_id?: string | null
          id?: string
          last_observed?: string | null
          observation_count?: number | null
          relationship_type: string
          strength?: number | null
          to_node_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          confidence?: number | null
          context?: string | null
          created_at?: string | null
          discovered_at?: string | null
          evidence?: Json | null
          from_node_id?: string | null
          id?: string
          last_observed?: string | null
          observation_count?: number | null
          relationship_type?: string
          strength?: number | null
          to_node_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brain_edges_from_node_id_fkey"
            columns: ["from_node_id"]
            isOneToOne: false
            referencedRelation: "brain_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brain_edges_to_node_id_fkey"
            columns: ["to_node_id"]
            isOneToOne: false
            referencedRelation: "brain_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brain_edges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_nodes: {
        Row: {
          category: string
          confidence: number | null
          created_at: string | null
          data: Json | null
          description: string | null
          first_detected: string | null
          id: string
          label: string
          last_confirmed: string | null
          last_updated: string | null
          node_type: string
          platform: string | null
          privacy_level: number | null
          shared_with_twin: boolean | null
          source_id: string | null
          source_type: string | null
          strength: number | null
          tags: string[] | null
          updated_at: string | null
          user_confirmed: boolean | null
          user_id: string | null
          user_notes: string | null
        }
        Insert: {
          category: string
          confidence?: number | null
          created_at?: string | null
          data?: Json | null
          description?: string | null
          first_detected?: string | null
          id?: string
          label: string
          last_confirmed?: string | null
          last_updated?: string | null
          node_type: string
          platform?: string | null
          privacy_level?: number | null
          shared_with_twin?: boolean | null
          source_id?: string | null
          source_type?: string | null
          strength?: number | null
          tags?: string[] | null
          updated_at?: string | null
          user_confirmed?: boolean | null
          user_id?: string | null
          user_notes?: string | null
        }
        Update: {
          category?: string
          confidence?: number | null
          created_at?: string | null
          data?: Json | null
          description?: string | null
          first_detected?: string | null
          id?: string
          label?: string
          last_confirmed?: string | null
          last_updated?: string | null
          node_type?: string
          platform?: string | null
          privacy_level?: number | null
          shared_with_twin?: boolean | null
          source_id?: string | null
          source_type?: string | null
          strength?: number | null
          tags?: string[] | null
          updated_at?: string | null
          user_confirmed?: boolean | null
          user_id?: string | null
          user_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brain_nodes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_snapshots: {
        Row: {
          avg_confidence: number | null
          created_at: string | null
          edge_count: number | null
          edges_added: number | null
          edges_removed: number | null
          graph_state: Json
          id: string
          node_count: number | null
          nodes_added: number | null
          nodes_removed: number | null
          notes: string | null
          snapshot_date: string
          snapshot_type: string | null
          top_categories: string[] | null
          user_id: string | null
        }
        Insert: {
          avg_confidence?: number | null
          created_at?: string | null
          edge_count?: number | null
          edges_added?: number | null
          edges_removed?: number | null
          graph_state: Json
          id?: string
          node_count?: number | null
          nodes_added?: number | null
          nodes_removed?: number | null
          notes?: string | null
          snapshot_date: string
          snapshot_type?: string | null
          top_categories?: string[] | null
          user_id?: string | null
        }
        Update: {
          avg_confidence?: number | null
          created_at?: string | null
          edge_count?: number | null
          edges_added?: number | null
          edges_removed?: number | null
          graph_state?: Json
          id?: string
          node_count?: number | null
          nodes_added?: number | null
          nodes_removed?: number | null
          notes?: string | null
          snapshot_date?: string
          snapshot_type?: string | null
          top_categories?: string[] | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brain_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          attendees: Json | null
          created_at: string | null
          description: string | null
          end_time: string
          event_type: string | null
          google_event_id: string | null
          id: string
          is_important: boolean | null
          location: string | null
          metadata: Json | null
          notification_sent: boolean | null
          recurrence_rule: string | null
          ritual_started: boolean | null
          start_time: string
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          attendees?: Json | null
          created_at?: string | null
          description?: string | null
          end_time: string
          event_type?: string | null
          google_event_id?: string | null
          id?: string
          is_important?: boolean | null
          location?: string | null
          metadata?: Json | null
          notification_sent?: boolean | null
          recurrence_rule?: string | null
          ritual_started?: boolean | null
          start_time: string
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          attendees?: Json | null
          created_at?: string | null
          description?: string | null
          end_time?: string
          event_type?: string | null
          google_event_id?: string | null
          id?: string
          is_important?: boolean | null
          location?: string | null
          metadata?: Json | null
          notification_sent?: boolean | null
          recurrence_rule?: string | null
          ritual_started?: boolean | null
          start_time?: string
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      claude_desktop_imports: {
        Row: {
          completed_at: string | null
          conversations_found: number | null
          conversations_imported: number | null
          conversations_skipped: number | null
          created_at: string | null
          error_message: string | null
          errors: Json | null
          id: string
          last_import_date: string | null
          leveldb_path: string | null
          messages_imported: number | null
          newest_message_date: string | null
          oldest_message_date: string | null
          started_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          conversations_found?: number | null
          conversations_imported?: number | null
          conversations_skipped?: number | null
          created_at?: string | null
          error_message?: string | null
          errors?: Json | null
          id?: string
          last_import_date?: string | null
          leveldb_path?: string | null
          messages_imported?: number | null
          newest_message_date?: string | null
          oldest_message_date?: string | null
          started_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          conversations_found?: number | null
          conversations_imported?: number | null
          conversations_skipped?: number | null
          created_at?: string | null
          error_message?: string | null
          errors?: Json | null
          id?: string
          last_import_date?: string | null
          leveldb_path?: string | null
          messages_imported?: number | null
          newest_message_date?: string | null
          oldest_message_date?: string | null
          started_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      cluster_divergence: {
        Row: {
          agreeableness_diff: number | null
          calculated_at: string | null
          cluster_a: string
          cluster_b: string
          conscientiousness_diff: number | null
          divergence_summary: string | null
          extraversion_diff: number | null
          id: string
          insights: Json | null
          neuroticism_diff: number | null
          openness_diff: number | null
          overall_divergence: number | null
          user_id: string
        }
        Insert: {
          agreeableness_diff?: number | null
          calculated_at?: string | null
          cluster_a: string
          cluster_b: string
          conscientiousness_diff?: number | null
          divergence_summary?: string | null
          extraversion_diff?: number | null
          id?: string
          insights?: Json | null
          neuroticism_diff?: number | null
          openness_diff?: number | null
          overall_divergence?: number | null
          user_id: string
        }
        Update: {
          agreeableness_diff?: number | null
          calculated_at?: string | null
          cluster_a?: string
          cluster_b?: string
          conscientiousness_diff?: number | null
          divergence_summary?: string | null
          extraversion_diff?: number | null
          id?: string
          insights?: Json | null
          neuroticism_diff?: number | null
          openness_diff?: number | null
          overall_divergence?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cluster_divergence_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cluster_personalities: {
        Row: {
          agreeableness: number | null
          cluster: string
          communication_style: string | null
          confidence: number | null
          conscientiousness: number | null
          created_at: string | null
          data_points_count: number | null
          energy_pattern: string | null
          extraversion: number | null
          id: string
          neuroticism: number | null
          openness: number | null
          platforms_contributing: string[] | null
          response_speed: string | null
          social_preference: string | null
          top_correlations: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          agreeableness?: number | null
          cluster: string
          communication_style?: string | null
          confidence?: number | null
          conscientiousness?: number | null
          created_at?: string | null
          data_points_count?: number | null
          energy_pattern?: string | null
          extraversion?: number | null
          id?: string
          neuroticism?: number | null
          openness?: number | null
          platforms_contributing?: string[] | null
          response_speed?: string | null
          social_preference?: string | null
          top_correlations?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          agreeableness?: number | null
          cluster?: string
          communication_style?: string | null
          confidence?: number | null
          conscientiousness?: number | null
          created_at?: string | null
          data_points_count?: number | null
          energy_pattern?: string | null
          extraversion?: number | null
          id?: string
          neuroticism?: number | null
          openness?: number | null
          platforms_contributing?: string[] | null
          response_speed?: string | null
          social_preference?: string | null
          top_correlations?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cluster_personalities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_submissions: {
        Row: {
          created_at: string | null
          email: string
          id: string
          message: string
          name: string
          num_tables: number | null
          phone: string | null
          read: boolean | null
          restaurant_name: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          message: string
          name: string
          num_tables?: number | null
          phone?: string | null
          read?: boolean | null
          restaurant_name?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          message?: string
          name?: string
          num_tables?: number | null
          phone?: string | null
          read?: boolean | null
          restaurant_name?: string | null
        }
        Relationships: []
      }
      conversation_analysis_jobs: {
        Row: {
          analysis_result: Json | null
          completed_at: string | null
          conversation_log_id: string | null
          error_message: string | null
          id: string
          model_used: string | null
          priority: number | null
          processing_time_ms: number | null
          queued_at: string | null
          session_id: string | null
          started_at: string | null
          status: string
          tokens_used: number | null
          user_id: string
        }
        Insert: {
          analysis_result?: Json | null
          completed_at?: string | null
          conversation_log_id?: string | null
          error_message?: string | null
          id?: string
          model_used?: string | null
          priority?: number | null
          processing_time_ms?: number | null
          queued_at?: string | null
          session_id?: string | null
          started_at?: string | null
          status?: string
          tokens_used?: number | null
          user_id: string
        }
        Update: {
          analysis_result?: Json | null
          completed_at?: string | null
          conversation_log_id?: string | null
          error_message?: string | null
          id?: string
          model_used?: string | null
          priority?: number | null
          processing_time_ms?: number | null
          queued_at?: string | null
          session_id?: string | null
          started_at?: string | null
          status?: string
          tokens_used?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_analysis_jobs_conversation_log_id_fkey"
            columns: ["conversation_log_id"]
            isOneToOne: false
            referencedRelation: "mcp_conversation_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_memory: {
        Row: {
          conversation_id: string | null
          created_at: string | null
          embedding: string | null
          entities_mentioned: Json | null
          id: string
          importance_score: number | null
          message_content: string
          message_role: string
          timestamp: string | null
          topic_tags: string[] | null
          twin_id: string | null
          user_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string | null
          embedding?: string | null
          entities_mentioned?: Json | null
          id?: string
          importance_score?: number | null
          message_content: string
          message_role: string
          timestamp?: string | null
          topic_tags?: string[] | null
          twin_id?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string | null
          embedding?: string | null
          entities_mentioned?: Json | null
          id?: string
          importance_score?: number | null
          message_content?: string
          message_role?: string
          timestamp?: string | null
          topic_tags?: string[] | null
          twin_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_memory_twin_id_fkey"
            columns: ["twin_id"]
            isOneToOne: false
            referencedRelation: "digital_twins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_memory_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_sessions: {
        Row: {
          created_at: string | null
          ended_at: string | null
          id: string
          last_message_at: string | null
          mcp_client: string | null
          message_count: number | null
          overall_depth: string | null
          overall_engagement: string | null
          primary_topics: Json | null
          session_arc: Json | null
          session_summary: string | null
          started_at: string | null
          total_words: number | null
          twin_response_count: number | null
          updated_at: string | null
          user_id: string
          user_message_count: number | null
        }
        Insert: {
          created_at?: string | null
          ended_at?: string | null
          id?: string
          last_message_at?: string | null
          mcp_client?: string | null
          message_count?: number | null
          overall_depth?: string | null
          overall_engagement?: string | null
          primary_topics?: Json | null
          session_arc?: Json | null
          session_summary?: string | null
          started_at?: string | null
          total_words?: number | null
          twin_response_count?: number | null
          updated_at?: string | null
          user_id: string
          user_message_count?: number | null
        }
        Update: {
          created_at?: string | null
          ended_at?: string | null
          id?: string
          last_message_at?: string | null
          mcp_client?: string | null
          message_count?: number | null
          overall_depth?: string | null
          overall_engagement?: string | null
          primary_topics?: Json | null
          session_arc?: Json | null
          session_summary?: string | null
          started_at?: string | null
          total_words?: number | null
          twin_response_count?: number | null
          updated_at?: string | null
          user_id?: string
          user_message_count?: number | null
        }
        Relationships: []
      }
      conversation_summaries: {
        Row: {
          created_at: string | null
          id: string
          message_count: number
          summary: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message_count: number
          summary: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message_count?: number
          summary?: string
          user_id?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          title: string | null
          twin_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string | null
          twin_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string | null
          twin_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_twin_id_fkey"
            columns: ["twin_id"]
            isOneToOne: false
            referencedRelation: "digital_twins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      core_memory: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          id: string
          last_updated: string | null
          learned_from: string | null
          preference_data: Json
          preference_type: string
          user_id: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          last_updated?: string | null
          learned_from?: string | null
          preference_data: Json
          preference_type: string
          user_id: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          last_updated?: string | null
          learned_from?: string | null
          preference_data?: Json
          preference_type?: string
          user_id?: string
        }
        Relationships: []
      }
      cron_executions: {
        Row: {
          created_at: string
          error_message: string | null
          executed_at: string
          execution_time_ms: number | null
          id: string
          job_name: string
          platforms_polled: number | null
          result_data: Json | null
          status: string
          tokens_checked: number | null
          tokens_refreshed: number | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          executed_at?: string
          execution_time_ms?: number | null
          id?: string
          job_name: string
          platforms_polled?: number | null
          result_data?: Json | null
          status: string
          tokens_checked?: number | null
          tokens_refreshed?: number | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          executed_at?: string
          execution_time_ms?: number | null
          id?: string
          job_name?: string
          platforms_polled?: number | null
          result_data?: Json | null
          status?: string
          tokens_checked?: number | null
          tokens_refreshed?: number | null
        }
        Relationships: []
      }
      cross_platform_insights: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          first_detected_at: string | null
          id: string
          insight_data: Json
          insight_type: string
          is_active: boolean | null
          last_confirmed_at: string | null
          last_used_at: string | null
          occurrence_count: number | null
          source_platforms: string[]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          first_detected_at?: string | null
          id?: string
          insight_data: Json
          insight_type: string
          is_active?: boolean | null
          last_confirmed_at?: string | null
          last_used_at?: string | null
          occurrence_count?: number | null
          source_platforms: string[]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          first_detected_at?: string | null
          id?: string
          insight_data?: Json
          insight_type?: string
          is_active?: boolean | null
          last_confirmed_at?: string | null
          last_used_at?: string | null
          occurrence_count?: number | null
          source_platforms?: string[]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      data_extraction_jobs: {
        Row: {
          completed_at: string | null
          connector_id: string | null
          created_at: string | null
          error_message: string | null
          failed_items: number | null
          id: string
          job_type: string
          platform: string
          processed_items: number | null
          results: Json | null
          started_at: string | null
          status: string
          total_items: number | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          connector_id?: string | null
          created_at?: string | null
          error_message?: string | null
          failed_items?: number | null
          id?: string
          job_type: string
          platform: string
          processed_items?: number | null
          results?: Json | null
          started_at?: string | null
          status: string
          total_items?: number | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          connector_id?: string | null
          created_at?: string | null
          error_message?: string | null
          failed_items?: number | null
          id?: string
          job_type?: string
          platform?: string
          processed_items?: number | null
          results?: Json | null
          started_at?: string | null
          status?: string
          total_items?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_extraction_jobs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      data_quality_metrics: {
        Row: {
          api_rate_limit_hits: number | null
          avg_content_quality: number | null
          avg_processing_time_ms: number | null
          connector_id: string | null
          duplicate_data_points: number | null
          id: string
          insight_confidence_avg: number | null
          insights_generated: number | null
          metric_date: string | null
          processed_successfully: number | null
          processing_errors: number | null
          signal_to_noise_ratio: number | null
          total_data_points: number | null
          user_id: string
        }
        Insert: {
          api_rate_limit_hits?: number | null
          avg_content_quality?: number | null
          avg_processing_time_ms?: number | null
          connector_id?: string | null
          duplicate_data_points?: number | null
          id?: string
          insight_confidence_avg?: number | null
          insights_generated?: number | null
          metric_date?: string | null
          processed_successfully?: number | null
          processing_errors?: number | null
          signal_to_noise_ratio?: number | null
          total_data_points?: number | null
          user_id: string
        }
        Update: {
          api_rate_limit_hits?: number | null
          avg_content_quality?: number | null
          avg_processing_time_ms?: number | null
          connector_id?: string | null
          duplicate_data_points?: number | null
          id?: string
          insight_confidence_avg?: number | null
          insights_generated?: number | null
          metric_date?: string | null
          processed_successfully?: number | null
          processing_errors?: number | null
          signal_to_noise_ratio?: number | null
          total_data_points?: number | null
          user_id?: string
        }
        Relationships: []
      }
      digital_twins: {
        Row: {
          common_phrases: string[] | null
          communication_style: string | null
          connected_platforms: string[] | null
          created_at: string
          creator_id: string
          description: string | null
          expertise: string[] | null
          favorite_analogies: Json | null
          humor_style: string | null
          id: string
          is_active: boolean | null
          knowledge_base_status: string | null
          metadata: Json | null
          name: string
          personality_data: Json | null
          personality_traits: Json | null
          soul_signature: Json | null
          status: string | null
          student_interaction: string | null
          subject_area: string | null
          teaching_philosophy: string | null
          teaching_style: Json | null
          twin_type: string | null
          updated_at: string
          user_id: string
          voice_id: string | null
        }
        Insert: {
          common_phrases?: string[] | null
          communication_style?: string | null
          connected_platforms?: string[] | null
          created_at?: string
          creator_id: string
          description?: string | null
          expertise?: string[] | null
          favorite_analogies?: Json | null
          humor_style?: string | null
          id?: string
          is_active?: boolean | null
          knowledge_base_status?: string | null
          metadata?: Json | null
          name: string
          personality_data?: Json | null
          personality_traits?: Json | null
          soul_signature?: Json | null
          status?: string | null
          student_interaction?: string | null
          subject_area?: string | null
          teaching_philosophy?: string | null
          teaching_style?: Json | null
          twin_type?: string | null
          updated_at?: string
          user_id: string
          voice_id?: string | null
        }
        Update: {
          common_phrases?: string[] | null
          communication_style?: string | null
          connected_platforms?: string[] | null
          created_at?: string
          creator_id?: string
          description?: string | null
          expertise?: string[] | null
          favorite_analogies?: Json | null
          humor_style?: string | null
          id?: string
          is_active?: boolean | null
          knowledge_base_status?: string | null
          metadata?: Json | null
          name?: string
          personality_data?: Json | null
          personality_traits?: Json | null
          soul_signature?: Json | null
          status?: string | null
          student_interaction?: string | null
          subject_area?: string | null
          teaching_philosophy?: string | null
          teaching_style?: Json | null
          twin_type?: string | null
          updated_at?: string
          user_id?: string
          voice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "digital_twins_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digital_twins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      discord_interaction_patterns: {
        Row: {
          connector_id: string | null
          id: string
          ingested_at: string | null
          messages_per_day_avg: number | null
          most_active_channels: string[] | null
          most_used_emoji: string[] | null
          reaction_patterns: Json | null
          server_id: string
          time_period_end: string
          time_period_start: string
          total_messages: number | null
          user_id: string
          voice_channel_hours: number | null
        }
        Insert: {
          connector_id?: string | null
          id?: string
          ingested_at?: string | null
          messages_per_day_avg?: number | null
          most_active_channels?: string[] | null
          most_used_emoji?: string[] | null
          reaction_patterns?: Json | null
          server_id: string
          time_period_end: string
          time_period_start: string
          total_messages?: number | null
          user_id: string
          voice_channel_hours?: number | null
        }
        Update: {
          connector_id?: string | null
          id?: string
          ingested_at?: string | null
          messages_per_day_avg?: number | null
          most_active_channels?: string[] | null
          most_used_emoji?: string[] | null
          reaction_patterns?: Json | null
          server_id?: string
          time_period_end?: string
          time_period_start?: string
          total_messages?: number | null
          user_id?: string
          voice_channel_hours?: number | null
        }
        Relationships: []
      }
      discord_servers: {
        Row: {
          activity_level: string | null
          connector_id: string | null
          id: string
          ingested_at: string | null
          is_owner: boolean | null
          joined_at: string | null
          member_count: number | null
          server_categories: string[] | null
          server_icon: string | null
          server_id: string
          server_name: string
          user_id: string
          user_roles: string[] | null
        }
        Insert: {
          activity_level?: string | null
          connector_id?: string | null
          id?: string
          ingested_at?: string | null
          is_owner?: boolean | null
          joined_at?: string | null
          member_count?: number | null
          server_categories?: string[] | null
          server_icon?: string | null
          server_id: string
          server_name: string
          user_id: string
          user_roles?: string[] | null
        }
        Update: {
          activity_level?: string | null
          connector_id?: string | null
          id?: string
          ingested_at?: string | null
          is_owner?: boolean | null
          joined_at?: string | null
          member_count?: number | null
          server_categories?: string[] | null
          server_icon?: string | null
          server_id?: string
          server_name?: string
          user_id?: string
          user_roles?: string[] | null
        }
        Relationships: []
      }
      discovered_correlations: {
        Row: {
          confidence: number | null
          consistency: number | null
          correlation_type: string
          description: string | null
          discovered_at: string | null
          evidence: Json | null
          first_detected: string | null
          id: string
          last_detected: string | null
          occurrences: number
          outcome_effect: string | null
          outcome_metric: string
          outcome_platform: string
          trigger_event: string
          trigger_platform: string
          user_id: string
        }
        Insert: {
          confidence?: number | null
          consistency?: number | null
          correlation_type: string
          description?: string | null
          discovered_at?: string | null
          evidence?: Json | null
          first_detected?: string | null
          id?: string
          last_detected?: string | null
          occurrences?: number
          outcome_effect?: string | null
          outcome_metric: string
          outcome_platform: string
          trigger_event: string
          trigger_platform: string
          user_id: string
        }
        Update: {
          confidence?: number | null
          consistency?: number | null
          correlation_type?: string
          description?: string | null
          discovered_at?: string | null
          evidence?: Json | null
          first_detected?: string | null
          id?: string
          last_detected?: string | null
          occurrences?: number
          outcome_effect?: string | null
          outcome_metric?: string
          outcome_platform?: string
          trigger_event?: string
          trigger_platform?: string
          user_id?: string
        }
        Relationships: []
      }
      enriched_profiles: {
        Row: {
          achievements: string | null
          career_timeline: string | null
          confirmed_at: string | null
          confirmed_data: Json | null
          corrections: Json | null
          created_at: string | null
          discovered_bio: string | null
          discovered_company: string | null
          discovered_github_url: string | null
          discovered_linkedin_url: string | null
          discovered_location: string | null
          discovered_name: string | null
          discovered_photo: string | null
          discovered_summary: string | null
          discovered_title: string | null
          discovered_twitter_url: string | null
          education: string | null
          email: string
          enriched_at: string | null
          id: string
          raw_search_response: Json | null
          scrapin_background_url: string | null
          scrapin_connection_count: number | null
          scrapin_follower_count: number | null
          scrapin_headline: string | null
          scrapin_industry: string | null
          scrapin_profile_picture_url: string | null
          scrapin_raw_response: Json | null
          search_query: string | null
          skills: string | null
          source: string | null
          updated_at: string | null
          user_confirmed: boolean | null
          user_id: string | null
        }
        Insert: {
          achievements?: string | null
          career_timeline?: string | null
          confirmed_at?: string | null
          confirmed_data?: Json | null
          corrections?: Json | null
          created_at?: string | null
          discovered_bio?: string | null
          discovered_company?: string | null
          discovered_github_url?: string | null
          discovered_linkedin_url?: string | null
          discovered_location?: string | null
          discovered_name?: string | null
          discovered_photo?: string | null
          discovered_summary?: string | null
          discovered_title?: string | null
          discovered_twitter_url?: string | null
          education?: string | null
          email: string
          enriched_at?: string | null
          id?: string
          raw_search_response?: Json | null
          scrapin_background_url?: string | null
          scrapin_connection_count?: number | null
          scrapin_follower_count?: number | null
          scrapin_headline?: string | null
          scrapin_industry?: string | null
          scrapin_profile_picture_url?: string | null
          scrapin_raw_response?: Json | null
          search_query?: string | null
          skills?: string | null
          source?: string | null
          updated_at?: string | null
          user_confirmed?: boolean | null
          user_id?: string | null
        }
        Update: {
          achievements?: string | null
          career_timeline?: string | null
          confirmed_at?: string | null
          confirmed_data?: Json | null
          corrections?: Json | null
          created_at?: string | null
          discovered_bio?: string | null
          discovered_company?: string | null
          discovered_github_url?: string | null
          discovered_linkedin_url?: string | null
          discovered_location?: string | null
          discovered_name?: string | null
          discovered_photo?: string | null
          discovered_summary?: string | null
          discovered_title?: string | null
          discovered_twitter_url?: string | null
          education?: string | null
          email?: string
          enriched_at?: string | null
          id?: string
          raw_search_response?: Json | null
          scrapin_background_url?: string | null
          scrapin_connection_count?: number | null
          scrapin_follower_count?: number | null
          scrapin_headline?: string | null
          scrapin_industry?: string | null
          scrapin_profile_picture_url?: string | null
          scrapin_raw_response?: Json | null
          search_query?: string | null
          skills?: string | null
          source?: string | null
          updated_at?: string | null
          user_confirmed?: boolean | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enriched_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      extracted_data: {
        Row: {
          data: Json
          expires_at: string | null
          extracted_at: string | null
          id: string
          platform: string
          user_id: string
        }
        Insert: {
          data: Json
          expires_at?: string | null
          extracted_at?: string | null
          id?: string
          platform: string
          user_id: string
        }
        Update: {
          data?: Json
          expires_at?: string | null
          extracted_at?: string | null
          id?: string
          platform?: string
          user_id?: string
        }
        Relationships: []
      }
      extraction_job_runs: {
        Row: {
          duration_ms: number | null
          error_message: string | null
          executed_at: string | null
          id: string
          platform: string
          records_extracted: number | null
          result: Json | null
          status: string
          user_id: string
        }
        Insert: {
          duration_ms?: number | null
          error_message?: string | null
          executed_at?: string | null
          id?: string
          platform: string
          records_extracted?: number | null
          result?: Json | null
          status: string
          user_id: string
        }
        Update: {
          duration_ms?: number | null
          error_message?: string | null
          executed_at?: string | null
          id?: string
          platform?: string
          records_extracted?: number | null
          result?: Json | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      extraction_jobs: {
        Row: {
          completed_at: string | null
          connector_id: string | null
          created_at: string | null
          error_message: string | null
          id: string
          items_extracted: number | null
          metadata: Json | null
          platform: string
          started_at: string | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          connector_id?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          items_extracted?: number | null
          metadata?: Json | null
          platform: string
          started_at?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          connector_id?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          items_extracted?: number | null
          metadata?: Json | null
          platform?: string
          started_at?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "extraction_jobs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      extraction_status: {
        Row: {
          connector_id: string | null
          consecutive_errors: number | null
          created_at: string | null
          extraction_frequency: unknown
          extraction_stage: string | null
          id: string
          last_error_message: string | null
          last_error_timestamp: string | null
          last_extraction_count: number | null
          newest_data_timestamp: string | null
          next_extraction_scheduled: string | null
          oldest_data_timestamp: string | null
          provider: string
          total_items_extracted: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          connector_id?: string | null
          consecutive_errors?: number | null
          created_at?: string | null
          extraction_frequency?: unknown
          extraction_stage?: string | null
          id?: string
          last_error_message?: string | null
          last_error_timestamp?: string | null
          last_extraction_count?: number | null
          newest_data_timestamp?: string | null
          next_extraction_scheduled?: string | null
          oldest_data_timestamp?: string | null
          provider: string
          total_items_extracted?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          connector_id?: string | null
          consecutive_errors?: number | null
          created_at?: string | null
          extraction_frequency?: unknown
          extraction_stage?: string | null
          id?: string
          last_error_message?: string | null
          last_error_timestamp?: string | null
          last_extraction_count?: number | null
          newest_data_timestamp?: string | null
          next_extraction_scheduled?: string | null
          oldest_data_timestamp?: string | null
          provider?: string
          total_items_extracted?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      facet_scores: {
        Row: {
          behavioral_support: Json | null
          confidence: number | null
          created_at: string | null
          domain: string
          facet_name: string
          facet_number: number
          id: string
          percentile: number | null
          raw_score: number | null
          t_score: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          behavioral_support?: Json | null
          confidence?: number | null
          created_at?: string | null
          domain: string
          facet_name: string
          facet_number: number
          id?: string
          percentile?: number | null
          raw_score?: number | null
          t_score?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          behavioral_support?: Json | null
          confidence?: number | null
          created_at?: string | null
          domain?: string
          facet_name?: string
          facet_number?: number
          id?: string
          percentile?: number | null
          raw_score?: number | null
          t_score?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      generated_insights: {
        Row: {
          acted_on_at: string | null
          confidence_score: number | null
          context_data: Json | null
          detail: string | null
          dismissed_at: string | null
          expires_at: string | null
          generated_at: string | null
          id: string
          insight_type: string
          is_actionable: boolean | null
          related_patterns: string[] | null
          source: string | null
          suggested_action: string | null
          summary: string
          title: string
          user_feedback: string | null
          user_id: string
          user_rating: number | null
        }
        Insert: {
          acted_on_at?: string | null
          confidence_score?: number | null
          context_data?: Json | null
          detail?: string | null
          dismissed_at?: string | null
          expires_at?: string | null
          generated_at?: string | null
          id?: string
          insight_type: string
          is_actionable?: boolean | null
          related_patterns?: string[] | null
          source?: string | null
          suggested_action?: string | null
          summary: string
          title: string
          user_feedback?: string | null
          user_id: string
          user_rating?: number | null
        }
        Update: {
          acted_on_at?: string | null
          confidence_score?: number | null
          context_data?: Json | null
          detail?: string | null
          dismissed_at?: string | null
          expires_at?: string | null
          generated_at?: string | null
          id?: string
          insight_type?: string
          is_actionable?: boolean | null
          related_patterns?: string[] | null
          source?: string | null
          suggested_action?: string | null
          summary?: string
          title?: string
          user_feedback?: string | null
          user_id?: string
          user_rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "generated_insights_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      github_contributions: {
        Row: {
          commit_count: number | null
          connector_id: string | null
          contribution_count: number
          contribution_date: string
          id: string
          ingested_at: string | null
          issue_count: number | null
          pr_count: number | null
          repositories_contributed: string[] | null
          review_count: number | null
          user_id: string
        }
        Insert: {
          commit_count?: number | null
          connector_id?: string | null
          contribution_count: number
          contribution_date: string
          id?: string
          ingested_at?: string | null
          issue_count?: number | null
          pr_count?: number | null
          repositories_contributed?: string[] | null
          review_count?: number | null
          user_id: string
        }
        Update: {
          commit_count?: number | null
          connector_id?: string | null
          contribution_count?: number
          contribution_date?: string
          id?: string
          ingested_at?: string | null
          issue_count?: number | null
          pr_count?: number | null
          repositories_contributed?: string[] | null
          review_count?: number | null
          user_id?: string
        }
        Relationships: []
      }
      github_repositories: {
        Row: {
          connector_id: string | null
          created_at: string | null
          description: string | null
          forks_count: number | null
          id: string
          ingested_at: string | null
          is_fork: boolean | null
          is_owner: boolean | null
          languages_used: Json | null
          last_pushed: string | null
          last_updated: string | null
          primary_language: string | null
          repo_id: string
          repo_name: string
          repo_url: string | null
          stars_count: number | null
          topics: string[] | null
          user_id: string
          watchers_count: number | null
        }
        Insert: {
          connector_id?: string | null
          created_at?: string | null
          description?: string | null
          forks_count?: number | null
          id?: string
          ingested_at?: string | null
          is_fork?: boolean | null
          is_owner?: boolean | null
          languages_used?: Json | null
          last_pushed?: string | null
          last_updated?: string | null
          primary_language?: string | null
          repo_id: string
          repo_name: string
          repo_url?: string | null
          stars_count?: number | null
          topics?: string[] | null
          user_id: string
          watchers_count?: number | null
        }
        Update: {
          connector_id?: string | null
          created_at?: string | null
          description?: string | null
          forks_count?: number | null
          id?: string
          ingested_at?: string | null
          is_fork?: boolean | null
          is_owner?: boolean | null
          languages_used?: Json | null
          last_pushed?: string | null
          last_updated?: string | null
          primary_language?: string | null
          repo_id?: string
          repo_name?: string
          repo_url?: string | null
          stars_count?: number | null
          topics?: string[] | null
          user_id?: string
          watchers_count?: number | null
        }
        Relationships: []
      }
      ingestion_health_log: {
        Row: {
          created_at: string | null
          duration_ms: number | null
          error_details: Json | null
          errors: number | null
          id: string
          observations_stored: number | null
          reflections_triggered: number | null
          run_at: string
          users_processed: number | null
        }
        Insert: {
          created_at?: string | null
          duration_ms?: number | null
          error_details?: Json | null
          errors?: number | null
          id?: string
          observations_stored?: number | null
          reflections_triggered?: number | null
          run_at?: string
          users_processed?: number | null
        }
        Update: {
          created_at?: string | null
          duration_ms?: number | null
          error_details?: Json | null
          errors?: number | null
          id?: string
          observations_stored?: number | null
          reflections_triggered?: number | null
          run_at?: string
          users_processed?: number | null
        }
        Relationships: []
      }
      instagram_posts: {
        Row: {
          caption: string | null
          comment_count: number | null
          connector_id: string | null
          engagement_rate: number | null
          hashtags: string[] | null
          id: string
          ingested_at: string | null
          like_count: number | null
          media_url: string | null
          post_id: string
          post_type: string | null
          posted_at: string
          thumbnail_url: string | null
          user_id: string
        }
        Insert: {
          caption?: string | null
          comment_count?: number | null
          connector_id?: string | null
          engagement_rate?: number | null
          hashtags?: string[] | null
          id?: string
          ingested_at?: string | null
          like_count?: number | null
          media_url?: string | null
          post_id: string
          post_type?: string | null
          posted_at: string
          thumbnail_url?: string | null
          user_id: string
        }
        Update: {
          caption?: string | null
          comment_count?: number | null
          connector_id?: string | null
          engagement_rate?: number | null
          hashtags?: string[] | null
          id?: string
          ingested_at?: string | null
          like_count?: number | null
          media_url?: string | null
          post_id?: string
          post_type?: string | null
          posted_at?: string
          thumbnail_url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ipip_questions: {
        Row: {
          created_at: string | null
          domain: string
          facet_name: string
          facet_number: number
          id: string
          is_reverse_keyed: boolean | null
          item_order: number
          question_id: string
          question_text: string
          version: string | null
        }
        Insert: {
          created_at?: string | null
          domain: string
          facet_name: string
          facet_number: number
          id?: string
          is_reverse_keyed?: boolean | null
          item_order: number
          question_id: string
          question_text: string
          version?: string | null
        }
        Update: {
          created_at?: string | null
          domain?: string
          facet_name?: string
          facet_number?: number
          id?: string
          is_reverse_keyed?: boolean | null
          item_order?: number
          question_id?: string
          question_text?: string
          version?: string | null
        }
        Relationships: []
      }
      journal_analyses: {
        Row: {
          created_at: string | null
          emotions: Json | null
          entry_id: string
          id: string
          personality_signals: Json | null
          self_perception: Json | null
          summary: string | null
          themes: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          emotions?: Json | null
          entry_id: string
          id?: string
          personality_signals?: Json | null
          self_perception?: Json | null
          summary?: string | null
          themes?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          emotions?: Json | null
          entry_id?: string
          id?: string
          personality_signals?: Json | null
          self_perception?: Json | null
          summary?: string | null
          themes?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_analyses_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_analyses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          content: string
          created_at: string | null
          energy_level: number | null
          id: string
          is_analyzed: boolean | null
          mood: string | null
          tags: string[] | null
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          energy_level?: number | null
          id?: string
          is_analyzed?: boolean | null
          mood?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          energy_level?: number | null
          id?: string
          is_analyzed?: boolean | null
          mood?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      life_clusters: {
        Row: {
          cluster_category: string
          cluster_data: Json
          cluster_name: string
          created_at: string | null
          data_sources: string[] | null
          id: string
          last_updated: string | null
          privacy_level: number | null
          user_id: string
        }
        Insert: {
          cluster_category: string
          cluster_data: Json
          cluster_name: string
          created_at?: string | null
          data_sources?: string[] | null
          id?: string
          last_updated?: string | null
          privacy_level?: number | null
          user_id: string
        }
        Update: {
          cluster_category?: string
          cluster_data?: Json
          cluster_name?: string
          created_at?: string | null
          data_sources?: string[] | null
          id?: string
          last_updated?: string | null
          privacy_level?: number | null
          user_id?: string
        }
        Relationships: []
      }
      life_context: {
        Row: {
          confidence: number | null
          context_type: string
          created_at: string | null
          detected_language: string | null
          end_date: string | null
          id: string
          is_active: boolean | null
          is_dismissed: boolean | null
          metadata: Json | null
          original_title: string | null
          source: string | null
          source_event_id: string | null
          source_platform: string | null
          start_date: string
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          confidence?: number | null
          context_type: string
          created_at?: string | null
          detected_language?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          is_dismissed?: boolean | null
          metadata?: Json | null
          original_title?: string | null
          source?: string | null
          source_event_id?: string | null
          source_platform?: string | null
          start_date: string
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          confidence?: number | null
          context_type?: string
          created_at?: string | null
          detected_language?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          is_dismissed?: boolean | null
          metadata?: Json | null
          original_title?: string | null
          source?: string | null
          source_event_id?: string | null
          source_platform?: string | null
          start_date?: string
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      llm_behavioral_context: {
        Row: {
          context_text: string
          context_type: string
          created_at: string | null
          embedding: string | null
          id: string
          importance_score: number | null
          last_used: string | null
          relevance_contexts: string[] | null
          source_patterns: string[] | null
          source_sessions: string[] | null
          times_retrieved: number | null
          twin_id: string | null
          updated_at: string | null
          user_id: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          context_text: string
          context_type: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          importance_score?: number | null
          last_used?: string | null
          relevance_contexts?: string[] | null
          source_patterns?: string[] | null
          source_sessions?: string[] | null
          times_retrieved?: number | null
          twin_id?: string | null
          updated_at?: string | null
          user_id: string
          valid_from: string
          valid_until?: string | null
        }
        Update: {
          context_text?: string
          context_type?: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          importance_score?: number | null
          last_used?: string | null
          relevance_contexts?: string[] | null
          source_patterns?: string[] | null
          source_sessions?: string[] | null
          times_retrieved?: number | null
          twin_id?: string | null
          updated_at?: string | null
          user_id?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "llm_behavioral_context_twin_id_fkey"
            columns: ["twin_id"]
            isOneToOne: false
            referencedRelation: "digital_twins"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_conversation_seeds: {
        Row: {
          conversation_topic: string | null
          created_at: string | null
          id: string
          quality_score: number | null
          response_characteristics: string[] | null
          source_type: string | null
          twin_id: string | null
          twin_response: string
          user_id: string
          user_message: string
          was_user_approved: boolean | null
        }
        Insert: {
          conversation_topic?: string | null
          created_at?: string | null
          id?: string
          quality_score?: number | null
          response_characteristics?: string[] | null
          source_type?: string | null
          twin_id?: string | null
          twin_response: string
          user_id: string
          user_message: string
          was_user_approved?: boolean | null
        }
        Update: {
          conversation_topic?: string | null
          created_at?: string | null
          id?: string
          quality_score?: number | null
          response_characteristics?: string[] | null
          source_type?: string | null
          twin_id?: string | null
          twin_response?: string
          user_id?: string
          user_message?: string
          was_user_approved?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "llm_conversation_seeds_twin_id_fkey"
            columns: ["twin_id"]
            isOneToOne: false
            referencedRelation: "digital_twins"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_training_context: {
        Row: {
          confidence_score: number
          context_content: string
          context_type: string
          created_at: string | null
          id: string
          last_used: string | null
          source_data_count: number | null
          source_platforms: string[] | null
          supersedes_context_id: string | null
          twin_id: string | null
          use_count: number | null
          user_id: string
          version: number | null
        }
        Insert: {
          confidence_score: number
          context_content: string
          context_type: string
          created_at?: string | null
          id?: string
          last_used?: string | null
          source_data_count?: number | null
          source_platforms?: string[] | null
          supersedes_context_id?: string | null
          twin_id?: string | null
          use_count?: number | null
          user_id: string
          version?: number | null
        }
        Update: {
          confidence_score?: number
          context_content?: string
          context_type?: string
          created_at?: string | null
          id?: string
          last_used?: string | null
          source_data_count?: number | null
          source_platforms?: string[] | null
          supersedes_context_id?: string | null
          twin_id?: string | null
          use_count?: number | null
          user_id?: string
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "llm_training_context_supersedes_context_id_fkey"
            columns: ["supersedes_context_id"]
            isOneToOne: false
            referencedRelation: "llm_training_context"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llm_training_context_twin_id_fkey"
            columns: ["twin_id"]
            isOneToOne: false
            referencedRelation: "digital_twins"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_training_data: {
        Row: {
          category: string | null
          completion: string
          created_at: string | null
          id: string
          prompt: string
          quality_score: number | null
          source_platform: string | null
          source_type: string | null
          tags: string[] | null
          training_batch_id: string | null
          twin_id: string | null
          used_in_training: boolean | null
          user_id: string
        }
        Insert: {
          category?: string | null
          completion: string
          created_at?: string | null
          id?: string
          prompt: string
          quality_score?: number | null
          source_platform?: string | null
          source_type?: string | null
          tags?: string[] | null
          training_batch_id?: string | null
          twin_id?: string | null
          used_in_training?: boolean | null
          user_id: string
        }
        Update: {
          category?: string | null
          completion?: string
          created_at?: string | null
          id?: string
          prompt?: string
          quality_score?: number | null
          source_platform?: string | null
          source_type?: string | null
          tags?: string[] | null
          training_batch_id?: string | null
          twin_id?: string | null
          used_in_training?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "llm_training_data_twin_id_fkey"
            columns: ["twin_id"]
            isOneToOne: false
            referencedRelation: "digital_twins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llm_training_data_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_usage_log: {
        Row: {
          cache_hit: boolean
          cached_tokens: number
          cost_usd: number
          created_at: string
          id: number
          input_tokens: number
          latency_ms: number | null
          model: string
          output_tokens: number
          service_name: string
          tier: string
          user_id: string | null
        }
        Insert: {
          cache_hit?: boolean
          cached_tokens?: number
          cost_usd?: number
          created_at?: string
          id?: never
          input_tokens?: number
          latency_ms?: number | null
          model: string
          output_tokens?: number
          service_name?: string
          tier: string
          user_id?: string | null
        }
        Update: {
          cache_hit?: boolean
          cached_tokens?: number
          cost_usd?: number
          created_at?: string
          id?: never
          input_tokens?: number
          latency_ms?: number | null
          model?: string
          output_tokens?: number
          service_name?: string
          tier?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "llm_usage_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      long_term_memory: {
        Row: {
          consolidation_version: number | null
          created_at: string | null
          data_sources: string[] | null
          id: string
          last_consolidated: string | null
          soul_signature: Json
          updated_at: string | null
          user_id: string
        }
        Insert: {
          consolidation_version?: number | null
          created_at?: string | null
          data_sources?: string[] | null
          id?: string
          last_consolidated?: string | null
          soul_signature?: Json
          updated_at?: string | null
          user_id: string
        }
        Update: {
          consolidation_version?: number | null
          created_at?: string | null
          data_sources?: string[] | null
          id?: string
          last_consolidated?: string | null
          soul_signature?: Json
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      mcp_conversation_logs: {
        Row: {
          ai_analysis: Json | null
          analyzed_at: string | null
          brain_stats: Json | null
          context_signals: Json | null
          conversation_arc: Json | null
          conversation_depth: string | null
          created_at: string | null
          engagement_level: string | null
          id: string
          intent: string | null
          mcp_client: string | null
          platforms_context: Json | null
          sentiment: string | null
          session_id: string | null
          soul_signature_id: string | null
          subject_matter: Json | null
          tone_profile: Json | null
          topics_detected: string[] | null
          turn_number: number | null
          twin_response: string
          user_id: string
          user_message: string
          writing_analysis: Json | null
        }
        Insert: {
          ai_analysis?: Json | null
          analyzed_at?: string | null
          brain_stats?: Json | null
          context_signals?: Json | null
          conversation_arc?: Json | null
          conversation_depth?: string | null
          created_at?: string | null
          engagement_level?: string | null
          id?: string
          intent?: string | null
          mcp_client?: string | null
          platforms_context?: Json | null
          sentiment?: string | null
          session_id?: string | null
          soul_signature_id?: string | null
          subject_matter?: Json | null
          tone_profile?: Json | null
          topics_detected?: string[] | null
          turn_number?: number | null
          twin_response: string
          user_id: string
          user_message: string
          writing_analysis?: Json | null
        }
        Update: {
          ai_analysis?: Json | null
          analyzed_at?: string | null
          brain_stats?: Json | null
          context_signals?: Json | null
          conversation_arc?: Json | null
          conversation_depth?: string | null
          created_at?: string | null
          engagement_level?: string | null
          id?: string
          intent?: string | null
          mcp_client?: string | null
          platforms_context?: Json | null
          sentiment?: string | null
          session_id?: string | null
          soul_signature_id?: string | null
          subject_matter?: Json | null
          tone_profile?: Json | null
          topics_detected?: string[] | null
          turn_number?: number | null
          twin_response?: string
          user_id?: string
          user_message?: string
          writing_analysis?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "mcp_conversation_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      memory_retrievals: {
        Row: {
          created_at: string | null
          id: string
          query: string
          relevance_scores: Json | null
          retrieved_memories: Json
          user_feedback: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          query: string
          relevance_scores?: Json | null
          retrieved_memories: Json
          user_feedback?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          query?: string
          relevance_scores?: Json | null
          retrieved_memories?: Json
          user_feedback?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memory_retrievals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      moltbot_extraction_jobs: {
        Row: {
          action: Json
          created_at: string | null
          enabled: boolean | null
          id: string
          job_name: string
          last_run_at: string | null
          last_run_status: string | null
          platform: string
          run_count: number | null
          schedule: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          action: Json
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          job_name: string
          last_run_at?: string | null
          last_run_status?: string | null
          platform: string
          run_count?: number | null
          schedule: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          action?: Json
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          job_name?: string
          last_run_at?: string | null
          last_run_status?: string | null
          platform?: string
          run_count?: number | null
          schedule?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      moltbot_job_runs: {
        Row: {
          duration_ms: number | null
          error_message: string | null
          executed_at: string | null
          id: string
          platform: string
          records_extracted: number | null
          result: Json | null
          status: string
          user_id: string
        }
        Insert: {
          duration_ms?: number | null
          error_message?: string | null
          executed_at?: string | null
          id?: string
          platform: string
          records_extracted?: number | null
          result?: Json | null
          status: string
          user_id: string
        }
        Update: {
          duration_ms?: number | null
          error_message?: string | null
          executed_at?: string | null
          id?: string
          platform?: string
          records_extracted?: number | null
          result?: Json | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      moltbot_patterns: {
        Row: {
          category: string
          confidence: number | null
          correlation_id: string | null
          created_at: string | null
          description: string | null
          effect_size: string | null
          evidence: Json
          first_observed: string | null
          id: string
          last_confirmed: string | null
          layer: string
          name: string
          observation_count: number | null
          pattern_data: Json
          pattern_type: string
          r_value: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          category: string
          confidence?: number | null
          correlation_id?: string | null
          created_at?: string | null
          description?: string | null
          effect_size?: string | null
          evidence?: Json
          first_observed?: string | null
          id?: string
          last_confirmed?: string | null
          layer: string
          name: string
          observation_count?: number | null
          pattern_data?: Json
          pattern_type: string
          r_value?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          category?: string
          confidence?: number | null
          correlation_id?: string | null
          created_at?: string | null
          description?: string | null
          effect_size?: string | null
          evidence?: Json
          first_observed?: string | null
          id?: string
          last_confirmed?: string | null
          layer?: string
          name?: string
          observation_count?: number | null
          pattern_data?: Json
          pattern_type?: string
          r_value?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      music_sessions: {
        Row: {
          created_at: string | null
          duration_minutes: number | null
          effectiveness_rating: number | null
          ended_at: string | null
          energy_level: string | null
          genre_tags: string[] | null
          id: string
          notes: string | null
          ritual_id: string | null
          spotify_playlist_id: string | null
          spotify_playlist_name: string | null
          started_at: string | null
          tracks_played: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          duration_minutes?: number | null
          effectiveness_rating?: number | null
          ended_at?: string | null
          energy_level?: string | null
          genre_tags?: string[] | null
          id?: string
          notes?: string | null
          ritual_id?: string | null
          spotify_playlist_id?: string | null
          spotify_playlist_name?: string | null
          started_at?: string | null
          tracks_played?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          duration_minutes?: number | null
          effectiveness_rating?: number | null
          ended_at?: string | null
          energy_level?: string | null
          genre_tags?: string[] | null
          id?: string
          notes?: string | null
          ritual_id?: string | null
          spotify_playlist_id?: string | null
          spotify_playlist_name?: string | null
          started_at?: string | null
          tracks_played?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "music_sessions_ritual_id_fkey"
            columns: ["ritual_id"]
            isOneToOne: false
            referencedRelation: "rituals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "music_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      nango_connection_mappings: {
        Row: {
          connected_at: string | null
          created_at: string | null
          id: string
          last_synced_at: string | null
          metadata: Json | null
          nango_connection_id: string
          platform: string
          provider_config_key: string
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          connected_at?: string | null
          created_at?: string | null
          id?: string
          last_synced_at?: string | null
          metadata?: Json | null
          nango_connection_id: string
          platform: string
          provider_config_key: string
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          connected_at?: string | null
          created_at?: string | null
          id?: string
          last_synced_at?: string | null
          metadata?: Json | null
          nango_connection_id?: string
          platform?: string
          provider_config_key?: string
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      netflix_viewing_history: {
        Row: {
          binge_episode_count: number | null
          completion_percentage: number | null
          content_rating: string | null
          duration_watched_minutes: number | null
          emotional_arc: string | null
          genre: string | null
          id: string
          import_source: string | null
          ingested_at: string | null
          is_binge_watched: boolean | null
          series_or_movie: string | null
          sub_genres: string[] | null
          title: string
          user_id: string
          watched_at: string
        }
        Insert: {
          binge_episode_count?: number | null
          completion_percentage?: number | null
          content_rating?: string | null
          duration_watched_minutes?: number | null
          emotional_arc?: string | null
          genre?: string | null
          id?: string
          import_source?: string | null
          ingested_at?: string | null
          is_binge_watched?: boolean | null
          series_or_movie?: string | null
          sub_genres?: string[] | null
          title: string
          user_id: string
          watched_at: string
        }
        Update: {
          binge_episode_count?: number | null
          completion_percentage?: number | null
          content_rating?: string | null
          duration_watched_minutes?: number | null
          emotional_arc?: string | null
          genre?: string | null
          id?: string
          import_source?: string | null
          ingested_at?: string | null
          is_binge_watched?: boolean | null
          series_or_movie?: string | null
          sub_genres?: string[] | null
          title?: string
          user_id?: string
          watched_at?: string
        }
        Relationships: []
      }
      oauth_sessions: {
        Row: {
          code_verifier: string
          created_at: string
          expires_at: string
          id: string
          provider: string
          state: string
          user_id: string
        }
        Insert: {
          code_verifier: string
          created_at?: string
          expires_at: string
          id?: string
          provider: string
          state: string
          user_id: string
        }
        Update: {
          code_verifier?: string
          created_at?: string
          expires_at?: string
          id?: string
          provider?: string
          state?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_states: {
        Row: {
          code_verifier: string | null
          created_at: string | null
          data: Json | null
          expires_at: string
          id: string
          state: string
          used: boolean | null
          used_at: string | null
        }
        Insert: {
          code_verifier?: string | null
          created_at?: string | null
          data?: Json | null
          expires_at: string
          id?: string
          state: string
          used?: boolean | null
          used_at?: string | null
        }
        Update: {
          code_verifier?: string | null
          created_at?: string | null
          data?: Json | null
          expires_at?: string
          id?: string
          state?: string
          used?: boolean | null
          used_at?: string | null
        }
        Relationships: []
      }
      onboarding_calibration: {
        Row: {
          archetype_hint: string | null
          completed_at: string | null
          conversation_history: Json | null
          created_at: string
          enrichment_context: Json | null
          id: number
          insights: Json | null
          personality_summary: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archetype_hint?: string | null
          completed_at?: string | null
          conversation_history?: Json | null
          created_at?: string
          enrichment_context?: Json | null
          id?: never
          insights?: Json | null
          personality_summary?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          archetype_hint?: string | null
          completed_at?: string | null
          conversation_history?: Json | null
          created_at?: string
          enrichment_context?: Json | null
          id?: never
          insights?: Json | null
          personality_summary?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_calibration_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_state: {
        Row: {
          completed: boolean | null
          completed_at: string | null
          created_at: string | null
          current_step: string | null
          id: string
          privacy_level: number | null
          selected_platforms: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          current_step?: string | null
          id?: string
          privacy_level?: number | null
          selected_platforms?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          current_step?: string | null
          id?: string
          privacy_level?: number | null
          selected_platforms?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      origin_data: {
        Row: {
          birthplace_city: string | null
          birthplace_country: string | null
          career_goals: string | null
          career_stage: string | null
          causes: string[] | null
          certifications: string[] | null
          completed_sections: string[] | null
          completion_percentage: number | null
          core_values: string[] | null
          created_at: string | null
          cultural_background: string[] | null
          current_city: string | null
          current_country: string | null
          decision_style: string | null
          field_of_study: string | null
          highest_education: string | null
          id: string
          industry: string | null
          interests: string[] | null
          introvert_extrovert: string | null
          job_title: string | null
          languages_spoken: string[] | null
          life_priorities: string[] | null
          places_lived: Json | null
          schools: Json | null
          skipped_at: string | null
          updated_at: string | null
          user_id: string
          work_preference: string | null
          work_style: string | null
          years_experience: number | null
        }
        Insert: {
          birthplace_city?: string | null
          birthplace_country?: string | null
          career_goals?: string | null
          career_stage?: string | null
          causes?: string[] | null
          certifications?: string[] | null
          completed_sections?: string[] | null
          completion_percentage?: number | null
          core_values?: string[] | null
          created_at?: string | null
          cultural_background?: string[] | null
          current_city?: string | null
          current_country?: string | null
          decision_style?: string | null
          field_of_study?: string | null
          highest_education?: string | null
          id?: string
          industry?: string | null
          interests?: string[] | null
          introvert_extrovert?: string | null
          job_title?: string | null
          languages_spoken?: string[] | null
          life_priorities?: string[] | null
          places_lived?: Json | null
          schools?: Json | null
          skipped_at?: string | null
          updated_at?: string | null
          user_id: string
          work_preference?: string | null
          work_style?: string | null
          years_experience?: number | null
        }
        Update: {
          birthplace_city?: string | null
          birthplace_country?: string | null
          career_goals?: string | null
          career_stage?: string | null
          causes?: string[] | null
          certifications?: string[] | null
          completed_sections?: string[] | null
          completion_percentage?: number | null
          core_values?: string[] | null
          created_at?: string | null
          cultural_background?: string[] | null
          current_city?: string | null
          current_country?: string | null
          decision_style?: string | null
          field_of_study?: string | null
          highest_education?: string | null
          id?: string
          industry?: string | null
          interests?: string[] | null
          introvert_extrovert?: string | null
          job_title?: string | null
          languages_spoken?: string[] | null
          life_priorities?: string[] | null
          places_lived?: Json | null
          schools?: Json | null
          skipped_at?: string | null
          updated_at?: string | null
          user_id?: string
          work_preference?: string | null
          work_style?: string | null
          years_experience?: number | null
        }
        Relationships: []
      }
      pattern_insights: {
        Row: {
          confidence: number | null
          created_at: string | null
          description: string
          dismissed_at: string | null
          expires_at: string | null
          generated_at: string | null
          id: string
          insight_data: Json
          insight_type: string
          pattern_id: string | null
          privacy_level: number | null
          shared_with_twin: boolean | null
          suggestions: Json | null
          title: string
          updated_at: string | null
          user_acknowledged: boolean | null
          user_feedback: string | null
          user_id: string
          user_rating: number | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string | null
          description: string
          dismissed_at?: string | null
          expires_at?: string | null
          generated_at?: string | null
          id?: string
          insight_data: Json
          insight_type: string
          pattern_id?: string | null
          privacy_level?: number | null
          shared_with_twin?: boolean | null
          suggestions?: Json | null
          title: string
          updated_at?: string | null
          user_acknowledged?: boolean | null
          user_feedback?: string | null
          user_id: string
          user_rating?: number | null
        }
        Update: {
          confidence?: number | null
          created_at?: string | null
          description?: string
          dismissed_at?: string | null
          expires_at?: string | null
          generated_at?: string | null
          id?: string
          insight_data?: Json
          insight_type?: string
          pattern_id?: string | null
          privacy_level?: number | null
          shared_with_twin?: boolean | null
          suggestions?: Json | null
          title?: string
          updated_at?: string | null
          user_acknowledged?: boolean | null
          user_feedback?: string | null
          user_id?: string
          user_rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pattern_insights_pattern_id_fkey"
            columns: ["pattern_id"]
            isOneToOne: false
            referencedRelation: "behavioral_patterns"
            referencedColumns: ["id"]
          },
        ]
      }
      pattern_observations: {
        Row: {
          actual_duration_minutes: number | null
          actual_time_offset_minutes: number | null
          anomaly_score: number | null
          contributed_to_pattern: boolean | null
          created_at: string | null
          id: string
          match_strength: number | null
          observed_at: string | null
          pattern_id: string
          response_activity_data: Json | null
          response_activity_id: string | null
          response_timestamp: string
          trigger_event_data: Json | null
          trigger_event_id: string | null
          trigger_timestamp: string
          user_id: string
        }
        Insert: {
          actual_duration_minutes?: number | null
          actual_time_offset_minutes?: number | null
          anomaly_score?: number | null
          contributed_to_pattern?: boolean | null
          created_at?: string | null
          id?: string
          match_strength?: number | null
          observed_at?: string | null
          pattern_id: string
          response_activity_data?: Json | null
          response_activity_id?: string | null
          response_timestamp: string
          trigger_event_data?: Json | null
          trigger_event_id?: string | null
          trigger_timestamp: string
          user_id: string
        }
        Update: {
          actual_duration_minutes?: number | null
          actual_time_offset_minutes?: number | null
          anomaly_score?: number | null
          contributed_to_pattern?: boolean | null
          created_at?: string | null
          id?: string
          match_strength?: number | null
          observed_at?: string | null
          pattern_id?: string
          response_activity_data?: Json | null
          response_activity_id?: string | null
          response_timestamp?: string
          trigger_event_data?: Json | null
          trigger_event_id?: string | null
          trigger_timestamp?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pattern_observations_pattern_id_fkey"
            columns: ["pattern_id"]
            isOneToOne: false
            referencedRelation: "behavioral_patterns"
            referencedColumns: ["id"]
          },
        ]
      }
      pattern_tracking_sessions: {
        Row: {
          anomalies_detected: number | null
          completed_at: string | null
          created_at: string | null
          detected_activities: Json | null
          error_message: string | null
          id: string
          patterns_discovered: number | null
          patterns_matched: number | null
          session_type: string
          status: string | null
          tracked_events: Json | null
          user_id: string
          window_end: string
          window_start: string
        }
        Insert: {
          anomalies_detected?: number | null
          completed_at?: string | null
          created_at?: string | null
          detected_activities?: Json | null
          error_message?: string | null
          id?: string
          patterns_discovered?: number | null
          patterns_matched?: number | null
          session_type: string
          status?: string | null
          tracked_events?: Json | null
          user_id: string
          window_end: string
          window_start: string
        }
        Update: {
          anomalies_detected?: number | null
          completed_at?: string | null
          created_at?: string | null
          detected_activities?: Json | null
          error_message?: string | null
          id?: string
          patterns_discovered?: number | null
          patterns_matched?: number | null
          session_type?: string
          status?: string | null
          tracked_events?: Json | null
          user_id?: string
          window_end?: string
          window_start?: string
        }
        Relationships: []
      }
      patterns_detected: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          evidence_count: number | null
          first_observed_at: string | null
          id: string
          is_active: boolean | null
          last_observed_at: string | null
          pattern_data: Json
          pattern_description: string | null
          pattern_name: string
          pattern_type: string
          source_ritual_ids: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          evidence_count?: number | null
          first_observed_at?: string | null
          id?: string
          is_active?: boolean | null
          last_observed_at?: string | null
          pattern_data: Json
          pattern_description?: string | null
          pattern_name: string
          pattern_type: string
          source_ritual_ids?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          evidence_count?: number | null
          first_observed_at?: string | null
          id?: string
          is_active?: boolean | null
          last_observed_at?: string | null
          pattern_data?: Json
          pattern_description?: string | null
          pattern_name?: string
          pattern_type?: string
          source_ritual_ids?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "patterns_detected_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      personality_archetypes: {
        Row: {
          agreeableness_max: number | null
          agreeableness_min: number | null
          code: string
          color_primary: string | null
          color_secondary: string | null
          conscientiousness_max: number | null
          conscientiousness_min: number | null
          created_at: string | null
          description: string | null
          energy_max: number | null
          energy_min: number | null
          extraversion_max: number | null
          extraversion_min: number | null
          group_name: string | null
          icon: string | null
          id: string
          mind_max: number | null
          mind_min: number | null
          name: string
          nature_max: number | null
          nature_min: number | null
          openness_max: number | null
          openness_min: number | null
          strengths: string[] | null
          tactics_max: number | null
          tactics_min: number | null
          weaknesses: string[] | null
        }
        Insert: {
          agreeableness_max?: number | null
          agreeableness_min?: number | null
          code: string
          color_primary?: string | null
          color_secondary?: string | null
          conscientiousness_max?: number | null
          conscientiousness_min?: number | null
          created_at?: string | null
          description?: string | null
          energy_max?: number | null
          energy_min?: number | null
          extraversion_max?: number | null
          extraversion_min?: number | null
          group_name?: string | null
          icon?: string | null
          id?: string
          mind_max?: number | null
          mind_min?: number | null
          name: string
          nature_max?: number | null
          nature_min?: number | null
          openness_max?: number | null
          openness_min?: number | null
          strengths?: string[] | null
          tactics_max?: number | null
          tactics_min?: number | null
          weaknesses?: string[] | null
        }
        Update: {
          agreeableness_max?: number | null
          agreeableness_min?: number | null
          code?: string
          color_primary?: string | null
          color_secondary?: string | null
          conscientiousness_max?: number | null
          conscientiousness_min?: number | null
          created_at?: string | null
          description?: string | null
          energy_max?: number | null
          energy_min?: number | null
          extraversion_max?: number | null
          extraversion_min?: number | null
          group_name?: string | null
          icon?: string | null
          id?: string
          mind_max?: number | null
          mind_min?: number | null
          name?: string
          nature_max?: number | null
          nature_min?: number | null
          openness_max?: number | null
          openness_min?: number | null
          strengths?: string[] | null
          tactics_max?: number | null
          tactics_min?: number | null
          weaknesses?: string[] | null
        }
        Relationships: []
      }
      personality_estimates: {
        Row: {
          agreeableness: number | null
          agreeableness_ci: number | null
          archetype_code: string | null
          behavioral_score_weight: number | null
          conscientiousness: number | null
          conscientiousness_ci: number | null
          created_at: string | null
          energy: number | null
          energy_ci: number | null
          extraversion: number | null
          extraversion_ci: number | null
          id: string
          identity: number | null
          identity_ci: number | null
          last_behavioral_update_at: string | null
          last_questionnaire_at: string | null
          mind: number | null
          mind_ci: number | null
          nature: number | null
          nature_ci: number | null
          neuroticism: number | null
          neuroticism_ci: number | null
          openness: number | null
          openness_ci: number | null
          questionnaire_score_weight: number | null
          tactics: number | null
          tactics_ci: number | null
          total_behavioral_signals: number | null
          total_questions_answered: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          agreeableness?: number | null
          agreeableness_ci?: number | null
          archetype_code?: string | null
          behavioral_score_weight?: number | null
          conscientiousness?: number | null
          conscientiousness_ci?: number | null
          created_at?: string | null
          energy?: number | null
          energy_ci?: number | null
          extraversion?: number | null
          extraversion_ci?: number | null
          id?: string
          identity?: number | null
          identity_ci?: number | null
          last_behavioral_update_at?: string | null
          last_questionnaire_at?: string | null
          mind?: number | null
          mind_ci?: number | null
          nature?: number | null
          nature_ci?: number | null
          neuroticism?: number | null
          neuroticism_ci?: number | null
          openness?: number | null
          openness_ci?: number | null
          questionnaire_score_weight?: number | null
          tactics?: number | null
          tactics_ci?: number | null
          total_behavioral_signals?: number | null
          total_questions_answered?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          agreeableness?: number | null
          agreeableness_ci?: number | null
          archetype_code?: string | null
          behavioral_score_weight?: number | null
          conscientiousness?: number | null
          conscientiousness_ci?: number | null
          created_at?: string | null
          energy?: number | null
          energy_ci?: number | null
          extraversion?: number | null
          extraversion_ci?: number | null
          id?: string
          identity?: number | null
          identity_ci?: number | null
          last_behavioral_update_at?: string | null
          last_questionnaire_at?: string | null
          mind?: number | null
          mind_ci?: number | null
          nature?: number | null
          nature_ci?: number | null
          neuroticism?: number | null
          neuroticism_ci?: number | null
          openness?: number | null
          openness_ci?: number | null
          questionnaire_score_weight?: number | null
          tactics?: number | null
          tactics_ci?: number | null
          total_behavioral_signals?: number | null
          total_questions_answered?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "personality_estimates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      personality_insights: {
        Row: {
          analysis_method: string
          confidence_score: number
          id: string
          insight_data: Json
          insight_type: string
          last_updated: string | null
          source_data_count: number
          source_data_ids: string[] | null
          supersedes_insight_id: string | null
          update_trigger: string | null
          user_id: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          analysis_method: string
          confidence_score: number
          id?: string
          insight_data: Json
          insight_type: string
          last_updated?: string | null
          source_data_count: number
          source_data_ids?: string[] | null
          supersedes_insight_id?: string | null
          update_trigger?: string | null
          user_id: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          analysis_method?: string
          confidence_score?: number
          id?: string
          insight_data?: Json
          insight_type?: string
          last_updated?: string | null
          source_data_count?: number
          source_data_ids?: string[] | null
          supersedes_insight_id?: string | null
          update_trigger?: string | null
          user_id?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "personality_insights_supersedes_insight_id_fkey"
            columns: ["supersedes_insight_id"]
            isOneToOne: false
            referencedRelation: "personality_insights"
            referencedColumns: ["id"]
          },
        ]
      }
      personality_questions: {
        Row: {
          created_at: string | null
          dimension: string
          facet: string | null
          id: string
          is_active: boolean | null
          item_difficulty: number | null
          item_discrimination: number | null
          question_order: number | null
          question_text: string
          quick_pulse: boolean | null
          reverse_scored: boolean | null
          target_pole: string | null
          version: number | null
        }
        Insert: {
          created_at?: string | null
          dimension: string
          facet?: string | null
          id?: string
          is_active?: boolean | null
          item_difficulty?: number | null
          item_discrimination?: number | null
          question_order?: number | null
          question_text: string
          quick_pulse?: boolean | null
          reverse_scored?: boolean | null
          target_pole?: string | null
          version?: number | null
        }
        Update: {
          created_at?: string | null
          dimension?: string
          facet?: string | null
          id?: string
          is_active?: boolean | null
          item_difficulty?: number | null
          item_discrimination?: number | null
          question_order?: number | null
          question_text?: string
          quick_pulse?: boolean | null
          reverse_scored?: boolean | null
          target_pole?: string | null
          version?: number | null
        }
        Relationships: []
      }
      personality_responses: {
        Row: {
          created_at: string | null
          id: string
          question_id: string | null
          response_time_ms: number | null
          response_value: number | null
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          question_id?: string | null
          response_time_ms?: number | null
          response_value?: number | null
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          question_id?: string | null
          response_time_ms?: number | null
          response_value?: number | null
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "personality_responses_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "personality_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personality_responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      personality_scores: {
        Row: {
          agreeableness: number
          agreeableness_confidence: number | null
          analyzed_platforms: string[] | null
          calculated_at: string | null
          conscientiousness: number
          conscientiousness_confidence: number | null
          created_at: string | null
          extraversion: number
          extraversion_confidence: number | null
          id: string
          neuroticism: number
          neuroticism_confidence: number | null
          openness: number
          openness_confidence: number | null
          questionnaire_version: string | null
          sample_size: number | null
          source: string | null
          source_type: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          agreeableness: number
          agreeableness_confidence?: number | null
          analyzed_platforms?: string[] | null
          calculated_at?: string | null
          conscientiousness: number
          conscientiousness_confidence?: number | null
          created_at?: string | null
          extraversion: number
          extraversion_confidence?: number | null
          id?: string
          neuroticism: number
          neuroticism_confidence?: number | null
          openness: number
          openness_confidence?: number | null
          questionnaire_version?: string | null
          sample_size?: number | null
          source?: string | null
          source_type?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          agreeableness?: number
          agreeableness_confidence?: number | null
          analyzed_platforms?: string[] | null
          calculated_at?: string | null
          conscientiousness?: number
          conscientiousness_confidence?: number | null
          created_at?: string | null
          extraversion?: number
          extraversion_confidence?: number | null
          id?: string
          neuroticism?: number
          neuroticism_confidence?: number | null
          openness?: number
          openness_confidence?: number | null
          questionnaire_version?: string | null
          sample_size?: number | null
          source?: string | null
          source_type?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personality_scores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      pl_behavioral_deviations: {
        Row: {
          baseline_mean: number | null
          baseline_std_dev: number | null
          context: Json | null
          detected_at: string | null
          direction: string | null
          expires_at: string | null
          id: string
          metric_name: string
          observed_value: number | null
          platform: string | null
          raw_event_id: string | null
          significance: string | null
          user_id: string
          z_score: number | null
        }
        Insert: {
          baseline_mean?: number | null
          baseline_std_dev?: number | null
          context?: Json | null
          detected_at?: string | null
          direction?: string | null
          expires_at?: string | null
          id?: string
          metric_name: string
          observed_value?: number | null
          platform?: string | null
          raw_event_id?: string | null
          significance?: string | null
          user_id: string
          z_score?: number | null
        }
        Update: {
          baseline_mean?: number | null
          baseline_std_dev?: number | null
          context?: Json | null
          detected_at?: string | null
          direction?: string | null
          expires_at?: string | null
          id?: string
          metric_name?: string
          observed_value?: number | null
          platform?: string | null
          raw_event_id?: string | null
          significance?: string | null
          user_id?: string
          z_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pl_behavioral_deviations_raw_event_id_fkey"
            columns: ["raw_event_id"]
            isOneToOne: false
            referencedRelation: "pl_raw_behavioral_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pl_behavioral_deviations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      pl_discovered_correlations: {
        Row: {
          correlation_coefficient: number | null
          direction: string | null
          discovered_at: string | null
          id: string
          last_validated_at: string | null
          metric_a: string
          metric_b: string
          p_value: number | null
          platform_a: string | null
          platform_b: string | null
          sample_size: number | null
          still_valid: boolean | null
          strength: string | null
          time_lag_hours: number | null
          user_id: string
          validation_count: number | null
        }
        Insert: {
          correlation_coefficient?: number | null
          direction?: string | null
          discovered_at?: string | null
          id?: string
          last_validated_at?: string | null
          metric_a: string
          metric_b: string
          p_value?: number | null
          platform_a?: string | null
          platform_b?: string | null
          sample_size?: number | null
          still_valid?: boolean | null
          strength?: string | null
          time_lag_hours?: number | null
          user_id: string
          validation_count?: number | null
        }
        Update: {
          correlation_coefficient?: number | null
          direction?: string | null
          discovered_at?: string | null
          id?: string
          last_validated_at?: string | null
          metric_a?: string
          metric_b?: string
          p_value?: number | null
          platform_a?: string | null
          platform_b?: string | null
          sample_size?: number | null
          still_valid?: boolean | null
          strength?: string | null
          time_lag_hours?: number | null
          user_id?: string
          validation_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pl_discovered_correlations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      pl_pattern_hypotheses: {
        Row: {
          category: string | null
          confidence_score: number | null
          correlation_id: string | null
          created_at: string | null
          deactivated_at: string | null
          deactivation_reason: string | null
          evidence_count: number | null
          hypothesis_text: string
          id: string
          invalidated_count: number | null
          is_active: boolean | null
          user_id: string
          validated_count: number | null
        }
        Insert: {
          category?: string | null
          confidence_score?: number | null
          correlation_id?: string | null
          created_at?: string | null
          deactivated_at?: string | null
          deactivation_reason?: string | null
          evidence_count?: number | null
          hypothesis_text: string
          id?: string
          invalidated_count?: number | null
          is_active?: boolean | null
          user_id: string
          validated_count?: number | null
        }
        Update: {
          category?: string | null
          confidence_score?: number | null
          correlation_id?: string | null
          created_at?: string | null
          deactivated_at?: string | null
          deactivation_reason?: string | null
          evidence_count?: number | null
          hypothesis_text?: string
          id?: string
          invalidated_count?: number | null
          is_active?: boolean | null
          user_id?: string
          validated_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pl_pattern_hypotheses_correlation_id_fkey"
            columns: ["correlation_id"]
            isOneToOne: false
            referencedRelation: "pl_discovered_correlations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pl_pattern_hypotheses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      pl_proactive_insights: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          deviation_id: string | null
          expires_at: string | null
          feedback_at: string | null
          feedback_notes: string | null
          hypothesis_id: string | null
          id: string
          insight_type: string | null
          message: string
          relevance_score: number | null
          shown_at: string | null
          suggested_action: Json | null
          user_feedback: string | null
          user_id: string
          was_shown: boolean | null
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          deviation_id?: string | null
          expires_at?: string | null
          feedback_at?: string | null
          feedback_notes?: string | null
          hypothesis_id?: string | null
          id?: string
          insight_type?: string | null
          message: string
          relevance_score?: number | null
          shown_at?: string | null
          suggested_action?: Json | null
          user_feedback?: string | null
          user_id: string
          was_shown?: boolean | null
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          deviation_id?: string | null
          expires_at?: string | null
          feedback_at?: string | null
          feedback_notes?: string | null
          hypothesis_id?: string | null
          id?: string
          insight_type?: string | null
          message?: string
          relevance_score?: number | null
          shown_at?: string | null
          suggested_action?: Json | null
          user_feedback?: string | null
          user_id?: string
          was_shown?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "pl_proactive_insights_deviation_id_fkey"
            columns: ["deviation_id"]
            isOneToOne: false
            referencedRelation: "pl_behavioral_deviations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pl_proactive_insights_hypothesis_id_fkey"
            columns: ["hypothesis_id"]
            isOneToOne: false
            referencedRelation: "pl_pattern_hypotheses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pl_proactive_insights_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      pl_raw_behavioral_events: {
        Row: {
          context: Json | null
          created_at: string | null
          event_data: Json
          event_timestamp: string
          event_type: string
          expires_at: string | null
          id: string
          platform: string
          user_id: string
        }
        Insert: {
          context?: Json | null
          created_at?: string | null
          event_data: Json
          event_timestamp: string
          event_type: string
          expires_at?: string | null
          id?: string
          platform: string
          user_id: string
        }
        Update: {
          context?: Json | null
          created_at?: string | null
          event_data?: Json
          event_timestamp?: string
          event_type?: string
          expires_at?: string | null
          id?: string
          platform?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pl_raw_behavioral_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      pl_user_baselines: {
        Row: {
          dow_means: Json | null
          id: string
          last_computed_at: string | null
          max_value: number | null
          mean: number | null
          median: number | null
          metric_name: string
          min_value: number | null
          percentile_25: number | null
          percentile_75: number | null
          platform: string | null
          sample_count: number | null
          std_dev: number | null
          tod_means: Json | null
          user_id: string
          window_days: number
        }
        Insert: {
          dow_means?: Json | null
          id?: string
          last_computed_at?: string | null
          max_value?: number | null
          mean?: number | null
          median?: number | null
          metric_name: string
          min_value?: number | null
          percentile_25?: number | null
          percentile_75?: number | null
          platform?: string | null
          sample_count?: number | null
          std_dev?: number | null
          tod_means?: Json | null
          user_id: string
          window_days: number
        }
        Update: {
          dow_means?: Json | null
          id?: string
          last_computed_at?: string | null
          max_value?: number | null
          mean?: number | null
          median?: number | null
          metric_name?: string
          min_value?: number | null
          percentile_25?: number | null
          percentile_75?: number | null
          platform?: string | null
          sample_count?: number | null
          std_dev?: number | null
          tod_means?: Json | null
          user_id?: string
          window_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "pl_user_baselines_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_activity_history: {
        Row: {
          activity_label: string
          activity_level: string
          activity_score: number
          content_volume: number | null
          id: string
          measured_at: string | null
          metrics_snapshot: Json
          platform: string
          user_id: string
        }
        Insert: {
          activity_label: string
          activity_level: string
          activity_score: number
          content_volume?: number | null
          id?: string
          measured_at?: string | null
          metrics_snapshot: Json
          platform: string
          user_id: string
        }
        Update: {
          activity_label?: string
          activity_level?: string
          activity_score?: number
          content_volume?: number | null
          id?: string
          measured_at?: string | null
          metrics_snapshot?: Json
          platform?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_activity_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_connections: {
        Row: {
          access_token: string
          activity_calculated_at: string | null
          activity_label: string | null
          activity_level: string | null
          activity_metrics: Json | null
          activity_score: number | null
          connected_at: string | null
          content_volume: number | null
          id: string
          last_activity_at: string | null
          last_sync_at: string | null
          last_sync_error: string | null
          last_sync_status: string | null
          metadata: Json | null
          platform: string
          refresh_token: string | null
          scopes: string[] | null
          status: string | null
          token_expires_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token: string
          activity_calculated_at?: string | null
          activity_label?: string | null
          activity_level?: string | null
          activity_metrics?: Json | null
          activity_score?: number | null
          connected_at?: string | null
          content_volume?: number | null
          id?: string
          last_activity_at?: string | null
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          metadata?: Json | null
          platform: string
          refresh_token?: string | null
          scopes?: string[] | null
          status?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string
          activity_calculated_at?: string | null
          activity_label?: string | null
          activity_level?: string | null
          activity_metrics?: Json | null
          activity_score?: number | null
          connected_at?: string | null
          content_volume?: number | null
          id?: string
          last_activity_at?: string | null
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          metadata?: Json | null
          platform?: string
          refresh_token?: string | null
          scopes?: string[] | null
          status?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_extraction_config: {
        Row: {
          api_base_url: string
          api_version: string | null
          available_endpoints: Json
          cost_notes: string | null
          cost_per_month: number | null
          created_at: string | null
          data_types_supported: string[] | null
          historical_data_limit_days: number | null
          id: string
          is_active: boolean | null
          is_free: boolean | null
          last_test_status: string | null
          last_tested: string | null
          provider: string
          rate_limit_per_hour: number | null
          rate_limit_per_minute: number | null
          requires_business_account: boolean | null
          requires_premium: boolean | null
          supports_historical_data: boolean | null
          updated_at: string | null
        }
        Insert: {
          api_base_url: string
          api_version?: string | null
          available_endpoints: Json
          cost_notes?: string | null
          cost_per_month?: number | null
          created_at?: string | null
          data_types_supported?: string[] | null
          historical_data_limit_days?: number | null
          id?: string
          is_active?: boolean | null
          is_free?: boolean | null
          last_test_status?: string | null
          last_tested?: string | null
          provider: string
          rate_limit_per_hour?: number | null
          rate_limit_per_minute?: number | null
          requires_business_account?: boolean | null
          requires_premium?: boolean | null
          supports_historical_data?: boolean | null
          updated_at?: string | null
        }
        Update: {
          api_base_url?: string
          api_version?: string | null
          available_endpoints?: Json
          cost_notes?: string | null
          cost_per_month?: number | null
          created_at?: string | null
          data_types_supported?: string[] | null
          historical_data_limit_days?: number | null
          id?: string
          is_active?: boolean | null
          is_free?: boolean | null
          last_test_status?: string | null
          last_tested?: string | null
          provider?: string
          rate_limit_per_hour?: number | null
          rate_limit_per_minute?: number | null
          requires_business_account?: boolean | null
          requires_premium?: boolean | null
          supports_historical_data?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      platform_insights: {
        Row: {
          avg_engagement_rate: number | null
          created_at: string | null
          discord_data: Json | null
          github_data: Json | null
          id: string
          last_synced: string | null
          linkedin_data: Json | null
          peak_activity_times: Json | null
          platform: string
          preferred_content_types: string[] | null
          slack_data: Json | null
          spotify_data: Json | null
          total_interactions: number | null
          user_id: string
        }
        Insert: {
          avg_engagement_rate?: number | null
          created_at?: string | null
          discord_data?: Json | null
          github_data?: Json | null
          id?: string
          last_synced?: string | null
          linkedin_data?: Json | null
          peak_activity_times?: Json | null
          platform: string
          preferred_content_types?: string[] | null
          slack_data?: Json | null
          spotify_data?: Json | null
          total_interactions?: number | null
          user_id: string
        }
        Update: {
          avg_engagement_rate?: number | null
          created_at?: string | null
          discord_data?: Json | null
          github_data?: Json | null
          id?: string
          last_synced?: string | null
          linkedin_data?: Json | null
          peak_activity_times?: Json | null
          platform?: string
          preferred_content_types?: string[] | null
          slack_data?: Json | null
          spotify_data?: Json | null
          total_interactions?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_insights_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_webhooks: {
        Row: {
          active: boolean | null
          created_at: string | null
          events: string[] | null
          id: string
          metadata: Json | null
          platform: string
          updated_at: string | null
          user_id: string
          webhook_id: string | null
          webhook_url: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          events?: string[] | null
          id?: string
          metadata?: Json | null
          platform: string
          updated_at?: string | null
          user_id: string
          webhook_id?: string | null
          webhook_url: string
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          events?: string[] | null
          id?: string
          metadata?: Json | null
          platform?: string
          updated_at?: string | null
          user_id?: string
          webhook_id?: string | null
          webhook_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_webhooks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      population_norms: {
        Row: {
          domain: string
          facet_number: number | null
          id: string
          mean: number
          percentile_table: Json | null
          questionnaire_version: string
          sample_size: number
          source: string | null
          std_dev: number
          updated_at: string | null
        }
        Insert: {
          domain: string
          facet_number?: number | null
          id?: string
          mean: number
          percentile_table?: Json | null
          questionnaire_version: string
          sample_size: number
          source?: string | null
          std_dev: number
          updated_at?: string | null
        }
        Update: {
          domain?: string
          facet_number?: number | null
          id?: string
          mean?: number
          percentile_table?: Json | null
          questionnaire_version?: string
          sample_size?: number
          source?: string | null
          std_dev?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      privacy_audit_log: {
        Row: {
          action: string
          changed_at: string | null
          cluster_changes: Json | null
          id: string
          metadata: Json | null
          new_global_privacy: number | null
          previous_global_privacy: number | null
          user_id: string
        }
        Insert: {
          action: string
          changed_at?: string | null
          cluster_changes?: Json | null
          id?: string
          metadata?: Json | null
          new_global_privacy?: number | null
          previous_global_privacy?: number | null
          user_id: string
        }
        Update: {
          action?: string
          changed_at?: string | null
          cluster_changes?: Json | null
          id?: string
          metadata?: Json | null
          new_global_privacy?: number | null
          previous_global_privacy?: number | null
          user_id?: string
        }
        Relationships: []
      }
      privacy_settings: {
        Row: {
          agreeableness_reveal: number | null
          audience_profiles: Json | null
          audience_specific_settings: Json | null
          clusters: Json | null
          conscientiousness_reveal: number | null
          created_at: string | null
          creative_clusters_reveal: number | null
          extraversion_reveal: number | null
          global_privacy: number
          global_reveal_level: number | null
          hidden_features: string[] | null
          hidden_patterns: string[] | null
          id: string
          neuroticism_reveal: number | null
          openness_reveal: number | null
          personal_clusters_reveal: number | null
          platform_overrides: Json | null
          professional_clusters_reveal: number | null
          selected_audience_id: string
          selected_template_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          agreeableness_reveal?: number | null
          audience_profiles?: Json | null
          audience_specific_settings?: Json | null
          clusters?: Json | null
          conscientiousness_reveal?: number | null
          created_at?: string | null
          creative_clusters_reveal?: number | null
          extraversion_reveal?: number | null
          global_privacy?: number
          global_reveal_level?: number | null
          hidden_features?: string[] | null
          hidden_patterns?: string[] | null
          id?: string
          neuroticism_reveal?: number | null
          openness_reveal?: number | null
          personal_clusters_reveal?: number | null
          platform_overrides?: Json | null
          professional_clusters_reveal?: number | null
          selected_audience_id?: string
          selected_template_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          agreeableness_reveal?: number | null
          audience_profiles?: Json | null
          audience_specific_settings?: Json | null
          clusters?: Json | null
          conscientiousness_reveal?: number | null
          created_at?: string | null
          creative_clusters_reveal?: number | null
          extraversion_reveal?: number | null
          global_privacy?: number
          global_reveal_level?: number | null
          hidden_features?: string[] | null
          hidden_patterns?: string[] | null
          id?: string
          neuroticism_reveal?: number | null
          openness_reveal?: number | null
          personal_clusters_reveal?: number | null
          platform_overrides?: Json | null
          professional_clusters_reveal?: number | null
          selected_audience_id?: string
          selected_template_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "privacy_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      privacy_templates: {
        Row: {
          color: string | null
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_custom: boolean | null
          is_default: boolean | null
          last_used: string | null
          name: string
          settings: Json
          updated_at: string | null
          usage_count: number | null
          user_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_custom?: boolean | null
          is_default?: boolean | null
          last_used?: string | null
          name: string
          settings: Json
          updated_at?: string | null
          usage_count?: number | null
          user_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_custom?: boolean | null
          is_default?: boolean | null
          last_used?: string | null
          name?: string
          settings?: Json
          updated_at?: string | null
          usage_count?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      proactive_insights: {
        Row: {
          category: string | null
          created_at: string | null
          delivered: boolean | null
          delivered_at: string | null
          id: string
          insight: string
          urgency: string | null
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          delivered?: boolean | null
          delivered_at?: string | null
          id?: string
          insight: string
          urgency?: string | null
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          delivered?: boolean | null
          delivered_at?: string | null
          id?: string
          insight?: string
          urgency?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proactive_insights_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      proactive_triggers: {
        Row: {
          actions: Json
          conditions: Json
          cooldown_minutes: number | null
          correlation_strength: number | null
          created_at: string | null
          description: string | null
          enabled: boolean | null
          id: string
          is_system: boolean | null
          last_triggered_at: string | null
          max_triggers_per_day: number | null
          name: string
          priority: number | null
          research_basis: string | null
          trigger_count: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          actions?: Json
          conditions?: Json
          cooldown_minutes?: number | null
          correlation_strength?: number | null
          created_at?: string | null
          description?: string | null
          enabled?: boolean | null
          id?: string
          is_system?: boolean | null
          last_triggered_at?: string | null
          max_triggers_per_day?: number | null
          name: string
          priority?: number | null
          research_basis?: string | null
          trigger_count?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          actions?: Json
          conditions?: Json
          cooldown_minutes?: number | null
          correlation_strength?: number | null
          created_at?: string | null
          description?: string | null
          enabled?: boolean | null
          id?: string
          is_system?: boolean | null
          last_triggered_at?: string | null
          max_triggers_per_day?: number | null
          name?: string
          priority?: number | null
          research_basis?: string | null
          trigger_count?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proactive_triggers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      purpose_context_patterns: {
        Row: {
          context_conditions: Json
          created_at: string | null
          follow_count: number | null
          id: string
          is_active: boolean | null
          match_count: number | null
          pattern_confidence: number | null
          pattern_description: string | null
          pattern_name: string
          recommended_purpose: string
          success_rate: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          context_conditions: Json
          created_at?: string | null
          follow_count?: number | null
          id?: string
          is_active?: boolean | null
          match_count?: number | null
          pattern_confidence?: number | null
          pattern_description?: string | null
          pattern_name: string
          recommended_purpose: string
          success_rate?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          context_conditions?: Json
          created_at?: string | null
          follow_count?: number | null
          id?: string
          is_active?: boolean | null
          match_count?: number | null
          pattern_confidence?: number | null
          pattern_description?: string | null
          pattern_name?: string
          recommended_purpose?: string
          success_rate?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purpose_context_patterns_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      purpose_selection_feedback: {
        Row: {
          context_snapshot: Json
          created_at: string | null
          id: string
          override_reason: string | null
          selected_purpose: string
          suggested_confidence: number | null
          suggested_purpose: string
          user_id: string
          was_override: boolean
        }
        Insert: {
          context_snapshot?: Json
          created_at?: string | null
          id?: string
          override_reason?: string | null
          selected_purpose: string
          suggested_confidence?: number | null
          suggested_purpose: string
          user_id: string
          was_override?: boolean
        }
        Update: {
          context_snapshot?: Json
          created_at?: string | null
          id?: string
          override_reason?: string | null
          selected_purpose?: string
          suggested_confidence?: number | null
          suggested_purpose?: string
          user_id?: string
          was_override?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "purpose_selection_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      realtime_events: {
        Row: {
          actions_taken: Json | null
          context: Json | null
          event_data: Json
          event_type: string
          expires_at: string | null
          id: string
          matched_triggers: string[] | null
          occurred_at: string
          platform: string
          processed_at: string | null
          processing_duration_ms: number | null
          user_id: string
        }
        Insert: {
          actions_taken?: Json | null
          context?: Json | null
          event_data?: Json
          event_type: string
          expires_at?: string | null
          id?: string
          matched_triggers?: string[] | null
          occurred_at?: string
          platform: string
          processed_at?: string | null
          processing_duration_ms?: number | null
          user_id: string
        }
        Update: {
          actions_taken?: Json | null
          context?: Json | null
          event_data?: Json
          event_type?: string
          expires_at?: string | null
          id?: string
          matched_triggers?: string[] | null
          occurred_at?: string
          platform?: string
          processed_at?: string | null
          processing_duration_ms?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "realtime_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendation_feedback: {
        Row: {
          comment: string | null
          context_snapshot: Json | null
          created_at: string | null
          id: string
          processed_at: string | null
          recommendation_id: string
          recommendation_type: string
          related_pattern_ids: string[] | null
          star_rating: number | null
          thumbs_vote: string | null
          user_id: string
        }
        Insert: {
          comment?: string | null
          context_snapshot?: Json | null
          created_at?: string | null
          id?: string
          processed_at?: string | null
          recommendation_id: string
          recommendation_type: string
          related_pattern_ids?: string[] | null
          star_rating?: number | null
          thumbs_vote?: string | null
          user_id: string
        }
        Update: {
          comment?: string | null
          context_snapshot?: Json | null
          created_at?: string | null
          id?: string
          processed_at?: string | null
          recommendation_id?: string
          recommendation_type?: string
          related_pattern_ids?: string[] | null
          star_rating?: number | null
          thumbs_vote?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      research_paper_embeddings: {
        Row: {
          abstract: string | null
          authors: string | null
          content: string
          content_hash: string
          created_at: string | null
          embedding: string | null
          id: string
          journal: string | null
          metadata: Json | null
          paper_id: string
          section_type: string | null
          title: string
          updated_at: string | null
          year: number | null
        }
        Insert: {
          abstract?: string | null
          authors?: string | null
          content: string
          content_hash: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          journal?: string | null
          metadata?: Json | null
          paper_id: string
          section_type?: string | null
          title: string
          updated_at?: string | null
          year?: number | null
        }
        Update: {
          abstract?: string | null
          authors?: string | null
          content?: string
          content_hash?: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          journal?: string | null
          metadata?: Json | null
          paper_id?: string
          section_type?: string | null
          title?: string
          updated_at?: string | null
          year?: number | null
        }
        Relationships: []
      }
      reservations: {
        Row: {
          checked_in_at: string | null
          created_at: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          date: string
          id: string
          ml_confidence: number | null
          ml_model_version: string | null
          ml_prediction_timestamp: string | null
          ml_risk_level: string | null
          ml_risk_score: number | null
          notes: string | null
          party_size: number
          reservation_id: string
          restaurant_id: string
          source: string | null
          special_requests: string | null
          status: string
          table_ids: string[] | null
          time: string
          updated_at: string | null
        }
        Insert: {
          checked_in_at?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          date: string
          id?: string
          ml_confidence?: number | null
          ml_model_version?: string | null
          ml_prediction_timestamp?: string | null
          ml_risk_level?: string | null
          ml_risk_score?: number | null
          notes?: string | null
          party_size?: number
          reservation_id: string
          restaurant_id: string
          source?: string | null
          special_requests?: string | null
          status?: string
          table_ids?: string[] | null
          time: string
          updated_at?: string | null
        }
        Update: {
          checked_in_at?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          date?: string
          id?: string
          ml_confidence?: number | null
          ml_model_version?: string | null
          ml_prediction_timestamp?: string | null
          ml_risk_level?: string | null
          ml_risk_score?: number | null
          notes?: string | null
          party_size?: number
          reservation_id?: string
          restaurant_id?: string
          source?: string | null
          special_requests?: string | null
          status?: string
          table_ids?: string[] | null
          time?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      rituals: {
        Row: {
          calendar_event_id: string | null
          checklist_completed: boolean | null
          checklist_items: Json | null
          completed_at: string | null
          created_at: string | null
          duration_actual_minutes: number | null
          duration_planned_minutes: number | null
          event_starts_at: string | null
          id: string
          music_session_id: string | null
          patterns_learned: Json | null
          post_event_notes: string | null
          post_event_rating: number | null
          pre_event_confidence: number | null
          ritual_type: string | null
          started_at: string | null
          status: string | null
          updated_at: string | null
          user_id: string
          what_to_improve: string | null
          what_went_well: string | null
        }
        Insert: {
          calendar_event_id?: string | null
          checklist_completed?: boolean | null
          checklist_items?: Json | null
          completed_at?: string | null
          created_at?: string | null
          duration_actual_minutes?: number | null
          duration_planned_minutes?: number | null
          event_starts_at?: string | null
          id?: string
          music_session_id?: string | null
          patterns_learned?: Json | null
          post_event_notes?: string | null
          post_event_rating?: number | null
          pre_event_confidence?: number | null
          ritual_type?: string | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
          what_to_improve?: string | null
          what_went_well?: string | null
        }
        Update: {
          calendar_event_id?: string | null
          checklist_completed?: boolean | null
          checklist_items?: Json | null
          completed_at?: string | null
          created_at?: string | null
          duration_actual_minutes?: number | null
          duration_planned_minutes?: number | null
          event_starts_at?: string | null
          id?: string
          music_session_id?: string | null
          patterns_learned?: Json | null
          post_event_notes?: string | null
          post_event_rating?: number | null
          pre_event_confidence?: number | null
          ritual_type?: string | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
          what_to_improve?: string | null
          what_went_well?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rituals_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rituals_music_session_id_fkey"
            columns: ["music_session_id"]
            isOneToOne: false
            referencedRelation: "music_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rituals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      service_records: {
        Row: {
          actual_departure: string | null
          created_at: string | null
          customer_name: string
          customer_phone: string | null
          estimated_departure: string | null
          id: string
          party_size: number
          reservation_id: string | null
          restaurant_id: string
          seated_at: string | null
          service_id: string
          special_requests: string | null
          status: string
          table_ids: string[] | null
          updated_at: string | null
        }
        Insert: {
          actual_departure?: string | null
          created_at?: string | null
          customer_name: string
          customer_phone?: string | null
          estimated_departure?: string | null
          id?: string
          party_size?: number
          reservation_id?: string | null
          restaurant_id: string
          seated_at?: string | null
          service_id: string
          special_requests?: string | null
          status?: string
          table_ids?: string[] | null
          updated_at?: string | null
        }
        Update: {
          actual_departure?: string | null
          created_at?: string | null
          customer_name?: string
          customer_phone?: string | null
          estimated_departure?: string | null
          id?: string
          party_size?: number
          reservation_id?: string | null
          restaurant_id?: string
          seated_at?: string | null
          service_id?: string
          special_requests?: string | null
          status?: string
          table_ids?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      sleep_compute_logs: {
        Row: {
          completed_at: string | null
          consolidated_platforms: string[] | null
          data_points_processed: number | null
          error_message: string | null
          id: string
          job_type: string
          started_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          consolidated_platforms?: string[] | null
          data_points_processed?: number | null
          error_message?: string | null
          id?: string
          job_type: string
          started_at?: string | null
          status: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          consolidated_platforms?: string[] | null
          data_points_processed?: number | null
          error_message?: string | null
          id?: string
          job_type?: string
          started_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      soul_data: {
        Row: {
          created_at: string | null
          data_type: string
          extracted_at: string | null
          extracted_insights: Json | null
          extracted_patterns: Json | null
          extraction_timestamp: string | null
          id: string
          platform: string
          privacy_level: number | null
          raw_data: Json | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          data_type: string
          extracted_at?: string | null
          extracted_insights?: Json | null
          extracted_patterns?: Json | null
          extraction_timestamp?: string | null
          id?: string
          platform: string
          privacy_level?: number | null
          raw_data?: Json | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          data_type?: string
          extracted_at?: string | null
          extracted_insights?: Json | null
          extracted_patterns?: Json | null
          extraction_timestamp?: string | null
          id?: string
          platform?: string
          privacy_level?: number | null
          raw_data?: Json | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      soul_data_sources: {
        Row: {
          access_token: string | null
          created_at: string | null
          id: string
          last_sync: string | null
          metadata: Json | null
          provider: string
          refresh_token: string | null
          scopes: string[] | null
          status: string | null
          token_expires_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token?: string | null
          created_at?: string | null
          id?: string
          last_sync?: string | null
          metadata?: Json | null
          provider: string
          refresh_token?: string | null
          scopes?: string[] | null
          status?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string | null
          created_at?: string | null
          id?: string
          last_sync?: string | null
          metadata?: Json | null
          provider?: string
          refresh_token?: string | null
          scopes?: string[] | null
          status?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      soul_insights: {
        Row: {
          analysis: Json
          analyzed_at: string | null
          confidence_score: number | null
          created_at: string | null
          description: string
          evidence: Json | null
          id: string
          insight_type: string
          platforms: string[]
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          analysis: Json
          analyzed_at?: string | null
          confidence_score?: number | null
          created_at?: string | null
          description: string
          evidence?: Json | null
          id?: string
          insight_type: string
          platforms: string[]
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          analysis?: Json
          analyzed_at?: string | null
          confidence_score?: number | null
          created_at?: string | null
          description?: string
          evidence?: Json | null
          id?: string
          insight_type?: string
          platforms?: string[]
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      soul_observer_events: {
        Row: {
          created_at: string | null
          domain: string
          duration_ms: number | null
          event_data: Json
          event_type: string
          id: string
          page_title: string | null
          session_id: string
          timestamp: string | null
          url: string
          user_agent: string | null
          user_id: string
          viewport_size: Json | null
        }
        Insert: {
          created_at?: string | null
          domain: string
          duration_ms?: number | null
          event_data: Json
          event_type: string
          id?: string
          page_title?: string | null
          session_id: string
          timestamp?: string | null
          url: string
          user_agent?: string | null
          user_id: string
          viewport_size?: Json | null
        }
        Update: {
          created_at?: string | null
          domain?: string
          duration_ms?: number | null
          event_data?: Json
          event_type?: string
          id?: string
          page_title?: string | null
          session_id?: string
          timestamp?: string | null
          url?: string
          user_agent?: string | null
          user_id?: string
          viewport_size?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "soul_observer_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      soul_observer_insights: {
        Row: {
          applicable_period: unknown
          confidence: number
          created_at: string | null
          evidence_count: number
          generated_at: string | null
          id: string
          insight_category: string
          insight_data: Json | null
          insight_text: string
          session_id: string | null
          user_id: string
        }
        Insert: {
          applicable_period?: unknown
          confidence: number
          created_at?: string | null
          evidence_count: number
          generated_at?: string | null
          id?: string
          insight_category: string
          insight_data?: Json | null
          insight_text: string
          session_id?: string | null
          user_id: string
        }
        Update: {
          applicable_period?: unknown
          confidence?: number
          created_at?: string | null
          evidence_count?: number
          generated_at?: string | null
          id?: string
          insight_category?: string
          insight_data?: Json | null
          insight_text?: string
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "soul_observer_insights_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "soul_observer_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      soul_observer_sessions: {
        Row: {
          ai_analyzed: boolean | null
          ai_insights: Json | null
          created_at: string | null
          decision_making_style: string | null
          domains_visited: string[] | null
          duration_seconds: number | null
          embeddings_generated: boolean | null
          ended_at: string | null
          event_counts: Json | null
          focus_avg_duration: number | null
          id: string
          mouse_avg_speed: number | null
          mouse_movement_pattern: string | null
          multitasking_score: number | null
          pages_visited: number | null
          peak_productivity_time: string | null
          personality_indicators: Json | null
          primary_activity: string | null
          processed: boolean | null
          scroll_avg_speed: number | null
          scroll_pattern: string | null
          session_id: string
          started_at: string
          total_events: number | null
          typing_correction_rate: number | null
          typing_speed_wpm: number | null
          updated_at: string | null
          user_id: string
          work_style_analysis: string | null
        }
        Insert: {
          ai_analyzed?: boolean | null
          ai_insights?: Json | null
          created_at?: string | null
          decision_making_style?: string | null
          domains_visited?: string[] | null
          duration_seconds?: number | null
          embeddings_generated?: boolean | null
          ended_at?: string | null
          event_counts?: Json | null
          focus_avg_duration?: number | null
          id?: string
          mouse_avg_speed?: number | null
          mouse_movement_pattern?: string | null
          multitasking_score?: number | null
          pages_visited?: number | null
          peak_productivity_time?: string | null
          personality_indicators?: Json | null
          primary_activity?: string | null
          processed?: boolean | null
          scroll_avg_speed?: number | null
          scroll_pattern?: string | null
          session_id: string
          started_at: string
          total_events?: number | null
          typing_correction_rate?: number | null
          typing_speed_wpm?: number | null
          updated_at?: string | null
          user_id: string
          work_style_analysis?: string | null
        }
        Update: {
          ai_analyzed?: boolean | null
          ai_insights?: Json | null
          created_at?: string | null
          decision_making_style?: string | null
          domains_visited?: string[] | null
          duration_seconds?: number | null
          embeddings_generated?: boolean | null
          ended_at?: string | null
          event_counts?: Json | null
          focus_avg_duration?: number | null
          id?: string
          mouse_avg_speed?: number | null
          mouse_movement_pattern?: string | null
          multitasking_score?: number | null
          pages_visited?: number | null
          peak_productivity_time?: string | null
          personality_indicators?: Json | null
          primary_activity?: string | null
          processed?: boolean | null
          scroll_avg_speed?: number | null
          scroll_pattern?: string | null
          session_id?: string
          started_at?: string
          total_events?: number | null
          typing_correction_rate?: number | null
          typing_speed_wpm?: number | null
          updated_at?: string | null
          user_id?: string
          work_style_analysis?: string | null
        }
        Relationships: []
      }
      soul_signature_profile: {
        Row: {
          authenticity_score: number | null
          browsing_signature: Json | null
          coding_signature: Json | null
          collaboration_signature: Json | null
          communication_signature: Json | null
          confidence_score: number | null
          content_creation_signature: Json | null
          created_at: string | null
          curiosity_profile: Json | null
          data_completeness: number | null
          gaming_signature: Json | null
          health_signature: Json | null
          id: string
          journal_signature: Json | null
          last_updated: string | null
          music_signature: Json | null
          origin_context: Json | null
          professional_universe: Json | null
          uniqueness_markers: string[] | null
          user_id: string
          video_signature: Json | null
        }
        Insert: {
          authenticity_score?: number | null
          browsing_signature?: Json | null
          coding_signature?: Json | null
          collaboration_signature?: Json | null
          communication_signature?: Json | null
          confidence_score?: number | null
          content_creation_signature?: Json | null
          created_at?: string | null
          curiosity_profile?: Json | null
          data_completeness?: number | null
          gaming_signature?: Json | null
          health_signature?: Json | null
          id?: string
          journal_signature?: Json | null
          last_updated?: string | null
          music_signature?: Json | null
          origin_context?: Json | null
          professional_universe?: Json | null
          uniqueness_markers?: string[] | null
          user_id: string
          video_signature?: Json | null
        }
        Update: {
          authenticity_score?: number | null
          browsing_signature?: Json | null
          coding_signature?: Json | null
          collaboration_signature?: Json | null
          communication_signature?: Json | null
          confidence_score?: number | null
          content_creation_signature?: Json | null
          created_at?: string | null
          curiosity_profile?: Json | null
          data_completeness?: number | null
          gaming_signature?: Json | null
          health_signature?: Json | null
          id?: string
          journal_signature?: Json | null
          last_updated?: string | null
          music_signature?: Json | null
          origin_context?: Json | null
          professional_universe?: Json | null
          uniqueness_markers?: string[] | null
          user_id?: string
          video_signature?: Json | null
        }
        Relationships: []
      }
      soul_signatures: {
        Row: {
          archetype_name: string
          archetype_subtitle: string | null
          color_scheme: Json | null
          created_at: string | null
          defining_traits: Json | null
          icon_type: string | null
          id: string
          is_public: boolean | null
          narrative: string
          personality_score_id: string | null
          reveal_level: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          archetype_name: string
          archetype_subtitle?: string | null
          color_scheme?: Json | null
          created_at?: string | null
          defining_traits?: Json | null
          icon_type?: string | null
          id?: string
          is_public?: boolean | null
          narrative: string
          personality_score_id?: string | null
          reveal_level?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          archetype_name?: string
          archetype_subtitle?: string | null
          color_scheme?: Json | null
          created_at?: string | null
          defining_traits?: Json | null
          icon_type?: string | null
          id?: string
          is_public?: boolean | null
          narrative?: string
          personality_score_id?: string | null
          reveal_level?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "soul_signatures_personality_score_id_fkey"
            columns: ["personality_score_id"]
            isOneToOne: false
            referencedRelation: "personality_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "soul_signatures_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      spotify_listening_data: {
        Row: {
          album_name: string | null
          artist_name: string
          audio_features: Json | null
          connector_id: string | null
          device_type: string | null
          duration_ms: number | null
          genres: string[] | null
          id: string
          ingested_at: string | null
          is_repeat: boolean | null
          is_shuffle: boolean | null
          listening_context: string | null
          played_at: string
          track_id: string
          track_name: string
          user_id: string
        }
        Insert: {
          album_name?: string | null
          artist_name: string
          audio_features?: Json | null
          connector_id?: string | null
          device_type?: string | null
          duration_ms?: number | null
          genres?: string[] | null
          id?: string
          ingested_at?: string | null
          is_repeat?: boolean | null
          is_shuffle?: boolean | null
          listening_context?: string | null
          played_at: string
          track_id: string
          track_name: string
          user_id: string
        }
        Update: {
          album_name?: string | null
          artist_name?: string
          audio_features?: Json | null
          connector_id?: string | null
          device_type?: string | null
          duration_ms?: number | null
          genres?: string[] | null
          id?: string
          ingested_at?: string | null
          is_repeat?: boolean | null
          is_shuffle?: boolean | null
          listening_context?: string | null
          played_at?: string
          track_id?: string
          track_name?: string
          user_id?: string
        }
        Relationships: []
      }
      spotify_playlists: {
        Row: {
          connector_id: string | null
          created_at: string | null
          followers_count: number | null
          id: string
          ingested_at: string | null
          is_collaborative: boolean | null
          is_public: boolean | null
          owner: string | null
          playlist_description: string | null
          playlist_id: string
          playlist_name: string
          total_tracks: number | null
          tracks: Json | null
          user_id: string
        }
        Insert: {
          connector_id?: string | null
          created_at?: string | null
          followers_count?: number | null
          id?: string
          ingested_at?: string | null
          is_collaborative?: boolean | null
          is_public?: boolean | null
          owner?: string | null
          playlist_description?: string | null
          playlist_id: string
          playlist_name: string
          total_tracks?: number | null
          tracks?: Json | null
          user_id: string
        }
        Update: {
          connector_id?: string | null
          created_at?: string | null
          followers_count?: number | null
          id?: string
          ingested_at?: string | null
          is_collaborative?: boolean | null
          is_public?: boolean | null
          owner?: string | null
          playlist_description?: string | null
          playlist_id?: string
          playlist_name?: string
          total_tracks?: number | null
          tracks?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          canceled_at: string | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          customer_email: string
          customer_id: string
          id: string
          plan_name: string
          price_id: string
          restaurant_id: string
          status: Database["public"]["Enums"]["subscription_status"] | null
          subscription_id: string
          trial_end: string | null
          updated_at: string | null
        }
        Insert: {
          canceled_at?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          customer_email: string
          customer_id: string
          id?: string
          plan_name: string
          price_id: string
          restaurant_id: string
          status?: Database["public"]["Enums"]["subscription_status"] | null
          subscription_id: string
          trial_end?: string | null
          updated_at?: string | null
        }
        Update: {
          canceled_at?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          customer_email?: string
          customer_id?: string
          id?: string
          plan_name?: string
          price_id?: string
          restaurant_id?: string
          status?: Database["public"]["Enums"]["subscription_status"] | null
          subscription_id?: string
          trial_end?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      sync_queue: {
        Row: {
          attempts: number | null
          completed_at: string | null
          connector_id: string | null
          created_at: string | null
          error_message: string | null
          id: string
          max_attempts: number | null
          payload: Json | null
          priority: number | null
          queue_type: string
          retry_after: string | null
          scheduled_for: string | null
          started_at: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          attempts?: number | null
          completed_at?: string | null
          connector_id?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          max_attempts?: number | null
          payload?: Json | null
          priority?: number | null
          queue_type: string
          retry_after?: string | null
          scheduled_for?: string | null
          started_at?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          attempts?: number | null
          completed_at?: string | null
          connector_id?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          max_attempts?: number | null
          payload?: Json | null
          priority?: number | null
          queue_type?: string
          retry_after?: string | null
          scheduled_for?: string | null
          started_at?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tables: {
        Row: {
          adjacent_tables: string[] | null
          capacity: number
          combination_group: string | null
          created_at: string | null
          current_service_id: string | null
          height: number | null
          id: string
          is_active: boolean | null
          is_fixed: boolean | null
          is_fixed_seating: boolean | null
          is_joinable: boolean | null
          joinable_with: string[] | null
          location: string | null
          max_capacity: number | null
          min_capacity: number | null
          position_x: number | null
          position_y: number | null
          restaurant_id: string
          rotation: number | null
          shape: string | null
          status: Database["public"]["Enums"]["table_status"] | null
          table_number: number
          updated_at: string | null
          width: number | null
        }
        Insert: {
          adjacent_tables?: string[] | null
          capacity: number
          combination_group?: string | null
          created_at?: string | null
          current_service_id?: string | null
          height?: number | null
          id?: string
          is_active?: boolean | null
          is_fixed?: boolean | null
          is_fixed_seating?: boolean | null
          is_joinable?: boolean | null
          joinable_with?: string[] | null
          location?: string | null
          max_capacity?: number | null
          min_capacity?: number | null
          position_x?: number | null
          position_y?: number | null
          restaurant_id: string
          rotation?: number | null
          shape?: string | null
          status?: Database["public"]["Enums"]["table_status"] | null
          table_number: number
          updated_at?: string | null
          width?: number | null
        }
        Update: {
          adjacent_tables?: string[] | null
          capacity?: number
          combination_group?: string | null
          created_at?: string | null
          current_service_id?: string | null
          height?: number | null
          id?: string
          is_active?: boolean | null
          is_fixed?: boolean | null
          is_fixed_seating?: boolean | null
          is_joinable?: boolean | null
          joinable_with?: string[] | null
          location?: string | null
          max_capacity?: number | null
          min_capacity?: number | null
          position_x?: number | null
          position_y?: number | null
          restaurant_id?: string
          rotation?: number | null
          shape?: string | null
          status?: Database["public"]["Enums"]["table_status"] | null
          table_number?: number
          updated_at?: string | null
          width?: number | null
        }
        Relationships: []
      }
      trigger_executions: {
        Row: {
          actions_executed: Json | null
          conditions_evaluated: Json | null
          duration_ms: number | null
          error_message: string | null
          event_id: string | null
          executed_at: string | null
          execution_status: string | null
          expires_at: string | null
          id: string
          trigger_id: string
          user_id: string
        }
        Insert: {
          actions_executed?: Json | null
          conditions_evaluated?: Json | null
          duration_ms?: number | null
          error_message?: string | null
          event_id?: string | null
          executed_at?: string | null
          execution_status?: string | null
          expires_at?: string | null
          id?: string
          trigger_id: string
          user_id: string
        }
        Update: {
          actions_executed?: Json | null
          conditions_evaluated?: Json | null
          duration_ms?: number | null
          error_message?: string | null
          event_id?: string | null
          executed_at?: string | null
          execution_status?: string | null
          expires_at?: string | null
          id?: string
          trigger_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trigger_executions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "realtime_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trigger_executions_trigger_id_fkey"
            columns: ["trigger_id"]
            isOneToOne: false
            referencedRelation: "proactive_triggers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trigger_executions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      twin_chat_usage: {
        Row: {
          conversation_id: string | null
          created_at: string | null
          estimated_cost: number | null
          id: string
          tokens_used: number
          user_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string | null
          estimated_cost?: number | null
          id?: string
          tokens_used?: number
          user_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string | null
          estimated_cost?: number | null
          id?: string
          tokens_used?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "twin_chat_usage_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "twin_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "twin_chat_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      twin_conversations: {
        Row: {
          context: string | null
          created_at: string | null
          id: string
          metadata: Json | null
          mode: string
          title: string
          twin_type: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          context?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          mode: string
          title?: string
          twin_type?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          context?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          mode?: string
          title?: string
          twin_type?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "twin_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      twin_evolution_log: {
        Row: {
          applied_at: string | null
          change_summary: string | null
          change_type: string
          confidence_impact: number | null
          created_at: string | null
          id: string
          new_value: Json | null
          old_value: Json | null
          recorded_at: string | null
          rolled_back_at: string | null
          source_data_ids: string[] | null
          trigger_source: string
          twin_id: string | null
          user_id: string
        }
        Insert: {
          applied_at?: string | null
          change_summary?: string | null
          change_type: string
          confidence_impact?: number | null
          created_at?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          recorded_at?: string | null
          rolled_back_at?: string | null
          source_data_ids?: string[] | null
          trigger_source: string
          twin_id?: string | null
          user_id: string
        }
        Update: {
          applied_at?: string | null
          change_summary?: string | null
          change_type?: string
          confidence_impact?: number | null
          created_at?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          recorded_at?: string | null
          rolled_back_at?: string | null
          source_data_ids?: string[] | null
          trigger_source?: string
          twin_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "twin_evolution_log_twin_id_fkey"
            columns: ["twin_id"]
            isOneToOne: false
            referencedRelation: "digital_twins"
            referencedColumns: ["id"]
          },
        ]
      }
      twin_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          metadata: Json | null
          rating: number | null
          role: string
          tokens_used: number | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          rating?: number | null
          role: string
          tokens_used?: number | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          rating?: number | null
          role?: string
          tokens_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "twin_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "twin_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      twin_personality_profiles: {
        Row: {
          communication_style: Json | null
          created_at: string | null
          expertise: Json | null
          id: string
          interests: Json | null
          last_analyzed_at: string | null
          patterns: Json | null
          platforms_analyzed: string[] | null
          profile_data: Json
          updated_at: string | null
          user_id: string
        }
        Insert: {
          communication_style?: Json | null
          created_at?: string | null
          expertise?: Json | null
          id?: string
          interests?: Json | null
          last_analyzed_at?: string | null
          patterns?: Json | null
          platforms_analyzed?: string[] | null
          profile_data: Json
          updated_at?: string | null
          user_id: string
        }
        Update: {
          communication_style?: Json | null
          created_at?: string | null
          expertise?: Json | null
          id?: string
          interests?: Json | null
          last_analyzed_at?: string | null
          patterns?: Json | null
          platforms_analyzed?: string[] | null
          profile_data?: Json
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "twin_personality_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      twin_summaries: {
        Row: {
          core_traits: string | null
          current_focus: string | null
          generated_at: string | null
          id: string
          recent_feelings: string | null
          summary: string
          user_id: string
        }
        Insert: {
          core_traits?: string | null
          current_focus?: string | null
          generated_at?: string | null
          id?: string
          recent_feelings?: string | null
          summary: string
          user_id: string
        }
        Update: {
          core_traits?: string | null
          current_focus?: string | null
          generated_at?: string | null
          id?: string
          recent_feelings?: string | null
          summary?: string
          user_id?: string
        }
        Relationships: []
      }
      twitter_interests: {
        Row: {
          confidence_score: number
          connector_id: string | null
          id: string
          identified_at: string | null
          interest_category: string
          supporting_accounts: string[] | null
          supporting_hashtags: string[] | null
          user_id: string
        }
        Insert: {
          confidence_score: number
          connector_id?: string | null
          id?: string
          identified_at?: string | null
          interest_category: string
          supporting_accounts?: string[] | null
          supporting_hashtags?: string[] | null
          user_id: string
        }
        Update: {
          confidence_score?: number
          connector_id?: string | null
          id?: string
          identified_at?: string | null
          interest_category?: string
          supporting_accounts?: string[] | null
          supporting_hashtags?: string[] | null
          user_id?: string
        }
        Relationships: []
      }
      twitter_tweets: {
        Row: {
          connector_id: string | null
          hashtags: string[] | null
          id: string
          ingested_at: string | null
          is_reply: boolean | null
          is_retweet: boolean | null
          like_count: number | null
          mentioned_users: string[] | null
          reply_count: number | null
          retweet_count: number | null
          sentiment: string | null
          tweet_id: string
          tweet_text: string
          tweeted_at: string
          user_id: string
        }
        Insert: {
          connector_id?: string | null
          hashtags?: string[] | null
          id?: string
          ingested_at?: string | null
          is_reply?: boolean | null
          is_retweet?: boolean | null
          like_count?: number | null
          mentioned_users?: string[] | null
          reply_count?: number | null
          retweet_count?: number | null
          sentiment?: string | null
          tweet_id: string
          tweet_text: string
          tweeted_at: string
          user_id: string
        }
        Update: {
          connector_id?: string | null
          hashtags?: string[] | null
          id?: string
          ingested_at?: string | null
          is_reply?: boolean | null
          is_retweet?: boolean | null
          like_count?: number | null
          mentioned_users?: string[] | null
          reply_count?: number | null
          retweet_count?: number | null
          sentiment?: string | null
          tweet_id?: string
          tweet_text?: string
          tweeted_at?: string
          user_id?: string
        }
        Relationships: []
      }
      unique_patterns: {
        Row: {
          behavioral_feature_ids: string[] | null
          confidence_score: number | null
          description: string
          detected_at: string | null
          evidence: Json | null
          id: string
          is_defining: boolean | null
          pattern_name: string
          pattern_type: string
          platforms: string[] | null
          population_mean: number | null
          population_percentile: number | null
          population_stddev: number | null
          uniqueness_score: number | null
          updated_at: string | null
          user_id: string
          user_value: number
        }
        Insert: {
          behavioral_feature_ids?: string[] | null
          confidence_score?: number | null
          description: string
          detected_at?: string | null
          evidence?: Json | null
          id?: string
          is_defining?: boolean | null
          pattern_name: string
          pattern_type: string
          platforms?: string[] | null
          population_mean?: number | null
          population_percentile?: number | null
          population_stddev?: number | null
          uniqueness_score?: number | null
          updated_at?: string | null
          user_id: string
          user_value: number
        }
        Update: {
          behavioral_feature_ids?: string[] | null
          confidence_score?: number | null
          description?: string
          detected_at?: string | null
          evidence?: Json | null
          id?: string
          is_defining?: boolean | null
          pattern_name?: string
          pattern_type?: string
          platforms?: string[] | null
          population_mean?: number | null
          population_percentile?: number | null
          population_stddev?: number | null
          uniqueness_score?: number | null
          updated_at?: string | null
          user_id?: string
          user_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "unique_patterns_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_tracking: {
        Row: {
          count: number
          created_at: string | null
          id: string
          metric_type: string
          period: string
          reported_to_stripe: string | null
          restaurant_id: string
        }
        Insert: {
          count?: number
          created_at?: string | null
          id?: string
          metric_type: string
          period: string
          reported_to_stripe?: string | null
          restaurant_id: string
        }
        Update: {
          count?: number
          created_at?: string | null
          id?: string
          metric_type?: string
          period?: string
          reported_to_stripe?: string | null
          restaurant_id?: string
        }
        Relationships: []
      }
      user_baselines: {
        Row: {
          avg_hrv: number | null
          avg_recovery: number | null
          avg_rhr: number | null
          avg_sleep_hours: number | null
          calculated_at: string | null
          created_at: string
          data_points_count: number | null
          id: string
          typical_sleep_hour: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avg_hrv?: number | null
          avg_recovery?: number | null
          avg_rhr?: number | null
          avg_sleep_hours?: number | null
          calculated_at?: string | null
          created_at?: string
          data_points_count?: number | null
          id?: string
          typical_sleep_hour?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avg_hrv?: number | null
          avg_recovery?: number | null
          avg_rhr?: number | null
          avg_sleep_hours?: number | null
          calculated_at?: string | null
          created_at?: string
          data_points_count?: number | null
          id?: string
          typical_sleep_hour?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_behavioral_embeddings: {
        Row: {
          contexts: string[] | null
          created_at: string | null
          domains: string[] | null
          dominant_patterns: string[] | null
          embedding: string | null
          fingerprint_text: string
          id: string
          personality_snapshot: Json | null
          primary_activity: string | null
          session_date: string
          session_id: string | null
          user_id: string
        }
        Insert: {
          contexts?: string[] | null
          created_at?: string | null
          domains?: string[] | null
          dominant_patterns?: string[] | null
          embedding?: string | null
          fingerprint_text: string
          id?: string
          personality_snapshot?: Json | null
          primary_activity?: string | null
          session_date: string
          session_id?: string | null
          user_id: string
        }
        Update: {
          contexts?: string[] | null
          created_at?: string | null
          domains?: string[] | null
          dominant_patterns?: string[] | null
          embedding?: string | null
          fingerprint_text?: string
          id?: string
          personality_snapshot?: Json | null
          primary_activity?: string | null
          session_date?: string
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_behavioral_embeddings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "soul_observer_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_consents: {
        Row: {
          consent_type: string
          consent_version: string
          created_at: string | null
          granted: boolean
          granted_at: string | null
          id: string
          ip_address: string | null
          platform: string | null
          revoked_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          consent_type: string
          consent_version?: string
          created_at?: string | null
          granted?: boolean
          granted_at?: string | null
          id?: string
          ip_address?: string | null
          platform?: string | null
          revoked_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          consent_type?: string
          consent_version?: string
          created_at?: string | null
          granted?: boolean
          granted_at?: string | null
          id?: string
          ip_address?: string | null
          platform?: string | null
          revoked_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_consents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_data_raw: {
        Row: {
          connector_id: string | null
          content: Json
          data_type: string
          id: string
          ingested_at: string | null
          metadata: Json | null
          processed: boolean | null
          processed_at: string | null
          processing_error: string | null
          quality_score: number | null
          retention_until: string | null
          sensitivity_level: string | null
          source_timestamp: string
          user_id: string
        }
        Insert: {
          connector_id?: string | null
          content: Json
          data_type: string
          id?: string
          ingested_at?: string | null
          metadata?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          processing_error?: string | null
          quality_score?: number | null
          retention_until?: string | null
          sensitivity_level?: string | null
          source_timestamp: string
          user_id: string
        }
        Update: {
          connector_id?: string | null
          content?: Json
          data_type?: string
          id?: string
          ingested_at?: string | null
          metadata?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          processing_error?: string | null
          quality_score?: number | null
          retention_until?: string | null
          sensitivity_level?: string | null
          source_timestamp?: string
          user_id?: string
        }
        Relationships: []
      }
      user_embeddings: {
        Row: {
          chunk_index: number | null
          chunk_size: number | null
          chunk_text: string
          content_type: string
          created_at: string | null
          embedding: string | null
          id: string
          platform: string
          tags: string[] | null
          text_content_id: string | null
          timestamp: string | null
          user_id: string
        }
        Insert: {
          chunk_index?: number | null
          chunk_size?: number | null
          chunk_text: string
          content_type: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          platform: string
          tags?: string[] | null
          text_content_id?: string | null
          timestamp?: string | null
          user_id: string
        }
        Update: {
          chunk_index?: number | null
          chunk_size?: number | null
          chunk_text?: string
          content_type?: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          platform?: string
          tags?: string[] | null
          text_content_id?: string | null
          timestamp?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_embeddings_text_content_id_fkey"
            columns: ["text_content_id"]
            isOneToOne: false
            referencedRelation: "user_text_content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_embeddings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_memories: {
        Row: {
          content: string
          created_at: string | null
          embedding: string | null
          id: string
          importance_score: number | null
          last_accessed_at: string | null
          memory_type: string
          metadata: Json | null
          response: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          importance_score?: number | null
          last_accessed_at?: string | null
          memory_type: string
          metadata?: Json | null
          response?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          importance_score?: number | null
          last_accessed_at?: string | null
          memory_type?: string
          metadata?: Json | null
          response?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_ngrams: {
        Row: {
          contexts: Json | null
          created_at: string | null
          frequency: number
          id: string
          ngram_type: string
          ngram_value: string
          platform: string | null
          tf_idf: number | null
          user_id: string
        }
        Insert: {
          contexts?: Json | null
          created_at?: string | null
          frequency: number
          id?: string
          ngram_type: string
          ngram_value: string
          platform?: string | null
          tf_idf?: number | null
          user_id: string
        }
        Update: {
          contexts?: Json | null
          created_at?: string | null
          frequency?: number
          id?: string
          ngram_type?: string
          ngram_value?: string
          platform?: string | null
          tf_idf?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_ngrams_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notifications: {
        Row: {
          action_url: string | null
          created_at: string | null
          dismissed: boolean | null
          id: string
          message: string
          metadata: Json | null
          platform: string | null
          priority: string | null
          read: boolean | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          created_at?: string | null
          dismissed?: boolean | null
          id?: string
          message: string
          metadata?: Json | null
          platform?: string | null
          priority?: string | null
          read?: boolean | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          created_at?: string | null
          dismissed?: boolean | null
          id?: string
          message?: string
          metadata?: Json | null
          platform?: string | null
          priority?: string | null
          read?: boolean | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      user_platform_data: {
        Row: {
          connector_id: string | null
          created_at: string | null
          data_type: string
          extracted_at: string | null
          id: string
          metadata: Json | null
          platform: string
          processed: boolean | null
          raw_data: Json
          source_url: string | null
          user_id: string
        }
        Insert: {
          connector_id?: string | null
          created_at?: string | null
          data_type: string
          extracted_at?: string | null
          id?: string
          metadata?: Json | null
          platform: string
          processed?: boolean | null
          raw_data: Json
          source_url?: string | null
          user_id: string
        }
        Update: {
          connector_id?: string | null
          created_at?: string | null
          data_type?: string
          extracted_at?: string | null
          id?: string
          metadata?: Json | null
          platform?: string
          processed?: boolean | null
          raw_data?: Json
          source_url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_platform_data_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_purpose_weights: {
        Row: {
          confidence_level: number | null
          context_weights: Json
          created_at: string | null
          id: string
          last_learned_at: string | null
          override_rate: number | null
          total_feedback_count: number | null
          updated_at: string | null
          user_adjustments: Json | null
          user_id: string
        }
        Insert: {
          confidence_level?: number | null
          context_weights?: Json
          created_at?: string | null
          id?: string
          last_learned_at?: string | null
          override_rate?: number | null
          total_feedback_count?: number | null
          updated_at?: string | null
          user_adjustments?: Json | null
          user_id: string
        }
        Update: {
          confidence_level?: number | null
          context_weights?: Json
          created_at?: string | null
          id?: string
          last_learned_at?: string | null
          override_rate?: number | null
          total_feedback_count?: number | null
          updated_at?: string | null
          user_adjustments?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_purpose_weights_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_style_profile: {
        Row: {
          activity_patterns: Json | null
          avg_paragraph_length: number | null
          avg_sentence_length: number | null
          avg_word_length: number | null
          common_words: Json | null
          communication_style: string | null
          confidence_score: number | null
          created_at: string | null
          emotional_tone: Json | null
          engagement_style: string | null
          expertise_areas: string[] | null
          formatting_preferences: Json | null
          grammar_patterns: Json | null
          humor_style: string | null
          id: string
          interests: string[] | null
          last_updated: string | null
          personality_traits: Json | null
          punctuation_patterns: Json | null
          rare_words: Json | null
          sample_size: number | null
          sentence_complexity: number | null
          text_organization_style: string | null
          topics: Json | null
          total_words_count: number | null
          typical_response_time: unknown
          unique_words_count: number | null
          user_id: string
          vocabulary_richness: number | null
        }
        Insert: {
          activity_patterns?: Json | null
          avg_paragraph_length?: number | null
          avg_sentence_length?: number | null
          avg_word_length?: number | null
          common_words?: Json | null
          communication_style?: string | null
          confidence_score?: number | null
          created_at?: string | null
          emotional_tone?: Json | null
          engagement_style?: string | null
          expertise_areas?: string[] | null
          formatting_preferences?: Json | null
          grammar_patterns?: Json | null
          humor_style?: string | null
          id?: string
          interests?: string[] | null
          last_updated?: string | null
          personality_traits?: Json | null
          punctuation_patterns?: Json | null
          rare_words?: Json | null
          sample_size?: number | null
          sentence_complexity?: number | null
          text_organization_style?: string | null
          topics?: Json | null
          total_words_count?: number | null
          typical_response_time?: unknown
          unique_words_count?: number | null
          user_id: string
          vocabulary_richness?: number | null
        }
        Update: {
          activity_patterns?: Json | null
          avg_paragraph_length?: number | null
          avg_sentence_length?: number | null
          avg_word_length?: number | null
          common_words?: Json | null
          communication_style?: string | null
          confidence_score?: number | null
          created_at?: string | null
          emotional_tone?: Json | null
          engagement_style?: string | null
          expertise_areas?: string[] | null
          formatting_preferences?: Json | null
          grammar_patterns?: Json | null
          humor_style?: string | null
          id?: string
          interests?: string[] | null
          last_updated?: string | null
          personality_traits?: Json | null
          punctuation_patterns?: Json | null
          rare_words?: Json | null
          sample_size?: number | null
          sentence_complexity?: number | null
          text_organization_style?: string | null
          topics?: Json | null
          total_words_count?: number | null
          typical_response_time?: unknown
          unique_words_count?: number | null
          user_id?: string
          vocabulary_richness?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_style_profile_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_text_content: {
        Row: {
          char_count: number | null
          content_type: string
          context: Json | null
          created_at: string | null
          id: string
          language: string | null
          platform: string
          platform_data_id: string | null
          processed_at: string | null
          text_content: string
          timestamp: string | null
          user_id: string
          word_count: number | null
        }
        Insert: {
          char_count?: number | null
          content_type: string
          context?: Json | null
          created_at?: string | null
          id?: string
          language?: string | null
          platform: string
          platform_data_id?: string | null
          processed_at?: string | null
          text_content: string
          timestamp?: string | null
          user_id: string
          word_count?: number | null
        }
        Update: {
          char_count?: number | null
          content_type?: string
          context?: Json | null
          created_at?: string | null
          id?: string
          language?: string | null
          platform?: string
          platform_data_id?: string | null
          processed_at?: string | null
          text_content?: string
          timestamp?: string | null
          user_id?: string
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_text_content_platform_data_id_fkey"
            columns: ["platform_data_id"]
            isOneToOne: false
            referencedRelation: "user_platform_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_text_content_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_writing_patterns: {
        Row: {
          assertiveness_score: number | null
          avg_engagement_level: number | null
          avg_message_length: number | null
          avg_sentence_length: number | null
          common_phrases: string[] | null
          common_topics: string[] | null
          curiosity_score: number | null
          detail_orientation: number | null
          emoji_frequency: number | null
          formality_score: number | null
          id: string
          last_updated: string | null
          messages_per_session_avg: number | null
          peak_engagement_hours: Json | null
          preferred_time_of_day: string | null
          question_frequency: number | null
          session_duration_avg_minutes: number | null
          topic_depth_preferences: Json | null
          total_conversations: number | null
          total_words_analyzed: number | null
          typical_depth: string | null
          user_id: string
          vocabulary_richness: number | null
        }
        Insert: {
          assertiveness_score?: number | null
          avg_engagement_level?: number | null
          avg_message_length?: number | null
          avg_sentence_length?: number | null
          common_phrases?: string[] | null
          common_topics?: string[] | null
          curiosity_score?: number | null
          detail_orientation?: number | null
          emoji_frequency?: number | null
          formality_score?: number | null
          id?: string
          last_updated?: string | null
          messages_per_session_avg?: number | null
          peak_engagement_hours?: Json | null
          preferred_time_of_day?: string | null
          question_frequency?: number | null
          session_duration_avg_minutes?: number | null
          topic_depth_preferences?: Json | null
          total_conversations?: number | null
          total_words_analyzed?: number | null
          typical_depth?: string | null
          user_id: string
          vocabulary_richness?: number | null
        }
        Update: {
          assertiveness_score?: number | null
          avg_engagement_level?: number | null
          avg_message_length?: number | null
          avg_sentence_length?: number | null
          common_phrases?: string[] | null
          common_topics?: string[] | null
          curiosity_score?: number | null
          detail_orientation?: number | null
          emoji_frequency?: number | null
          formality_score?: number | null
          id?: string
          last_updated?: string | null
          messages_per_session_avg?: number | null
          peak_engagement_hours?: Json | null
          preferred_time_of_day?: string | null
          question_frequency?: number | null
          session_duration_avg_minutes?: number | null
          topic_depth_preferences?: Json | null
          total_conversations?: number | null
          total_words_analyzed?: number | null
          typical_depth?: string | null
          user_id?: string
          vocabulary_richness?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_writing_patterns_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          oauth_provider: string | null
          onboarding_completed_at: string | null
          password_hash: string | null
          pattern_sharing_level: number | null
          pattern_tracking_enabled: boolean | null
          personality_quiz: Json | null
          picture_url: string | null
          preferred_ritual_duration: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          oauth_provider?: string | null
          onboarding_completed_at?: string | null
          password_hash?: string | null
          pattern_sharing_level?: number | null
          pattern_tracking_enabled?: boolean | null
          personality_quiz?: Json | null
          picture_url?: string | null
          preferred_ritual_duration?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          oauth_provider?: string | null
          onboarding_completed_at?: string | null
          password_hash?: string | null
          pattern_sharing_level?: number | null
          pattern_tracking_enabled?: boolean | null
          personality_quiz?: Json | null
          picture_url?: string | null
          preferred_ritual_duration?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          added_at: string | null
          created_at: string | null
          customer_name: string
          customer_phone: string
          estimated_wait_minutes: number | null
          id: string
          notes: string | null
          party_size: number
          restaurant_id: string
          status: string | null
          updated_at: string | null
          waitlist_id: string
        }
        Insert: {
          added_at?: string | null
          created_at?: string | null
          customer_name: string
          customer_phone: string
          estimated_wait_minutes?: number | null
          id?: string
          notes?: string | null
          party_size: number
          restaurant_id: string
          status?: string | null
          updated_at?: string | null
          waitlist_id: string
        }
        Update: {
          added_at?: string | null
          created_at?: string | null
          customer_name?: string
          customer_phone?: string
          estimated_wait_minutes?: number | null
          id?: string
          notes?: string | null
          party_size?: number
          restaurant_id?: string
          status?: string | null
          updated_at?: string | null
          waitlist_id?: string
        }
        Relationships: []
      }
      working_memory: {
        Row: {
          context: Json | null
          created_at: string | null
          scratchpad: string | null
          session_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          context?: Json | null
          created_at?: string | null
          scratchpad?: string | null
          session_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          context?: Json | null
          created_at?: string | null
          scratchpad?: string | null
          session_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      working_memory_archive: {
        Row: {
          archived_at: string | null
          archived_messages: Json
          id: string
          session_id: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          archived_messages: Json
          id?: string
          session_id: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          archived_messages?: Json
          id?: string
          session_id?: string
          user_id?: string
        }
        Relationships: []
      }
      youtube_activity: {
        Row: {
          activity_content: string | null
          activity_timestamp: string
          activity_type: string
          channel_id: string | null
          channel_title: string | null
          connector_id: string | null
          id: string
          ingested_at: string | null
          user_id: string
          video_category: string | null
          video_id: string | null
          video_title: string | null
        }
        Insert: {
          activity_content?: string | null
          activity_timestamp: string
          activity_type: string
          channel_id?: string | null
          channel_title?: string | null
          connector_id?: string | null
          id?: string
          ingested_at?: string | null
          user_id: string
          video_category?: string | null
          video_id?: string | null
          video_title?: string | null
        }
        Update: {
          activity_content?: string | null
          activity_timestamp?: string
          activity_type?: string
          channel_id?: string | null
          channel_title?: string | null
          connector_id?: string | null
          id?: string
          ingested_at?: string | null
          user_id?: string
          video_category?: string | null
          video_id?: string | null
          video_title?: string | null
        }
        Relationships: []
      }
      youtube_subscriptions: {
        Row: {
          channel_categories: string[] | null
          channel_description: string | null
          channel_id: string
          channel_keywords: string[] | null
          channel_title: string
          connector_id: string | null
          id: string
          ingested_at: string | null
          subscribed_at: string | null
          subscriber_count: number | null
          user_id: string
          video_count: number | null
        }
        Insert: {
          channel_categories?: string[] | null
          channel_description?: string | null
          channel_id: string
          channel_keywords?: string[] | null
          channel_title: string
          connector_id?: string | null
          id?: string
          ingested_at?: string | null
          subscribed_at?: string | null
          subscriber_count?: number | null
          user_id: string
          video_count?: number | null
        }
        Update: {
          channel_categories?: string[] | null
          channel_description?: string | null
          channel_id?: string
          channel_keywords?: string[] | null
          channel_title?: string
          connector_id?: string | null
          id?: string
          ingested_at?: string | null
          subscribed_at?: string | null
          subscriber_count?: number | null
          user_id?: string
          video_count?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      aio_active_meta_markets: {
        Row: {
          competition_id: string | null
          competition_name: string | null
          created_at: string | null
          current_odds: Json | null
          description: string | null
          id: string | null
          locks_at: string | null
          market_type: string | null
          opens_at: string | null
          outcomes: Json | null
          question: string | null
          status: string | null
          total_bets: number | null
          total_volume: number | null
        }
        Relationships: [
          {
            foreignKeyName: "aio_meta_markets_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "aio_competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_combined_game_leaderboard: {
        Row: {
          accuracy: number | null
          avatar_url: string | null
          average_time_ms: number | null
          best_streak: number | null
          game_name: string | null
          game_type: string | null
          id: string | null
          last_played_at: string | null
          player_id: string | null
          player_name: string | null
          player_type: string | null
          puzzles_attempted: number | null
          puzzles_solved: number | null
          sessions_completed: number | null
          total_score: number | null
        }
        Relationships: []
      }
      aio_prediction_leaderboard: {
        Row: {
          agent_color: string | null
          agent_id: string | null
          agent_name: string | null
          brier_score: number | null
          competition_id: string | null
          created_at: string | null
          current_balance: number | null
          final_score: number | null
          portfolio_id: string | null
          profit_percent: number | null
          starting_balance: number | null
          total_bets: number | null
          total_profit: number | null
        }
        Relationships: [
          {
            foreignKeyName: "aio_virtual_portfolios_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "aio_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_virtual_portfolios_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "aio_competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_puzzles_safe: {
        Row: {
          created_at: string | null
          difficulty: string | null
          game_type: string | null
          hint: string | null
          id: string | null
          metadata: Json | null
          options: Json | null
          points: number | null
          puzzle_id: string | null
          question: string | null
          source: string | null
          time_limit_seconds: number | null
        }
        Insert: {
          created_at?: string | null
          difficulty?: string | null
          game_type?: string | null
          hint?: string | null
          id?: string | null
          metadata?: Json | null
          options?: Json | null
          points?: number | null
          puzzle_id?: string | null
          question?: string | null
          source?: string | null
          time_limit_seconds?: number | null
        }
        Update: {
          created_at?: string | null
          difficulty?: string | null
          game_type?: string | null
          hint?: string | null
          id?: string | null
          metadata?: Json | null
          options?: Json | null
          points?: number | null
          puzzle_id?: string | null
          question?: string | null
          source?: string | null
          time_limit_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "aio_puzzles_game_type_fkey"
            columns: ["game_type"]
            isOneToOne: false
            referencedRelation: "aio_game_types"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_recent_trades: {
        Row: {
          amount: number | null
          avatar_url: string | null
          bet_id: string | null
          created_at: string | null
          market_category: string | null
          market_id: string | null
          market_question: string | null
          market_source: string | null
          outcome: string | null
          payout: number | null
          probability_at_bet: number | null
          profit: number | null
          resolution: string | null
          resolved: boolean | null
          shares: number | null
          user_id: string | null
          username: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aio_user_bets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "aio_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_user_meta_bets: {
        Row: {
          actual_payout: number | null
          amount: number | null
          competition_id: string | null
          created_at: string | null
          id: string | null
          market_id: string | null
          market_question: string | null
          market_status: string | null
          odds_at_bet: number | null
          outcome_id: string | null
          outcome_name: string | null
          potential_payout: number | null
          resolved_outcome: string | null
          settled_at: string | null
          status: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aio_meta_market_bets_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "aio_active_meta_markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_meta_market_bets_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "aio_meta_markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_meta_market_bets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "aio_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aio_meta_markets_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "aio_competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      aio_user_prediction_leaderboard: {
        Row: {
          avatar_url: string | null
          best_streak: number | null
          brier_score: number | null
          created_at: string | null
          current_streak: number | null
          follower_count: number | null
          portfolio_id: string | null
          profit_percent: number | null
          starting_balance: number | null
          total_bets: number | null
          total_profit: number | null
          total_volume: number | null
          updated_at: string | null
          user_id: string | null
          username: string | null
          virtual_balance: number | null
          win_rate: number | null
          winning_bets: number | null
        }
        Relationships: [
          {
            foreignKeyName: "aio_user_portfolios_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "aio_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      data_ingestion_health: {
        Row: {
          avg_quality_score: number | null
          failed_data: number | null
          pending_data: number | null
          processed_data: number | null
          total_raw_data: number | null
          user_id: string | null
        }
        Relationships: []
      }
      llm_cost_summary: {
        Row: {
          avg_latency_ms: number | null
          cache_hits: number | null
          call_count: number | null
          day: string | null
          model: string | null
          service_name: string | null
          tier: string | null
          total_cost_usd: number | null
          total_input_tokens: number | null
          total_output_tokens: number | null
        }
        Relationships: []
      }
      usage_summary: {
        Row: {
          metric_type: string | null
          month: string | null
          restaurant_id: string | null
          total_count: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      aio_update_agent_elo: {
        Args: {
          p_agent_id: string
          p_new_rating: number
          p_new_rd?: number
          p_new_volatility?: number
        }
        Returns: undefined
      }
      aio_upsert_domain_rating: {
        Args: {
          p_agent_id: string
          p_domain_id: string
          p_elo_rating: number
          p_is_win: boolean
          p_rd?: number
          p_volatility?: number
        }
        Returns: undefined
      }
      calculate_aio_elo_change: {
        Args: { k_factor?: number; loser_elo: number; winner_elo: number }
        Returns: number
      }
      calculate_brain_health: {
        Args: { p_user_id: string }
        Returns: {
          avg_confidence: number
          avg_edge_strength: number
          category_distribution: Json
          health_score: number
          total_edges: number
          total_nodes: number
        }[]
      }
      calculate_pattern_confidence: {
        Args: {
          p_consistency_rate: number
          p_days_since_first: number
          p_occurrence_count: number
        }
        Returns: number
      }
      calculate_portfolio_brier_score: {
        Args: { p_portfolio_id: string }
        Returns: number
      }
      calculate_session_metrics: {
        Args: { target_session_id: string }
        Returns: Json
      }
      calculate_soul_signature_completeness: {
        Args: { p_user_id: string }
        Returns: number
      }
      calculate_user_brier_score: {
        Args: { p_user_id: string }
        Returns: number
      }
      classify_correlation_strength: { Args: { r: number }; Returns: string }
      classify_significance: { Args: { z: number }; Returns: string }
      cleanup_expired_data: { Args: never; Returns: number }
      cleanup_expired_oauth_sessions: { Args: never; Returns: undefined }
      cleanup_expired_oauth_states: { Args: never; Returns: number }
      cleanup_expired_proactive_data: { Args: never; Returns: number }
      cleanup_expired_sessions: { Args: never; Returns: number }
      cleanup_old_moltbot_job_runs: { Args: never; Returns: undefined }
      close_stale_sessions: {
        Args: { p_gap_minutes?: number }
        Returns: number
      }
      credit_wallet: {
        Args: {
          p_amount_cents: number
          p_idempotency_key: string
          p_provider: string
          p_provider_ref: string
          p_wallet_id: string
        }
        Returns: undefined
      }
      debit_wallet_for_withdrawal: {
        Args: {
          p_amount_cents: number
          p_idempotency_key: string
          p_provider: string
          p_provider_ref: string
          p_wallet_id: string
        }
        Returns: undefined
      }
      decrypt_token: {
        Args: { encrypted_token: string; key?: string }
        Returns: string
      }
      encrypt_token: { Args: { key?: string; token: string }; Returns: string }
      generate_llm_system_prompt: {
        Args: { p_twin_id: string; p_user_id: string }
        Returns: string
      }
      get_active_insights: {
        Args: { p_limit?: number; p_user_id: string }
        Returns: {
          confidence_score: number
          detail: string
          generated_at: string
          id: string
          insight_type: string
          is_actionable: boolean
          suggested_action: string
          summary: string
          title: string
        }[]
      }
      get_behavioral_summary: {
        Args: { days_back?: number; target_user_id: string }
        Returns: Json
      }
      get_brain_neighbors: {
        Args: {
          p_node_id: string
          p_relationship_type?: string
          p_user_id: string
        }
        Returns: {
          category: string
          confidence: number
          direction: string
          edge_strength: number
          label: string
          node_id: string
          node_type: string
          relationship_type: string
        }[]
      }
      get_expiring_platform_tokens: {
        Args: { expiry_buffer_minutes?: number }
        Returns: {
          access_token: string
          platform: string
          refresh_token: string
          status: string
          token_expires_at: string
          user_id: string
        }[]
      }
      get_market_events: {
        Args: {
          p_category?: string
          p_limit?: number
          p_offset?: number
          p_sort?: string
          p_source?: string
        }
        Returns: {
          category: string
          close_time: number
          event_url: string
          image: string
          liquidity: number
          market_count: number
          markets: Json
          source: string
          total_volume: number
          volume_24h: number
        }[]
      }
      get_market_events_count: {
        Args: { p_category?: string; p_source?: string }
        Returns: number
      }
      get_next_turn_number: { Args: { p_session_id: string }; Returns: number }
      get_or_create_conversation_session: {
        Args: {
          p_mcp_client?: string
          p_session_gap_minutes?: number
          p_user_id: string
        }
        Returns: string
      }
      get_or_create_user_portfolio: {
        Args: { p_user_id: string }
        Returns: string
      }
      get_platform_stats: { Args: { target_user_id: string }; Returns: Json }
      get_public_user_id: { Args: { auth_user_id: string }; Returns: string }
      get_recent_importance_sum: {
        Args: { p_hours_ago?: number; p_user_id: string }
        Returns: number
      }
      get_style_summary: { Args: { target_user_id: string }; Returns: Json }
      increment_pattern_occurrence: {
        Args: { p_observation_time: string; p_pattern_id: string }
        Returns: undefined
      }
      increment_usage: {
        Args: {
          p_metric_type: string
          p_period: string
          p_restaurant_id: string
        }
        Returns: undefined
      }
      lock_funds_for_bet: {
        Args: { p_amount_cents: number; p_wallet_id: string }
        Returns: undefined
      }
      mark_oauth_state_as_used: { Args: { state_param: string }; Returns: Json }
      odds_to_probability: { Args: { odds: number }; Returns: number }
      search_memory_stream: {
        Args: {
          p_decay_factor?: number
          p_limit?: number
          p_query_embedding: string
          p_user_id: string
        }
        Returns: {
          content: string
          created_at: string
          id: string
          importance_score: number
          memory_type: string
          metadata: Json
          score: number
          source: string
        }[]
      }
      search_research_papers: {
        Args: {
          match_count?: number
          query_embedding: string
          similarity_threshold?: number
        }
        Returns: {
          content: string
          id: string
          metadata: Json
          paper_id: string
          similarity: number
          title: string
        }[]
      }
      search_similar_behavioral_sessions: {
        Args: {
          match_activity?: string
          match_count?: number
          match_user_id: string
          query_embedding: string
          similarity_threshold?: number
        }
        Returns: {
          fingerprint_text: string
          id: string
          primary_activity: string
          session_date: string
          session_id: string
          similarity: number
        }[]
      }
      search_similar_content: {
        Args: {
          match_count?: number
          match_platform?: string
          match_user_id: string
          query_embedding: string
          similarity_threshold?: number
        }
        Returns: {
          chunk_text: string
          content_type: string
          id: string
          platform: string
          similarity: number
        }[]
      }
      settle_real_bet: {
        Args: { p_bet_id: string; p_payout_cents: number }
        Returns: undefined
      }
      touch_memories: { Args: { p_memory_ids: string[] }; Returns: undefined }
      update_pattern_confidence: {
        Args: { p_pattern_id: string }
        Returns: number
      }
      update_pattern_consistency: {
        Args: { p_pattern_id: string }
        Returns: undefined
      }
      upsert_moltbot_pattern: {
        Args: {
          p_category: string
          p_confidence: number
          p_correlation_id?: string
          p_description: string
          p_evidence: Json
          p_layer: string
          p_name: string
          p_pattern_data: Json
          p_pattern_type: string
          p_r_value?: number
          p_user_id: string
        }
        Returns: string
      }
    }
    Enums: {
      actual_outcome: "showed_up" | "no_show" | "cancelled"
      intervention_type:
        | "deposit_required"
        | "confirmation_call"
        | "premium_seating"
        | "none"
      ml_risk_level: "low" | "medium" | "high" | "very-high"
      reservation_status:
        | "pending"
        | "confirmed"
        | "seated"
        | "completed"
        | "cancelled"
        | "no-show"
        | "waitlist"
      restaurant_type:
        | "fine_dining"
        | "casual_dining"
        | "fast_casual"
        | "cafe"
        | "bar"
        | "steakhouse"
        | "italian"
        | "japanese"
        | "mexican"
        | "other"
      service_status: "active" | "completed" | "cancelled"
      subscription_status:
        | "active"
        | "trialing"
        | "past_due"
        | "canceled"
        | "unpaid"
      table_status:
        | "available"
        | "occupied"
        | "reserved"
        | "being_cleaned"
        | "out_of_service"
      team_member_role: "owner" | "manager" | "host" | "staff"
      team_member_status: "active" | "inactive" | "pending"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      actual_outcome: ["showed_up", "no_show", "cancelled"],
      intervention_type: [
        "deposit_required",
        "confirmation_call",
        "premium_seating",
        "none",
      ],
      ml_risk_level: ["low", "medium", "high", "very-high"],
      reservation_status: [
        "pending",
        "confirmed",
        "seated",
        "completed",
        "cancelled",
        "no-show",
        "waitlist",
      ],
      restaurant_type: [
        "fine_dining",
        "casual_dining",
        "fast_casual",
        "cafe",
        "bar",
        "steakhouse",
        "italian",
        "japanese",
        "mexican",
        "other",
      ],
      service_status: ["active", "completed", "cancelled"],
      subscription_status: [
        "active",
        "trialing",
        "past_due",
        "canceled",
        "unpaid",
      ],
      table_status: [
        "available",
        "occupied",
        "reserved",
        "being_cleaned",
        "out_of_service",
      ],
      team_member_role: ["owner", "manager", "host", "staff"],
      team_member_status: ["active", "inactive", "pending"],
    },
  },
} as const
