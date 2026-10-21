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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      addresses: {
        Row: {
          created_at: string
          formatted_address: string | null
          id: string
          label: string
          lat: number
          lng: number
          user_id: string
          zone_id: string | null
        }
        Insert: {
          created_at?: string
          formatted_address?: string | null
          id?: string
          label?: string
          lat: number
          lng: number
          user_id: string
          zone_id?: string | null
        }
        Update: {
          created_at?: string
          formatted_address?: string | null
          id?: string
          label?: string
          lat?: number
          lng?: number
          user_id?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "addresses_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          checked_in_at: string | null
          checked_out_at: string | null
          created_at: string
          id: string
          in_lat: number | null
          in_lng: number | null
          minutes_late: number
          out_lat: number | null
          out_lng: number | null
          quick_checkout: boolean
          shift_id: string
          staff_id: string
          status: string
          surcharge_kobo: number
        }
        Insert: {
          checked_in_at?: string | null
          checked_out_at?: string | null
          created_at?: string
          id?: string
          in_lat?: number | null
          in_lng?: number | null
          minutes_late?: number
          out_lat?: number | null
          out_lng?: number | null
          quick_checkout?: boolean
          shift_id: string
          staff_id: string
          status?: string
          surcharge_kobo?: number
        }
        Update: {
          checked_in_at?: string | null
          checked_out_at?: string | null
          created_at?: string
          id?: string
          in_lat?: number | null
          in_lng?: number | null
          minutes_late?: number
          out_lat?: number | null
          out_lng?: number | null
          quick_checkout?: boolean
          shift_id?: string
          staff_id?: string
          status?: string
          surcharge_kobo?: number
        }
        Relationships: [
          {
            foreignKeyName: "attendance_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: true
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: number
          new_data: Json | null
          old_data: Json | null
          row_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          row_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          row_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      capital_entries: {
        Row: {
          amount_kobo: number
          created_at: string
          entered_by: string | null
          entered_on: string
          id: string
          kind: string
          label: string
          status: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount_kobo: number
          created_at?: string
          entered_by?: string | null
          entered_on?: string
          id?: string
          kind: string
          label: string
          status?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount_kobo?: number
          created_at?: string
          entered_by?: string | null
          entered_on?: string
          id?: string
          kind?: string
          label?: string
          status?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "capital_entries_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_counts: {
        Row: {
          basis: string
          counted_by: string
          counted_kobo: number
          created_at: string
          day: string
          difference_kobo: number | null
          expected_balance_kobo: number
          expected_day_kobo: number
          id: string
          money_point_id: string
          note: string | null
        }
        Insert: {
          basis: string
          counted_by: string
          counted_kobo: number
          created_at?: string
          day: string
          difference_kobo?: number | null
          expected_balance_kobo: number
          expected_day_kobo: number
          id?: string
          money_point_id: string
          note?: string | null
        }
        Update: {
          basis?: string
          counted_by?: string
          counted_kobo?: number
          created_at?: string
          day?: string
          difference_kobo?: number | null
          expected_balance_kobo?: number
          expected_day_kobo?: number
          id?: string
          money_point_id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_counts_money_point_id_fkey"
            columns: ["money_point_id"]
            isOneToOne: false
            referencedRelation: "money_points"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_sales_summary: {
        Row: {
          cashier_id: string
          day: string
          gross_kobo: number
          mode: string
          money_point_id: string
          refunded_kobo: number
          txn_count: number
        }
        Insert: {
          cashier_id: string
          day: string
          gross_kobo?: number
          mode: string
          money_point_id: string
          refunded_kobo?: number
          txn_count?: number
        }
        Update: {
          cashier_id?: string
          day?: string
          gross_kobo?: number
          mode?: string
          money_point_id?: string
          refunded_kobo?: number
          txn_count?: number
        }
        Relationships: []
      }
      delivery_attempts: {
        Row: {
          called_number: string | null
          created_at: string
          id: string
          logged_by: string | null
          note: string | null
          order_id: string
          outcome: string
        }
        Insert: {
          called_number?: string | null
          created_at?: string
          id?: string
          logged_by?: string | null
          note?: string | null
          order_id: string
          outcome: string
        }
        Update: {
          called_number?: string | null
          created_at?: string
          id?: string
          logged_by?: string | null
          note?: string | null
          order_id?: string
          outcome?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_attempts_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_attempts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_attempts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "storage_queue"
            referencedColumns: ["order_id"]
          },
        ]
      }
      demurrage_cases: {
        Row: {
          accrued_kobo: number
          basis: string
          closed_at: string | null
          fee_kobo: number
          grace_ends_at: string
          id: string
          last_accrued_on: string | null
          opened_at: string
          opened_by: string | null
          order_id: string
          started_notice_at: string | null
          status: string
          waived_by: string | null
          waived_reason: string | null
          warned_at: string | null
        }
        Insert: {
          accrued_kobo?: number
          basis: string
          closed_at?: string | null
          fee_kobo: number
          grace_ends_at: string
          id?: string
          last_accrued_on?: string | null
          opened_at?: string
          opened_by?: string | null
          order_id: string
          started_notice_at?: string | null
          status?: string
          waived_by?: string | null
          waived_reason?: string | null
          warned_at?: string | null
        }
        Update: {
          accrued_kobo?: number
          basis?: string
          closed_at?: string | null
          fee_kobo?: number
          grace_ends_at?: string
          id?: string
          last_accrued_on?: string | null
          opened_at?: string
          opened_by?: string | null
          order_id?: string
          started_notice_at?: string | null
          status?: string
          waived_by?: string | null
          waived_reason?: string | null
          warned_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "demurrage_cases_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demurrage_cases_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demurrage_cases_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "storage_queue"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "demurrage_cases_waived_by_fkey"
            columns: ["waived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_outbox: {
        Row: {
          attempts: number
          created_at: string
          id: string
          idempotency_key: string | null
          last_error: string | null
          payload: Json
          provider_message_id: string | null
          run_after: string
          sent_at: string | null
          status: string
          template: string
          to_email: string
          user_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          idempotency_key?: string | null
          last_error?: string | null
          payload?: Json
          provider_message_id?: string | null
          run_after?: string
          sent_at?: string | null
          status?: string
          template: string
          to_email: string
          user_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          idempotency_key?: string | null
          last_error?: string | null
          payload?: Json
          provider_message_id?: string | null
          run_after?: string
          sent_at?: string | null
          status?: string
          template?: string
          to_email?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_outbox_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence: {
        Row: {
          capital_id: string | null
          created_at: string
          expense_id: string | null
          id: string
          kind: string
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          capital_id?: string | null
          created_at?: string
          expense_id?: string | null
          id?: string
          kind: string
          storage_path: string
          uploaded_by: string
        }
        Update: {
          capital_id?: string | null
          created_at?: string
          expense_id?: string | null
          id?: string
          kind?: string
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_capital_id_fkey"
            columns: ["capital_id"]
            isOneToOne: false
            referencedRelation: "capital_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount_kobo: number
          category_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          entered_by: string | null
          id: string
          label: string
          money_point_id: string | null
          order_id: string | null
          spent_on: string
          status: string
          vendor: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount_kobo: number
          category_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          entered_by?: string | null
          id?: string
          label: string
          money_point_id?: string | null
          order_id?: string | null
          spent_on?: string
          status?: string
          vendor?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount_kobo?: number
          category_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          entered_by?: string | null
          id?: string
          label?: string
          money_point_id?: string | null
          order_id?: string | null
          spent_on?: string
          status?: string
          vendor?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_money_point_id_fkey"
            columns: ["money_point_id"]
            isOneToOne: false
            referencedRelation: "money_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "storage_queue"
            referencedColumns: ["order_id"]
          },
        ]
      }
      item_categories: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      items: {
        Row: {
          active: boolean
          category_id: string
          created_at: string
          id: string
          name: string
          price_kobo: number
          search_terms: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category_id: string
          created_at?: string
          id?: string
          name: string
          price_kobo: number
          search_terms?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category_id?: string
          created_at?: string
          id?: string
          name?: string
          price_kobo?: number
          search_terms?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "item_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          converted_user_id: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string | null
          note: string | null
          phone: string | null
          source: string
        }
        Insert: {
          converted_user_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string | null
          note?: string | null
          phone?: string | null
          source?: string
        }
        Update: {
          converted_user_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string | null
          note?: string | null
          phone?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_converted_user_id_fkey"
            columns: ["converted_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          end_date: string
          id: string
          reason: string | null
          staff_id: string
          start_date: string
          status: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          end_date: string
          id?: string
          reason?: string | null
          staff_id: string
          start_date: string
          status?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          end_date?: string
          id?: string
          reason?: string | null
          staff_id?: string
          start_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      money_points: {
        Row: {
          account_name: string | null
          account_number: string | null
          active: boolean
          bank_name: string | null
          created_at: string
          id: string
          kind: string
          name: string
          opening_balance_kobo: number
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          active?: boolean
          bank_name?: string | null
          created_at?: string
          id?: string
          kind: string
          name: string
          opening_balance_kobo?: number
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          active?: boolean
          bank_name?: string | null
          created_at?: string
          id?: string
          kind?: string
          name?: string
          opening_balance_kobo?: number
        }
        Relationships: []
      }
      order_codes: {
        Row: {
          attempts: number
          code: string
          issued_at: string
          order_id: string
          step: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          attempts?: number
          code: string
          issued_at?: string
          order_id: string
          step: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          attempts?: number
          code?: string
          issued_at?: string
          order_id?: string
          step?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_codes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_codes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "storage_queue"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_codes_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_events: {
        Row: {
          actor_id: string | null
          created_at: string
          detail: Json
          event: string
          id: number
          order_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          detail?: Json
          event: string
          id?: never
          order_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          detail?: Json
          event?: string
          id?: never
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "storage_queue"
            referencedColumns: ["order_id"]
          },
        ]
      }
      order_items: {
        Row: {
          category_name: string | null
          created_at: string
          created_by: string | null
          id: string
          item_id: string | null
          line_total_kobo: number | null
          name: string
          note: string | null
          order_id: string
          qty: number
          status: string
          unit_price_kobo: number
        }
        Insert: {
          category_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string | null
          line_total_kobo?: number | null
          name: string
          note?: string | null
          order_id: string
          qty: number
          status?: string
          unit_price_kobo: number
        }
        Update: {
          category_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string | null
          line_total_kobo?: number | null
          name?: string
          note?: string | null
          order_id?: string
          qty?: number
          status?: string
          unit_price_kobo?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "storage_queue"
            referencedColumns: ["order_id"]
          },
        ]
      }
      order_photos: {
        Row: {
          acknowledged_at: string | null
          created_at: string
          id: string
          kind: string
          note: string | null
          order_id: string
          order_item_id: string | null
          storage_path: string
          taken_by: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          created_at?: string
          id?: string
          kind: string
          note?: string | null
          order_id: string
          order_item_id?: string | null
          storage_path: string
          taken_by?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          created_at?: string
          id?: string
          kind?: string
          note?: string | null
          order_id?: string
          order_item_id?: string | null
          storage_path?: string
          taken_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_photos_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_photos_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "storage_queue"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_photos_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_photos_taken_by_fkey"
            columns: ["taken_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          address_id: string | null
          after_hours: boolean
          closed_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          delivered_at: string | null
          delivery_agent_id: string | null
          delivery_fare_kobo: number
          demurrage_kobo: number
          discount_kobo: number
          id: string
          items_total_kobo: number
          notes: string | null
          order_no: number
          pickup_address: string | null
          pickup_agent_id: string | null
          pickup_distance_km: number | null
          pickup_fare_kobo: number
          pickup_lat: number | null
          pickup_lng: number | null
          ready_at: string | null
          scheduled_for: string | null
          source: string
          status: Database["public"]["Enums"]["order_status"]
          subscription_pickup_id: string | null
          updated_at: string
          zone_id: string | null
        }
        Insert: {
          address_id?: string | null
          after_hours?: boolean
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          delivered_at?: string | null
          delivery_agent_id?: string | null
          delivery_fare_kobo?: number
          demurrage_kobo?: number
          discount_kobo?: number
          id?: string
          items_total_kobo?: number
          notes?: string | null
          order_no?: never
          pickup_address?: string | null
          pickup_agent_id?: string | null
          pickup_distance_km?: number | null
          pickup_fare_kobo?: number
          pickup_lat?: number | null
          pickup_lng?: number | null
          ready_at?: string | null
          scheduled_for?: string | null
          source: string
          status?: Database["public"]["Enums"]["order_status"]
          subscription_pickup_id?: string | null
          updated_at?: string
          zone_id?: string | null
        }
        Update: {
          address_id?: string | null
          after_hours?: boolean
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          delivered_at?: string | null
          delivery_agent_id?: string | null
          delivery_fare_kobo?: number
          demurrage_kobo?: number
          discount_kobo?: number
          id?: string
          items_total_kobo?: number
          notes?: string | null
          order_no?: never
          pickup_address?: string | null
          pickup_agent_id?: string | null
          pickup_distance_km?: number | null
          pickup_fare_kobo?: number
          pickup_lat?: number | null
          pickup_lng?: number | null
          ready_at?: string | null
          scheduled_for?: string | null
          source?: string
          status?: Database["public"]["Enums"]["order_status"]
          subscription_pickup_id?: string | null
          updated_at?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_delivery_agent_id_fkey"
            columns: ["delivery_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_pickup_agent_id_fkey"
            columns: ["pickup_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_subscription_pickup_id_fkey"
            columns: ["subscription_pickup_id"]
            isOneToOne: false
            referencedRelation: "late_subscription_pickups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_subscription_pickup_id_fkey"
            columns: ["subscription_pickup_id"]
            isOneToOne: false
            referencedRelation: "subscription_pickups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_kobo: number
          created_at: string
          customer_id: string | null
          id: string
          invoice_id: string | null
          kind: string
          mode: string
          money_point_id: string | null
          note: string | null
          order_id: string | null
          paid_at: string | null
          provider_payload: Json | null
          purpose: string
          recorded_by: string | null
          reference: string
          status: string
        }
        Insert: {
          amount_kobo: number
          created_at?: string
          customer_id?: string | null
          id?: string
          invoice_id?: string | null
          kind?: string
          mode: string
          money_point_id?: string | null
          note?: string | null
          order_id?: string | null
          paid_at?: string | null
          provider_payload?: Json | null
          purpose: string
          recorded_by?: string | null
          reference?: string
          status?: string
        }
        Update: {
          amount_kobo?: number
          created_at?: string
          customer_id?: string | null
          id?: string
          invoice_id?: string | null
          kind?: string
          mode?: string
          money_point_id?: string | null
          note?: string | null
          order_id?: string | null
          paid_at?: string | null
          provider_payload?: Json | null
          purpose?: string
          recorded_by?: string | null
          reference?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_fk"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "subscription_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_money_point_id_fkey"
            columns: ["money_point_id"]
            isOneToOne: false
            referencedRelation: "money_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "storage_queue"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          month: string
          recovery_cleared: boolean
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          month: string
          recovery_cleared?: boolean
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          month?: string
          recovery_cleared?: boolean
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payslips: {
        Row: {
          base_kobo: number
          boosted_kobo: number
          created_at: string
          gross_kobo: number
          id: string
          net_kobo: number
          run_id: string
          staff_id: string
          strikes: number
          surcharge_applied_kobo: number
          surcharge_total_kobo: number
          target_met: boolean
          used_boosted: boolean
        }
        Insert: {
          base_kobo: number
          boosted_kobo: number
          created_at?: string
          gross_kobo: number
          id?: string
          net_kobo: number
          run_id: string
          staff_id: string
          strikes: number
          surcharge_applied_kobo: number
          surcharge_total_kobo: number
          target_met: boolean
          used_boosted: boolean
        }
        Update: {
          base_kobo?: number
          boosted_kobo?: number
          created_at?: string
          gross_kobo?: number
          id?: string
          net_kobo?: number
          run_id?: string
          staff_id?: string
          strikes?: number
          surcharge_applied_kobo?: number
          surcharge_total_kobo?: number
          target_met?: boolean
          used_boosted?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "payslips_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          active: boolean
          blurb: string | null
          created_at: string
          id: string
          monthly_price_kobo: number
          name: string
          overage_price_kobo: number
          pieces_per_month: number
          slug: string
          sort_order: number
          updated_at: string
          weekly_allowance: number
          yearly_discount_pct: number
        }
        Insert: {
          active?: boolean
          blurb?: string | null
          created_at?: string
          id?: string
          monthly_price_kobo: number
          name: string
          overage_price_kobo?: number
          pieces_per_month: number
          slug: string
          sort_order?: number
          updated_at?: string
          weekly_allowance: number
          yearly_discount_pct?: number
        }
        Update: {
          active?: boolean
          blurb?: string | null
          created_at?: string
          id?: string
          monthly_price_kobo?: number
          name?: string
          overage_price_kobo?: number
          pieces_per_month?: number
          slug?: string
          sort_order?: number
          updated_at?: string
          weekly_allowance?: number
          yearly_discount_pct?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          customer_code: string
          email: string | null
          full_name: string
          id: string
          marketing_opt_in: boolean
          phone: string | null
          status: string
          status_reason: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_code: string
          email?: string | null
          full_name?: string
          id: string
          marketing_opt_in?: boolean
          phone?: string | null
          status?: string
          status_reason?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_code?: string
          email?: string | null
          full_name?: string
          id?: string
          marketing_opt_in?: boolean
          phone?: string | null
          status?: string
          status_reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          description: string | null
          is_public: boolean
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          is_public?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          is_public?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      shift_templates: {
        Row: {
          ends_at: string
          id: string
          staff_id: string
          starts_at: string
          weekday: number
        }
        Insert: {
          ends_at: string
          id?: string
          staff_id: string
          starts_at: string
          weekday: number
        }
        Update: {
          ends_at?: string
          id?: string
          staff_id?: string
          starts_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "shift_templates_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          created_by: string | null
          ends_at: string
          id: string
          shift_date: string
          staff_id: string
          starts_at: string
        }
        Insert: {
          created_by?: string | null
          ends_at: string
          id?: string
          shift_date: string
          staff_id: string
          starts_at: string
        }
        Update: {
          created_by?: string | null
          ends_at?: string
          id?: string
          shift_date?: string
          staff_id?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_pay: {
        Row: {
          active: boolean
          base_salary_kobo: number
          boosted_salary_kobo: number
          hired_on: string | null
          job_title: string | null
          monthly_target_kobo: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          base_salary_kobo?: number
          boosted_salary_kobo?: number
          hired_on?: string | null
          job_title?: string | null
          monthly_target_kobo?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          base_salary_kobo?: number
          boosted_salary_kobo?: number
          hired_on?: string | null
          job_title?: string | null
          monthly_target_kobo?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_pay_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_invoices: {
        Row: {
          amount_kobo: number
          created_at: string
          id: string
          payment_id: string | null
          period_end: string
          period_start: string
          status: string
          subscription_id: string
        }
        Insert: {
          amount_kobo: number
          created_at?: string
          id?: string
          payment_id?: string | null
          period_end: string
          period_start: string
          status?: string
          subscription_id: string
        }
        Update: {
          amount_kobo?: number
          created_at?: string
          id?: string
          payment_id?: string | null
          period_end?: string
          period_start?: string
          status?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_invoices_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_pickups: {
        Row: {
          id: string
          order_id: string | null
          overage_kobo: number
          overage_pieces: number
          pieces_counted: number | null
          scheduled_for: string
          status: string
          subscription_id: string
          week_start: string
        }
        Insert: {
          id?: string
          order_id?: string | null
          overage_kobo?: number
          overage_pieces?: number
          pieces_counted?: number | null
          scheduled_for: string
          status?: string
          subscription_id: string
          week_start: string
        }
        Update: {
          id?: string
          order_id?: string | null
          overage_kobo?: number
          overage_pieces?: number
          pieces_counted?: number | null
          scheduled_for?: string
          status?: string
          subscription_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_pickups_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_pickups_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "storage_queue"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "subscription_pickups_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          address_id: string | null
          billing_period: string
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          customer_id: string
          id: string
          pickup_weekday: number | null
          plan_id: string
          price_kobo: number
          started_at: string | null
          status: string
          updated_at: string
          zone_id: string | null
        }
        Insert: {
          address_id?: string | null
          billing_period: string
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          customer_id: string
          id?: string
          pickup_weekday?: number | null
          plan_id: string
          price_kobo: number
          started_at?: string | null
          status?: string
          updated_at?: string
          zone_id?: string | null
        }
        Update: {
          address_id?: string | null
          billing_period?: string
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          customer_id?: string
          id?: string
          pickup_weekday?: number | null
          plan_id?: string
          price_kobo?: number
          started_at?: string | null
          status?: string
          updated_at?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      surcharge_rules: {
        Row: {
          active: boolean
          amount_kobo: number
          from_minutes: number
          id: string
          kind: string
          label: string
          to_minutes: number | null
        }
        Insert: {
          active?: boolean
          amount_kobo: number
          from_minutes?: number
          id?: string
          kind: string
          label: string
          to_minutes?: number | null
        }
        Update: {
          active?: boolean
          amount_kobo?: number
          from_minutes?: number
          id?: string
          kind?: string
          label?: string
          to_minutes?: number | null
        }
        Relationships: []
      }
      user_notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string | null
          order_id: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string | null
          order_id?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string | null
          order_id?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "storage_queue"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "user_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          granted_by: string | null
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
          user_id?: string
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          created_at: string
          detected_area: string | null
          email: string
          id: string
          lat: number | null
          lng: number | null
          notified_at: string | null
          zone_id: string | null
        }
        Insert: {
          created_at?: string
          detected_area?: string | null
          email: string
          id?: string
          lat?: number | null
          lng?: number | null
          notified_at?: string | null
          zone_id?: string | null
        }
        Update: {
          created_at?: string
          detected_area?: string | null
          email?: string
          id?: string
          lat?: number | null
          lng?: number | null
          notified_at?: string | null
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      zones: {
        Row: {
          centre_lat: number | null
          centre_lng: number | null
          created_at: string
          id: string
          is_live: boolean
          kind: string
          name: string
          parent_id: string | null
          radius_m: number | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          centre_lat?: number | null
          centre_lng?: number | null
          created_at?: string
          id?: string
          is_live?: boolean
          kind: string
          name: string
          parent_id?: string | null
          radius_m?: number | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          centre_lat?: number | null
          centre_lng?: number | null
          created_at?: string
          id?: string
          is_live?: boolean
          kind?: string
          name?: string
          parent_id?: string | null
          radius_m?: number | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "zones_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      late_subscription_pickups: {
        Row: {
          customer_id: string | null
          id: string | null
          late_by: string | null
          scheduled_for: string | null
          subscription_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_pickups_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_queue: {
        Row: {
          days_waiting: number | null
          demurrage_kobo: number | null
          full_name: string | null
          order_id: string | null
          order_no: number | null
          phone: string | null
          ready_at: string | null
          status: Database["public"]["Enums"]["order_status"] | null
        }
        Relationships: []
      }
      waitlist_by_area: {
        Row: {
          area: string | null
          first_signup: string | null
          last_signup: string | null
          people: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      accrue_demurrage: { Args: never; Returns: Json }
      add_capital_entry: {
        Args: {
          _amount_kobo: number
          _entered_on: string
          _evidence: Json
          _kind: string
          _label: string
        }
        Returns: string
      }
      approve_payroll: { Args: { _run: string }; Returns: undefined }
      check_in: { Args: { _lat: number; _lng: number }; Returns: Json }
      check_out: { Args: { _lat: number; _lng: number }; Returns: Json }
      claim_email_batch: {
        Args: { _n?: number }
        Returns: {
          attempts: number
          created_at: string
          id: string
          idempotency_key: string | null
          last_error: string | null
          payload: Json
          provider_message_id: string | null
          run_after: string
          sent_at: string | null
          status: string
          template: string
          to_email: string
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "email_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      compute_payroll: { Args: { _month: string }; Returns: string }
      daily_money_view: { Args: { _day: string }; Returns: Json }
      decide_expense: {
        Args: { _approve: boolean; _id: string; _note: string }
        Returns: undefined
      }
      finance_overview: { Args: { _from: string; _to: string }; Returns: Json }
      finish_email: {
        Args: {
          _err?: string
          _id: string
          _ok: boolean
          _provider_id?: string
        }
        Returns: undefined
      }
      generate_shifts: { Args: { _from: string; _to: string }; Returns: number }
      grant_staff_role: {
        Args: {
          _role: Database["public"]["Enums"]["staff_role"]
          _user: string
        }
        Returns: undefined
      }
      issue_order_code: {
        Args: { _order: string; _step: string }
        Returns: string
      }
      log_failed_delivery: {
        Args: {
          _called?: string
          _note?: string
          _order: string
          _outcome: string
        }
        Returns: Json
      }
      mark_absences: { Args: never; Returns: number }
      quote_pickup: { Args: { _lat: number; _lng: number }; Returns: Json }
      record_cash_count: {
        Args: {
          _basis: string
          _counted_kobo: number
          _day: string
          _money_point_id: string
          _note: string
        }
        Returns: undefined
      }
      recovery_detail: { Args: never; Returns: Json }
      recovery_progress: { Args: never; Returns: Json }
      set_user_status: {
        Args: { _reason?: string; _status: string; _user: string }
        Returns: undefined
      }
      submit_expense: {
        Args: {
          _amount_kobo: number
          _category_id: string
          _evidence: Json
          _label: string
          _money_point_id: string
          _spent_on: string
          _vendor: string
        }
        Returns: string
      }
      verify_order_code: {
        Args: { _code: string; _order: string; _step: string }
        Returns: Json
      }
      verify_worker_secret: { Args: { _s: string }; Returns: boolean }
      void_capital_entry: {
        Args: { _id: string; _reason: string }
        Returns: undefined
      }
      void_expense: {
        Args: { _id: string; _reason: string }
        Returns: undefined
      }
      waive_demurrage: {
        Args: { _order: string; _reason: string }
        Returns: undefined
      }
    }
    Enums: {
      order_status:
        | "awaiting_fare_payment"
        | "awaiting_dispatch"
        | "agent_assigned"
        | "agent_arrived"
        | "counted"
        | "count_confirmed"
        | "received"
        | "in_house"
        | "ready"
        | "awaiting_delivery_fare"
        | "out_for_delivery"
        | "delivered"
        | "closed"
        | "failed_delivery"
        | "cancelled"
      staff_role:
        | "delivery_agent"
        | "cashier"
        | "accountant"
        | "admin"
        | "super_admin"
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
      order_status: [
        "awaiting_fare_payment",
        "awaiting_dispatch",
        "agent_assigned",
        "agent_arrived",
        "counted",
        "count_confirmed",
        "received",
        "in_house",
        "ready",
        "awaiting_delivery_fare",
        "out_for_delivery",
        "delivered",
        "closed",
        "failed_delivery",
        "cancelled",
      ],
      staff_role: [
        "delivery_agent",
        "cashier",
        "accountant",
        "admin",
        "super_admin",
      ],
    },
  },
} as const
