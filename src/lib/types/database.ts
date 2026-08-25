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
    PostgrestVersion: "14.17"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          base_currency: string
          cash: number
          created_at: string
          id: string
          name: string
          net_deposits: number
          starting_cash: number
          user_id: string
        }
        Insert: {
          base_currency?: string
          cash?: number
          created_at?: string
          id?: string
          name?: string
          net_deposits?: number
          starting_cash?: number
          user_id: string
        }
        Update: {
          base_currency?: string
          cash?: number
          created_at?: string
          id?: string
          name?: string
          net_deposits?: number
          starting_cash?: number
          user_id?: string
        }
        Relationships: []
      }
      api_usage: {
        Row: {
          credits: number
          limited_until: string | null
          provider: string
          usage_date: string
        }
        Insert: {
          credits?: number
          limited_until?: string | null
          provider: string
          usage_date?: string
        }
        Update: {
          credits?: number
          limited_until?: string | null
          provider?: string
          usage_date?: string
        }
        Relationships: []
      }
      chart_drawings: {
        Row: {
          overlays: Json
          symbol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          overlays?: Json
          symbol: string
          updated_at?: string
          user_id: string
        }
        Update: {
          overlays?: Json
          symbol?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      instruments: {
        Row: {
          currency: string
          exchange: string
          kind: string
          name: string
          symbol: string
          updated_at: string
        }
        Insert: {
          currency?: string
          exchange?: string
          kind?: string
          name?: string
          symbol: string
          updated_at?: string
        }
        Update: {
          currency?: string
          exchange?: string
          kind?: string
          name?: string
          symbol?: string
          updated_at?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          account_id: string
          avg_fill_price: number | null
          created_at: string
          expires_at: string | null
          filled_qty: number
          id: string
          limit_price: number | null
          order_type: string
          qty: number
          reject_reason: string | null
          side: string
          status: string
          symbol: string
          time_in_force: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          avg_fill_price?: number | null
          created_at?: string
          expires_at?: string | null
          filled_qty?: number
          id?: string
          limit_price?: number | null
          order_type: string
          qty: number
          reject_reason?: string | null
          side: string
          status?: string
          symbol: string
          time_in_force?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          avg_fill_price?: number | null
          created_at?: string
          expires_at?: string | null
          filled_qty?: number
          id?: string
          limit_price?: number | null
          order_type?: string
          qty?: number
          reject_reason?: string | null
          side?: string
          status?: string
          symbol?: string
          time_in_force?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["symbol"]
          },
        ]
      }
      portfolio_snapshots: {
        Row: {
          account_id: string
          as_of_date: string
          cash: number
          created_at: string
          equity: number
          net_deposits: number
          positions_value: number
          realized_pnl_to_date: number
          user_id: string
        }
        Insert: {
          account_id: string
          as_of_date: string
          cash: number
          created_at?: string
          equity: number
          net_deposits: number
          positions_value: number
          realized_pnl_to_date?: number
          user_id: string
        }
        Update: {
          account_id?: string
          as_of_date?: string
          cash?: number
          created_at?: string
          equity?: number
          net_deposits?: number
          positions_value?: number
          realized_pnl_to_date?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_snapshots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          account_id: string
          avg_cost: number
          opened_at: string
          qty: number
          realized_pnl: number
          symbol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          avg_cost?: number
          opened_at?: string
          qty?: number
          realized_pnl?: number
          symbol: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          avg_cost?: number
          opened_at?: string
          qty?: number
          realized_pnl?: number
          symbol?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["symbol"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          date_of_birth: string | null
          full_name: string | null
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          created_at?: string
          date_of_birth?: string | null
          full_name?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          created_at?: string
          date_of_birth?: string | null
          full_name?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      quote_cache: {
        Row: {
          day_high: number | null
          day_low: number | null
          day_open: number | null
          fetched_at: string
          is_stale: boolean
          prev_close: number | null
          price: number
          source_ts: string | null
          symbol: string
          volume: number | null
        }
        Insert: {
          day_high?: number | null
          day_low?: number | null
          day_open?: number | null
          fetched_at?: string
          is_stale?: boolean
          prev_close?: number | null
          price: number
          source_ts?: string | null
          symbol: string
          volume?: number | null
        }
        Update: {
          day_high?: number | null
          day_low?: number | null
          day_open?: number | null
          fetched_at?: string
          is_stale?: boolean
          prev_close?: number | null
          price?: number
          source_ts?: string | null
          symbol?: string
          volume?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_cache_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: true
            referencedRelation: "instruments"
            referencedColumns: ["symbol"]
          },
        ]
      }
      trades: {
        Row: {
          account_id: string
          avg_cost_at_trade: number
          cash_delta: number
          executed_at: string
          fee: number
          gross_amount: number
          id: string
          order_id: string
          price: number
          qty: number
          quote_age_ms: number | null
          realized_pnl: number
          side: string
          symbol: string
          user_id: string
        }
        Insert: {
          account_id: string
          avg_cost_at_trade?: number
          cash_delta: number
          executed_at?: string
          fee?: number
          gross_amount?: number
          id?: string
          order_id: string
          price: number
          qty: number
          quote_age_ms?: number | null
          realized_pnl?: number
          side: string
          symbol: string
          user_id: string
        }
        Update: {
          account_id?: string
          avg_cost_at_trade?: number
          cash_delta?: number
          executed_at?: string
          fee?: number
          gross_amount?: number
          id?: string
          order_id?: string
          price?: number
          qty?: number
          quote_age_ms?: number | null
          realized_pnl?: number
          side?: string
          symbol?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["symbol"]
          },
        ]
      }
      watchlist_items: {
        Row: {
          created_at: string
          id: string
          is_favourite: boolean
          note: string | null
          sort_order: number
          symbol: string
          user_id: string
          watchlist_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_favourite?: boolean
          note?: string | null
          sort_order?: number
          symbol: string
          user_id: string
          watchlist_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_favourite?: boolean
          note?: string | null
          sort_order?: number
          symbol?: string
          user_id?: string
          watchlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_items_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["symbol"]
          },
          {
            foreignKeyName: "watchlist_items_watchlist_id_fkey"
            columns: ["watchlist_id"]
            isOneToOne: false
            referencedRelation: "watchlists"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlists: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _apply_fill: {
        Args: {
          p_account_id: string
          p_order_id: string
          p_price: number
          p_qty: number
          p_quote_age_ms?: number
          p_side: string
          p_symbol: string
        }
        Returns: Json
      }
      execute_market_order: {
        Args: {
          p_account_id: string
          p_max_quote_age?: string
          p_qty: number
          p_side: string
          p_symbol: string
        }
        Returns: Json
      }
      get_or_create_account: {
        Args: never
        Returns: {
          base_currency: string
          cash: number
          created_at: string
          id: string
          name: string
          net_deposits: number
          starting_cash: number
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "accounts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_or_create_default_watchlist: {
        Args: never
        Returns: {
          created_at: string
          id: string
          name: string
          sort_order: number
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "watchlists"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_or_create_profile: {
        Args: never
        Returns: {
          created_at: string
          date_of_birth: string | null
          full_name: string | null
          updated_at: string
          user_id: string
          username: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      recompute_positions: {
        Args: { p_account_id: string }
        Returns: {
          ok: boolean
          replayed_avg: number
          replayed_qty: number
          stored_avg: number
          stored_qty: number
          symbol: string
        }[]
      }
      reset_account: {
        Args: { p_account_id: string; p_starting_cash?: number }
        Returns: {
          base_currency: string
          cash: number
          created_at: string
          id: string
          name: string
          net_deposits: number
          starting_cash: number
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "accounts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      snapshot_account: {
        Args: { p_account_id: string; p_as_of?: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
