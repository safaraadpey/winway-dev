// Auto-generated Supabase typings (trimmed) refreshed after adding draws.processed_at
// Source: Supabase MCP generate_typescript_types (local snapshot)

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      draws: {
        Row: {
          id: string;
          room_id: string;
          number: number;
          timestamp: string;
          created_at: string;
          processed_at: string | null;
        };
        Insert: {
          id?: string;
          room_id: string;
          number: number;
          timestamp?: string;
          created_at?: string;
          processed_at?: string | null;
        };
        Update: {
          id?: string;
          room_id?: string;
          number?: number;
          timestamp?: string;
          created_at?: string;
          processed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "draws_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "draws_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "vw_finance_profit_summary";
            referencedColumns: ["room_id"];
          }
        ];
      };
      draw_jobs: {
        Row: {
          id: number;
          room_id: string;
          draw_number: number;
          status: string;
          attempts: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          room_id: string;
          draw_number: number;
          status?: string;
          attempts?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          room_id?: string;
          draw_number?: number;
          status?: string;
          attempts?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      // NOTE: other tables omitted for brevity; regenerate from Supabase schema if needed.
    };
    Views: Record<string, never>;
    Functions: {
      fn_process_draw_jobs_batch: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      fn_process_draw_jobs_batch_worker: {
        Args: { p_worker_id: number; p_total_workers: number };
        Returns: undefined;
      };
      rpc_apply_marks_for_draw: {
        Args: { p_room_id: string; p_draw_number: number };
        Returns: undefined;
      };
      fn_evaluate_room_after_draw: {
        Args: { p_room_id: string; p_draw_number: number };
        Returns: undefined;
      };
    };
    Enums: {
      // Add enums here as needed.
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database["public"];

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: infer S }
    ? S extends keyof Database
      ? keyof (Database[S]["Tables"] & Database[S]["Views"])
      : never
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
      PublicSchema["Views"])
  ? (PublicSchema["Tables"] &
      PublicSchema["Views"])[PublicTableNameOrOptions] extends {
      Row: infer R;
    }
    ? R
    : never
  : never;

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: infer S }
    ? S extends keyof Database
      ? keyof Database[S]["Tables"]
      : never
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
  ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
      Insert: infer I;
    }
    ? I
    : never
  : never;

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: infer S }
    ? S extends keyof Database
      ? keyof Database[S]["Tables"]
      : never
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
  ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
      Update: infer U;
    }
    ? U
    : never
  : never;

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: infer S }
    ? S extends keyof Database
      ? keyof Database[S]["Enums"]
      : never
    : never = never
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
  ? PublicSchema["Enums"][PublicEnumNameOrOptions]
  : never;
