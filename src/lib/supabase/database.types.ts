// Generado con `npm run db:types`. No editar a mano.
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
      admin_users: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      asset_deletion_queue: {
        Row: {
          attempts: number
          created_at: string
          id: number
          last_error: string | null
          public_id: string
          reason: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: never
          last_error?: string | null
          public_id: string
          reason: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: never
          last_error?: string | null
          public_id?: string
          reason?: string
        }
        Relationships: []
      }
      assistant_settings: {
        Row: {
          daily_campaign_limit: number
          effort: string
          enabled: boolean
          handoff_message: string
          id: boolean
          instructions: string
          max_photos_per_product: number
          max_products: number
          model: string
          photos_mode: string
          resume_ai_after_hours: number
          updated_at: string
        }
        Insert: {
          daily_campaign_limit?: number
          effort?: string
          enabled?: boolean
          handoff_message?: string
          id?: boolean
          instructions?: string
          max_photos_per_product?: number
          max_products?: number
          model?: string
          photos_mode?: string
          resume_ai_after_hours?: number
          updated_at?: string
        }
        Update: {
          daily_campaign_limit?: number
          effort?: string
          enabled?: boolean
          handoff_message?: string
          id?: boolean
          instructions?: string
          max_photos_per_product?: number
          max_products?: number
          model?: string
          photos_mode?: string
          resume_ai_after_hours?: number
          updated_at?: string
        }
        Relationships: []
      }
      brands: {
        Row: {
          created_at: string
          id: string
          name: string
          position: number
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          position?: number
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          position?: number
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      campaign_recipients: {
        Row: {
          campaign_id: string
          customer_id: string
          delivered_at: string | null
          error: string | null
          id: number
          phone: string
          read_at: string | null
          replied_at: string | null
          sent_at: string | null
          status: string
          wa_message_id: string | null
        }
        Insert: {
          campaign_id: string
          customer_id: string
          delivered_at?: string | null
          error?: string | null
          id?: never
          phone: string
          read_at?: string | null
          replied_at?: string | null
          sent_at?: string | null
          status?: string
          wa_message_id?: string | null
        }
        Update: {
          campaign_id?: string
          customer_id?: string
          delivered_at?: string | null
          error?: string | null
          id?: never
          phone?: string
          read_at?: string | null
          replied_at?: string | null
          sent_at?: string | null
          status?: string
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          created_at: string
          created_by: string | null
          filters: Json
          finished_at: string | null
          id: string
          name: string
          processing_until: string | null
          recipients_count: number
          started_at: string | null
          status: string
          template_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          filters?: Json
          finished_at?: string | null
          id?: string
          name: string
          processing_until?: string | null
          recipients_count?: number
          started_at?: string | null
          status?: string
          template_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          filters?: Json
          finished_at?: string | null
          id?: string
          name?: string
          processing_until?: string | null
          recipients_count?: number
          started_at?: string | null
          status?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
          position: number
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          position?: number
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          position?: number
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      complaints: {
        Row: {
          amount: number | null
          code: string
          consumer_address: string
          consumer_document: string
          consumer_email: string
          consumer_name: string
          consumer_phone: string | null
          consumer_request: string
          created_at: string
          detail: string
          guardian_name: string | null
          id: string
          is_minor: boolean
          item_description: string
          item_type: string
          kind: Database["public"]["Enums"]["complaint_kind"]
          order_code: string | null
          responded_at: string | null
          response: string | null
          status: Database["public"]["Enums"]["complaint_status"]
        }
        Insert: {
          amount?: number | null
          code?: string
          consumer_address: string
          consumer_document: string
          consumer_email: string
          consumer_name: string
          consumer_phone?: string | null
          consumer_request: string
          created_at?: string
          detail: string
          guardian_name?: string | null
          id?: string
          is_minor?: boolean
          item_description: string
          item_type: string
          kind: Database["public"]["Enums"]["complaint_kind"]
          order_code?: string | null
          responded_at?: string | null
          response?: string | null
          status?: Database["public"]["Enums"]["complaint_status"]
        }
        Update: {
          amount?: number | null
          code?: string
          consumer_address?: string
          consumer_document?: string
          consumer_email?: string
          consumer_name?: string
          consumer_phone?: string | null
          consumer_request?: string
          created_at?: string
          detail?: string
          guardian_name?: string | null
          id?: string
          is_minor?: boolean
          item_description?: string
          item_type?: string
          kind?: Database["public"]["Enums"]["complaint_kind"]
          order_code?: string | null
          responded_at?: string | null
          response?: string | null
          status?: Database["public"]["Enums"]["complaint_status"]
        }
        Relationships: []
      }
      customers: {
        Row: {
          city: string | null
          created_at: string
          document: string | null
          email: string | null
          id: string
          interests: string[]
          name: string | null
          notes: string | null
          opt_in_at: string | null
          opt_in_source: string | null
          opt_out_at: string | null
          phone: string
          source: string
          tags: string[]
          updated_at: string
          whatsapp_name: string | null
          whatsapp_opt_in: boolean
        }
        Insert: {
          city?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          interests?: string[]
          name?: string | null
          notes?: string | null
          opt_in_at?: string | null
          opt_in_source?: string | null
          opt_out_at?: string | null
          phone: string
          source: string
          tags?: string[]
          updated_at?: string
          whatsapp_name?: string | null
          whatsapp_opt_in?: boolean
        }
        Update: {
          city?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          interests?: string[]
          name?: string | null
          notes?: string | null
          opt_in_at?: string | null
          opt_in_source?: string | null
          opt_out_at?: string | null
          phone?: string
          source?: string
          tags?: string[]
          updated_at?: string
          whatsapp_name?: string | null
          whatsapp_opt_in?: boolean
        }
        Relationships: []
      }
      message_templates: {
        Row: {
          body: string
          button_text: string | null
          button_url: string | null
          created_at: string
          footer: string | null
          id: string
          is_default: boolean
          kind: string
          name: string
          updated_at: string
          wa_category: string
          wa_language: string
          wa_rejection_reason: string | null
          wa_status: string
          wa_template_name: string | null
        }
        Insert: {
          body: string
          button_text?: string | null
          button_url?: string | null
          created_at?: string
          footer?: string | null
          id?: string
          is_default?: boolean
          kind: string
          name: string
          updated_at?: string
          wa_category?: string
          wa_language?: string
          wa_rejection_reason?: string | null
          wa_status?: string
          wa_template_name?: string | null
        }
        Update: {
          body?: string
          button_text?: string | null
          button_url?: string | null
          created_at?: string
          footer?: string | null
          id?: string
          is_default?: boolean
          kind?: string
          name?: string
          updated_at?: string
          wa_category?: string
          wa_language?: string
          wa_rejection_reason?: string | null
          wa_status?: string
          wa_template_name?: string | null
        }
        Relationships: []
      }
      order_items: {
        Row: {
          brand_name: string | null
          category_name: string | null
          id: string
          image_public_id: string | null
          line_total: number | null
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          unit_price: number
          variant_id: string | null
          variant_label: string | null
        }
        Insert: {
          brand_name?: string | null
          category_name?: string | null
          id?: string
          image_public_id?: string | null
          line_total?: number | null
          order_id: string
          product_id?: string | null
          product_name: string
          quantity: number
          unit_price: number
          variant_id?: string | null
          variant_label?: string | null
        }
        Update: {
          brand_name?: string | null
          category_name?: string | null
          id?: string
          image_public_id?: string | null
          line_total?: number | null
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          unit_price?: number
          variant_id?: string | null
          variant_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["order_status"] | null
          id: number
          note: string | null
          order_id: string
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: never
          note?: string | null
          order_id: string
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: never
          note?: string | null
          order_id?: string
          to_status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cancelled_at: string | null
          code: string
          created_at: string
          customer_document: string | null
          customer_email: string
          customer_id: string | null
          customer_name: string
          customer_phone: string
          discount: number
          id: string
          installments_count: number
          internal_notes: string | null
          notes: string | null
          paid_at: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          shipping_address: string
          shipping_city: string | null
          shipping_cost: number
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          code?: string
          created_at?: string
          customer_document?: string | null
          customer_email: string
          customer_id?: string | null
          customer_name: string
          customer_phone: string
          discount?: number
          id?: string
          installments_count?: number
          internal_notes?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          shipping_address: string
          shipping_city?: string | null
          shipping_cost?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          code?: string
          created_at?: string
          customer_document?: string | null
          customer_email?: string
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string
          discount?: number
          id?: string
          installments_count?: number
          internal_notes?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          shipping_address?: string
          shipping_city?: string | null
          shipping_cost?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          brightness: number
          contrast: number
          created_at: string
          crop: Json | null
          height: number | null
          id: string
          is_primary: boolean
          position: number
          product_id: string
          public_id: string
          width: number | null
        }
        Insert: {
          brightness?: number
          contrast?: number
          created_at?: string
          crop?: Json | null
          height?: number | null
          id?: string
          is_primary?: boolean
          position?: number
          product_id: string
          public_id: string
          width?: number | null
        }
        Update: {
          brightness?: number
          contrast?: number
          created_at?: string
          crop?: Json | null
          height?: number | null
          id?: string
          is_primary?: boolean
          position?: number
          product_id?: string
          public_id?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          created_at: string
          id: string
          label: string
          position: number
          price_override: number | null
          product_id: string
          sku: string | null
          stock: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string
          position?: number
          price_override?: number | null
          product_id: string
          sku?: string | null
          stock?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          position?: number
          price_override?: number | null
          product_id?: string
          sku?: string | null
          stock?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand_id: string | null
          category_id: string | null
          compare_at_price: number | null
          created_at: string
          description: string
          featured: boolean
          gender: Database["public"]["Enums"]["watch_gender"] | null
          id: string
          movement: Database["public"]["Enums"]["watch_movement"] | null
          name: string
          position: number
          price: number
          slug: string
          specs: Json
          status: Database["public"]["Enums"]["product_status"]
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          category_id?: string | null
          compare_at_price?: number | null
          created_at?: string
          description?: string
          featured?: boolean
          gender?: Database["public"]["Enums"]["watch_gender"] | null
          id?: string
          movement?: Database["public"]["Enums"]["watch_movement"] | null
          name: string
          position?: number
          price: number
          slug: string
          specs?: Json
          status?: Database["public"]["Enums"]["product_status"]
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          category_id?: string | null
          compare_at_price?: number | null
          created_at?: string
          description?: string
          featured?: boolean
          gender?: Database["public"]["Enums"]["watch_gender"] | null
          id?: string
          movement?: Database["public"]["Enums"]["watch_movement"] | null
          name?: string
          position?: number
          price?: number
          slug?: string
          specs?: Json
          status?: Database["public"]["Enums"]["product_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      store_settings: {
        Row: {
          bank_accounts: Json
          contact_email: string | null
          facebook_url: string | null
          free_shipping_threshold: number | null
          id: boolean
          instagram_url: string | null
          payment_holder_name: string | null
          pending_order_ttl_hours: number
          plin_number: string | null
          shipping_flat_fee: number
          sold_out_last: boolean
          store_name: string
          tiktok_url: string | null
          updated_at: string
          whatsapp_number: string | null
          yape_number: string | null
        }
        Insert: {
          bank_accounts?: Json
          contact_email?: string | null
          facebook_url?: string | null
          free_shipping_threshold?: number | null
          id?: boolean
          instagram_url?: string | null
          payment_holder_name?: string | null
          pending_order_ttl_hours?: number
          plin_number?: string | null
          shipping_flat_fee?: number
          sold_out_last?: boolean
          store_name?: string
          tiktok_url?: string | null
          updated_at?: string
          whatsapp_number?: string | null
          yape_number?: string | null
        }
        Update: {
          bank_accounts?: Json
          contact_email?: string | null
          facebook_url?: string | null
          free_shipping_threshold?: number | null
          id?: boolean
          instagram_url?: string | null
          payment_holder_name?: string | null
          pending_order_ttl_hours?: number
          plin_number?: string | null
          shipping_flat_fee?: number
          sold_out_last?: boolean
          store_name?: string
          tiktok_url?: string | null
          updated_at?: string
          whatsapp_number?: string | null
          yape_number?: string | null
        }
        Relationships: []
      }
      wa_conversations: {
        Row: {
          ai_lock_until: string | null
          attention_reason: string | null
          created_at: string
          customer_id: string
          human_by: string | null
          human_since: string | null
          id: string
          last_human_message_at: string | null
          last_inbound_at: string | null
          last_message_at: string | null
          mode: string
          needs_attention: boolean
          unread_count: number
          updated_at: string
        }
        Insert: {
          ai_lock_until?: string | null
          attention_reason?: string | null
          created_at?: string
          customer_id: string
          human_by?: string | null
          human_since?: string | null
          id?: string
          last_human_message_at?: string | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          mode?: string
          needs_attention?: boolean
          unread_count?: number
          updated_at?: string
        }
        Update: {
          ai_lock_until?: string | null
          attention_reason?: string | null
          created_at?: string
          customer_id?: string
          human_by?: string | null
          human_since?: string | null
          id?: string
          last_human_message_at?: string | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          mode?: string
          needs_attention?: boolean
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customer_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_messages: {
        Row: {
          agent_id: string | null
          body: string | null
          campaign_id: string | null
          conversation_id: string
          created_at: string
          direction: string
          error: string | null
          id: string
          media_url: string | null
          product_id: string | null
          sender: string
          status: string
          type: string
          wa_message_id: string | null
        }
        Insert: {
          agent_id?: string | null
          body?: string | null
          campaign_id?: string | null
          conversation_id: string
          created_at?: string
          direction: string
          error?: string | null
          id?: string
          media_url?: string | null
          product_id?: string | null
          sender: string
          status?: string
          type: string
          wa_message_id?: string | null
        }
        Update: {
          agent_id?: string | null
          body?: string | null
          campaign_id?: string | null
          conversation_id?: string
          created_at?: string
          direction?: string
          error?: string | null
          id?: string
          media_url?: string | null
          product_id?: string | null
          sender?: string
          status?: string
          type?: string
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "customer_overview"
            referencedColumns: ["conversation_id"]
          },
          {
            foreignKeyName: "wa_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "wa_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_messages_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      customer_overview: {
        Row: {
          city: string | null
          conversation_id: string | null
          conversation_mode: string | null
          created_at: string | null
          display_name: string | null
          document: string | null
          email: string | null
          first_order_at: string | null
          id: string | null
          interests: string[] | null
          last_inbound_at: string | null
          last_message_at: string | null
          last_order_at: string | null
          last_paid_at: string | null
          name: string | null
          needs_attention: boolean | null
          notes: string | null
          opt_in_at: string | null
          opt_in_source: string | null
          opt_out_at: string | null
          orders_count: number | null
          paid_orders_count: number | null
          pending_orders: number | null
          phone: string | null
          source: string | null
          tags: string[] | null
          total_spent: number | null
          unread_count: number | null
          updated_at: string | null
          whatsapp_name: string | null
          whatsapp_opt_in: boolean | null
        }
        Relationships: []
      }
    }
    Functions: {
      apply_order_status: {
        Args: {
          p_changed_by: string
          p_note: string
          p_order_id: string
          p_status: Database["public"]["Enums"]["order_status"]
        }
        Returns: {
          cancelled_at: string | null
          code: string
          created_at: string
          customer_document: string | null
          customer_email: string
          customer_id: string | null
          customer_name: string
          customer_phone: string
          discount: number
          id: string
          installments_count: number
          internal_notes: string | null
          notes: string | null
          paid_at: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          shipping_address: string
          shipping_city: string | null
          shipping_cost: number
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_order: {
        Args: {
          p_customer: Json
          p_items: Json
          p_payment_method: Database["public"]["Enums"]["payment_method"]
        }
        Returns: Json
      }
      crm_segment: { Args: { p_filters: Json }; Returns: string[] }
      expire_pending_orders: { Args: never; Returns: number }
      first_sale_at: { Args: never; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      normalize_phone: { Args: { p_phone: string }; Returns: string }
      reorder_products: { Args: { p_ids: string[] }; Returns: undefined }
      sales_breakdown: {
        Args: {
          p_dimension: string
          p_from: string
          p_limit?: number
          p_to: string
        }
        Returns: {
          label: string
          orders: number
          revenue: number
          units: number
        }[]
      }
      sales_kpis: {
        Args: { p_from: string; p_to: string }
        Returns: {
          avg_ticket: number
          orders: number
          revenue: number
          units: number
        }[]
      }
      sales_series: {
        Args: { p_from: string; p_granularity: string; p_to: string }
        Returns: {
          bucket: string
          orders: number
          revenue: number
        }[]
      }
      save_product: { Args: { p_product: Json }; Returns: Json }
      set_order_status: {
        Args: {
          p_note?: string
          p_order_id: string
          p_status: Database["public"]["Enums"]["order_status"]
        }
        Returns: {
          cancelled_at: string | null
          code: string
          created_at: string
          customer_document: string | null
          customer_email: string
          customer_id: string | null
          customer_name: string
          customer_phone: string
          discount: number
          id: string
          installments_count: number
          internal_notes: string | null
          notes: string | null
          paid_at: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          shipping_address: string
          shipping_city: string | null
          shipping_cost: number
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      start_campaign: { Args: { p_campaign_id: string }; Returns: number }
      track_order: { Args: { p_code: string; p_email: string }; Returns: Json }
      upsert_customer: {
        Args: {
          p_city?: string
          p_document?: string
          p_email?: string
          p_interests?: string[]
          p_name?: string
          p_opt_in?: boolean
          p_opt_in_source?: string
          p_phone: string
          p_source?: string
          p_whatsapp_name?: string
        }
        Returns: string
      }
    }
    Enums: {
      complaint_kind: "reclamo" | "queja"
      complaint_status: "recibido" | "en_proceso" | "respondido"
      order_status:
        | "pending_payment"
        | "paid"
        | "preparing"
        | "shipped"
        | "delivered"
        | "cancelled"
      payment_method: "transfer" | "yape" | "plin"
      product_status: "draft" | "active" | "archived"
      watch_gender: "hombre" | "mujer" | "unisex"
      watch_movement:
        | "cuarzo"
        | "automatico"
        | "mecanico"
        | "solar"
        | "smartwatch"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      complaint_kind: ["reclamo", "queja"],
      complaint_status: ["recibido", "en_proceso", "respondido"],
      order_status: [
        "pending_payment",
        "paid",
        "preparing",
        "shipped",
        "delivered",
        "cancelled",
      ],
      payment_method: ["transfer", "yape", "plin"],
      product_status: ["draft", "active", "archived"],
      watch_gender: ["hombre", "mujer", "unisex"],
      watch_movement: [
        "cuarzo",
        "automatico",
        "mecanico",
        "solar",
        "smartwatch",
      ],
    },
  },
} as const
