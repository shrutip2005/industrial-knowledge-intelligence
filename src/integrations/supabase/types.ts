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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      chat_messages: {
        Row: {
          citations: Json | null
          confidence: number | null
          content: string
          created_at: string
          id: string
          role: string
          session_id: string
          user_id: string | null
        }
        Insert: {
          citations?: Json | null
          confidence?: number | null
          content: string
          created_at?: string
          id?: string
          role: string
          session_id?: string
          user_id?: string | null
        }
        Update: {
          citations?: Json | null
          confidence?: number | null
          content?: string
          created_at?: string
          id?: string
          role?: string
          session_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          embedding: string | null
          id: string
          is_shared: boolean
          page: number | null
          user_id: string | null
        }
        Insert: {
          chunk_index?: number
          content: string
          created_at?: string
          document_id: string
          embedding?: string | null
          id?: string
          is_shared?: boolean
          page?: number | null
          user_id?: string | null
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
          id?: string
          is_shared?: boolean
          page?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_shared: boolean
          regulation: string | null
          status: string
          title: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_shared?: boolean
          regulation?: string | null
          status?: string
          title: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_shared?: boolean
          regulation?: string | null
          status?: string
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      documents: {
        Row: {
          created_at: string
          doc_type: string
          id: string
          is_shared: boolean
          name: string
          ocr_text: string | null
          pages: number | null
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          doc_type?: string
          id?: string
          is_shared?: boolean
          name: string
          ocr_text?: string | null
          pages?: number | null
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          doc_type?: string
          id?: string
          is_shared?: boolean
          name?: string
          ocr_text?: string | null
          pages?: number | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      entities: {
        Row: {
          created_at: string
          document_id: string | null
          entity_type: string
          id: string
          is_shared: boolean
          label: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          document_id?: string | null
          entity_type: string
          id?: string
          is_shared?: boolean
          label: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          document_id?: string | null
          entity_type?: string
          id?: string
          is_shared?: boolean
          label?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entities_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          created_at: string
          equipment: string | null
          failure_type: string | null
          id: string
          is_shared: boolean
          narrative: string | null
          occurred_at: string | null
          severity: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          equipment?: string | null
          failure_type?: string | null
          id?: string
          is_shared?: boolean
          narrative?: string | null
          occurred_at?: string | null
          severity?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          equipment?: string | null
          failure_type?: string | null
          id?: string
          is_shared?: boolean
          narrative?: string | null
          occurred_at?: string | null
          severity?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      kg_edges: {
        Row: {
          id: string
          relation: string | null
          source_id: string
          target_id: string
        }
        Insert: {
          id?: string
          relation?: string | null
          source_id: string
          target_id: string
        }
        Update: {
          id?: string
          relation?: string | null
          source_id?: string
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kg_edges_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "kg_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kg_edges_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "kg_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      kg_nodes: {
        Row: {
          color: string | null
          detail: string | null
          id: string
          label: string
          node_type: string
          r: number | null
          x: number | null
          y: number | null
        }
        Insert: {
          color?: string | null
          detail?: string | null
          id: string
          label: string
          node_type: string
          r?: number | null
          x?: number | null
          y?: number | null
        }
        Update: {
          color?: string | null
          detail?: string | null
          id?: string
          label?: string
          node_type?: string
          r?: number | null
          x?: number | null
          y?: number | null
        }
        Relationships: []
      }
      work_orders: {
        Row: {
          created_at: string
          description: string | null
          equipment: string
          id: string
          is_shared: boolean
          occurred_at: string | null
          reported_by: string | null
          root_cause: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          equipment: string
          id: string
          is_shared?: boolean
          occurred_at?: string | null
          reported_by?: string | null
          root_cause?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          equipment?: string
          id?: string
          is_shared?: boolean
          occurred_at?: string | null
          reported_by?: string | null
          root_cause?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      match_chunks: {
        Args: { match_count?: number; query_embedding: string }
        Returns: {
          content: string
          document_id: string
          document_name: string
          id: string
          page: number
          similarity: number
        }[]
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
  public: {
    Enums: {},
  },
} as const
