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
      agent_locations: {
        Row: {
          accuracy_m: number | null
          agent_id: string
          lat: number | null
          lng: number | null
          order_id: string
          updated_at: string
        }
        Insert: {
          accuracy_m?: number | null
          agent_id: string
          lat?: number | null
          lng?: number | null
          order_id: string
          updated_at?: string
        }
        Update: {
          accuracy_m?: number | null
          agent_id?: string
          lat?: number | null
          lng?: number | null
          order_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_locations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_locations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "storage_queue"
            referencedColumns: ["order_id"]
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
      campaigns: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          cta_label: string | null
          cta_url: string | null
          heading: string
          id: string
          name: string
          promo_code_id: string | null
          recipients: number
          segment: string
          sent_at: string | null
          status: string
          subject: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          cta_url?: string | null
          heading: string
          id?: string
          name: string
          promo_code_id?: string | null
          recipients?: number
          segment: string
          sent_at?: string | null
          status?: string
          subject: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          cta_url?: string | null
          heading?: string
          id?: string
          name?: string
          promo_code_id?: string | null
          recipients?: number
          segment?: string
          sent_at?: string | null
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
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
      contact_log: {
        Row: {
          created_at: string
          id: string
          logged_by: string
          note: string
          order_id: string
          outcome: string
          promised_for: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          logged_by: string
          note: string
          order_id: string
          outcome: string
          promised_for?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          logged_by?: string
          note?: string
          order_id?: string
          outcome?: string
          promised_for?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "storage_queue"
            referencedColumns: ["order_id"]
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
          description: string | null
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
          description?: string | null
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
          description?: string | null
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
      order_issues: {
        Row: {
          compensation_kobo: number
          created_at: string
          customer_id: string
          description: string
          escalated_at: string | null
          escalated_by: string | null
          escalation_note: string | null
          id: string
          kind: string
          order_id: string
          recommended_kobo: number
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          compensation_kobo?: number
          created_at?: string
          customer_id: string
          description: string
          escalated_at?: string | null
          escalated_by?: string | null
          escalation_note?: string | null
          id?: string
          kind: string
          order_id: string
          recommended_kobo?: number
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          compensation_kobo?: number
          created_at?: string
          customer_id?: string
          description?: string
          escalated_at?: string | null
          escalated_by?: string | null
          escalation_note?: string | null
          id?: string
          kind?: string
          order_id?: string
          recommended_kobo?: number
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_issues_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_issues_order_id_fkey"
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
          check_note: string | null
          check_state: string
          checked_at: string | null
          checked_by: string | null
          created_at: string
          created_by: string | null
          id: string
          item_id: string | null
          line_total_kobo: number | null
          name: string
          note: string | null
          order_id: string
          qty: number
          removed_at: string | null
          removed_by: string | null
          status: string
          unit_price_kobo: number
        }
        Insert: {
          category_name?: string | null
          check_note?: string | null
          check_state?: string
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string | null
          line_total_kobo?: number | null
          name: string
          note?: string | null
          order_id: string
          qty: number
          removed_at?: string | null
          removed_by?: string | null
          status?: string
          unit_price_kobo: number
        }
        Update: {
          category_name?: string | null
          check_note?: string | null
          check_state?: string
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string | null
          line_total_kobo?: number | null
          name?: string
          note?: string | null
          order_id?: string
          qty?: number
          removed_at?: string | null
          removed_by?: string | null
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
      order_ratings: {
        Row: {
          comment: string | null
          created_at: string
          customer_id: string
          order_id: string
          stars: number
        }
        Insert: {
          comment?: string | null
          created_at?: string
          customer_id: string
          order_id: string
          stars: number
        }
        Update: {
          comment?: string | null
          created_at?: string
          customer_id?: string
          order_id?: string
          stars?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_ratings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_ratings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "storage_queue"
            referencedColumns: ["order_id"]
          },
        ]
      }
      orders: {
        Row: {
          address_id: string | null
          after_hours: boolean
          closed_at: string | null
          count_accepted_at: string | null
          count_auto: boolean
          count_disputed_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          delivered_at: string | null
          delivery_agent_id: string | null
          delivery_fare_kobo: number
          demurrage_kobo: number
          discount_kobo: number
          id: string
          instant: boolean
          instant_fee_kobo: number
          instant_items: number | null
          instant_late_at: string | null
          instant_promise_at: string | null
          instant_refunded_at: string | null
          instant_started_at: string | null
          instant_target_at: string | null
          instant_warned_at: string | null
          items_total_kobo: number
          notes: string | null
          order_no: number
          parent_order_id: string | null
          pickup_address: string | null
          pickup_agent_id: string | null
          pickup_distance_km: number | null
          pickup_fare_kobo: number
          pickup_lat: number | null
          pickup_lng: number | null
          promo_code_id: string | null
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
          count_accepted_at?: string | null
          count_auto?: boolean
          count_disputed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          delivered_at?: string | null
          delivery_agent_id?: string | null
          delivery_fare_kobo?: number
          demurrage_kobo?: number
          discount_kobo?: number
          id?: string
          instant?: boolean
          instant_fee_kobo?: number
          instant_items?: number | null
          instant_late_at?: string | null
          instant_promise_at?: string | null
          instant_refunded_at?: string | null
          instant_started_at?: string | null
          instant_target_at?: string | null
          instant_warned_at?: string | null
          items_total_kobo?: number
          notes?: string | null
          order_no?: never
          parent_order_id?: string | null
          pickup_address?: string | null
          pickup_agent_id?: string | null
          pickup_distance_km?: number | null
          pickup_fare_kobo?: number
          pickup_lat?: number | null
          pickup_lng?: number | null
          promo_code_id?: string | null
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
          count_accepted_at?: string | null
          count_auto?: boolean
          count_disputed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          delivered_at?: string | null
          delivery_agent_id?: string | null
          delivery_fare_kobo?: number
          demurrage_kobo?: number
          discount_kobo?: number
          id?: string
          instant?: boolean
          instant_fee_kobo?: number
          instant_items?: number | null
          instant_late_at?: string | null
          instant_promise_at?: string | null
          instant_refunded_at?: string | null
          instant_started_at?: string | null
          instant_target_at?: string | null
          instant_warned_at?: string | null
          items_total_kobo?: number
          notes?: string | null
          order_no?: never
          parent_order_id?: string | null
          pickup_address?: string | null
          pickup_agent_id?: string | null
          pickup_distance_km?: number | null
          pickup_fare_kobo?: number
          pickup_lat?: number | null
          pickup_lng?: number | null
          promo_code_id?: string | null
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
            foreignKeyName: "orders_parent_order_id_fkey"
            columns: ["parent_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_parent_order_id_fkey"
            columns: ["parent_order_id"]
            isOneToOne: false
            referencedRelation: "storage_queue"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "orders_pickup_agent_id_fkey"
            columns: ["pickup_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
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
      payment_disputes: {
        Row: {
          amount_kobo: number
          created_at: string
          due_at: string | null
          evidence_note: string | null
          evidence_sent_at: string | null
          external_ref: string | null
          id: string
          opened_by: string | null
          order_id: string
          payment_id: string
          provider: string
          reason: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          amount_kobo: number
          created_at?: string
          due_at?: string | null
          evidence_note?: string | null
          evidence_sent_at?: string | null
          external_ref?: string | null
          id?: string
          opened_by?: string | null
          order_id: string
          payment_id: string
          provider: string
          reason: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          amount_kobo?: number
          created_at?: string
          due_at?: string | null
          evidence_note?: string | null
          evidence_sent_at?: string | null
          external_ref?: string | null
          id?: string
          opened_by?: string | null
          order_id?: string
          payment_id?: string
          provider?: string
          reason?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_disputes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_disputes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "storage_queue"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "payment_disputes_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
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
          is_walk_in: boolean
          marketing_opt_in: boolean
          onboarded_at: string | null
          onboarded_by: string | null
          phone: string | null
          status: string
          status_reason: string | null
          unsub_token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_code: string
          email?: string | null
          full_name?: string
          id: string
          is_walk_in?: boolean
          marketing_opt_in?: boolean
          onboarded_at?: string | null
          onboarded_by?: string | null
          phone?: string | null
          status?: string
          status_reason?: string | null
          unsub_token?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_code?: string
          email?: string | null
          full_name?: string
          id?: string
          is_walk_in?: boolean
          marketing_opt_in?: boolean
          onboarded_at?: string | null
          onboarded_by?: string | null
          phone?: string | null
          status?: string
          status_reason?: string | null
          unsub_token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_onboarded_by_fkey"
            columns: ["onboarded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          max_uses: number | null
          note: string | null
          percent: number
          uses: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          note?: string | null
          percent: number
          uses?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          note?: string | null
          percent?: number
          uses?: number
        }
        Relationships: []
      }
      promo_redemptions: {
        Row: {
          code_id: string
          created_at: string
          customer_id: string
          id: string
          order_id: string
          released_at: string | null
        }
        Insert: {
          code_id: string
          created_at?: string
          customer_id: string
          id?: string
          order_id: string
          released_at?: string | null
        }
        Update: {
          code_id?: string
          created_at?: string
          customer_id?: string
          id?: string
          order_id?: string
          released_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_redemptions_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "storage_queue"
            referencedColumns: ["order_id"]
          },
        ]
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
          active: boolean
          ends_at: string
          id: string
          staff_id: string
          starts_at: string
          weekday: number
        }
        Insert: {
          active?: boolean
          ends_at: string
          id?: string
          staff_id: string
          starts_at: string
          weekday: number
        }
        Update: {
          active?: boolean
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
          earns_weekly_bonus: boolean
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
          earns_weekly_bonus?: boolean
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
          earns_weekly_bonus?: boolean
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
      staff_profiles: {
        Row: {
          station_zone_id: string | null
          bank_account_name: string | null
          bank_account_number: string | null
          bank_name: string | null
          created_at: string
          date_of_birth: string | null
          home_address: string | null
          initial_pw_hash: string | null
          must_change_password: boolean
          next_of_kin_name: string | null
          next_of_kin_phone: string | null
          nin: string | null
          onboarding_status: string
          photo_path: string | null
          photo_taken_at: string | null
          referee_address: string | null
          referee_name: string | null
          referee_phone: string | null
          referee_relationship: string | null
          review_note: string | null
          updated_at: string
          user_id: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          station_zone_id: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          created_at?: string
          date_of_birth?: string | null
          home_address?: string | null
          initial_pw_hash?: string | null
          must_change_password?: boolean
          next_of_kin_name?: string | null
          next_of_kin_phone?: string | null
          nin?: string | null
          onboarding_status?: string
          photo_path?: string | null
          photo_taken_at?: string | null
          referee_address?: string | null
          referee_name?: string | null
          referee_phone?: string | null
          referee_relationship?: string | null
          review_note?: string | null
          updated_at?: string
          user_id: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          station_zone_id: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          created_at?: string
          date_of_birth?: string | null
          home_address?: string | null
          initial_pw_hash?: string | null
          must_change_password?: boolean
          next_of_kin_name?: string | null
          next_of_kin_phone?: string | null
          nin?: string | null
          onboarding_status?: string
          photo_path?: string | null
          photo_taken_at?: string | null
          referee_address?: string | null
          referee_name?: string | null
          referee_phone?: string | null
          referee_relationship?: string | null
          review_note?: string | null
          updated_at?: string
          user_id?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: []
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
      unit_log: {
        Row: {
          id: string
          logged_at: string
          logged_by: string | null
          note: string | null
          order_id: string | null
          staff_id: string
          units: number
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          id?: string
          logged_at?: string
          logged_by?: string | null
          note?: string | null
          order_id?: string | null
          staff_id: string
          units: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          id?: string
          logged_at?: string
          logged_by?: string | null
          note?: string | null
          order_id?: string | null
          staff_id?: string
          units?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unit_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "storage_queue"
            referencedColumns: ["order_id"]
          },
        ]
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
      weekly_payouts: {
        Row: {
          amount_kobo: number
          created_at: string
          created_by: string | null
          id: string
          paid_at: string | null
          paid_by: string | null
          staff_id: string
          status: string
          target_units: number
          units: number
          week_start: string
        }
        Insert: {
          amount_kobo: number
          created_at?: string
          created_by?: string | null
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          staff_id: string
          status?: string
          target_units: number
          units: number
          week_start: string
        }
        Update: {
          amount_kobo?: number
          created_at?: string
          created_by?: string | null
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          staff_id?: string
          status?: string
          target_units?: number
          units?: number
          week_start?: string
        }
        Relationships: []
      }
      zones: {
        Row: {
          auto_live: boolean
          centre_lat: number | null
          centre_lng: number | null
          coords_approx: boolean
          created_at: string
          id: string
          is_live: boolean
          kind: string
          name: string
          note: string | null
          parent_id: string | null
          postal_code: string | null
          radius_m: number | null
          slug: string
          sort_order: number
          updated_at: string
          villages: string[]
        }
        Insert: {
          auto_live?: boolean
          centre_lat?: number | null
          centre_lng?: number | null
          coords_approx?: boolean
          created_at?: string
          id?: string
          is_live?: boolean
          kind: string
          name: string
          note?: string | null
          parent_id?: string | null
          postal_code?: string | null
          radius_m?: number | null
          slug: string
          sort_order?: number
          updated_at?: string
          villages?: string[]
        }
        Update: {
          auto_live?: boolean
          centre_lat?: number | null
          centre_lng?: number | null
          coords_approx?: boolean
          created_at?: string
          id?: string
          is_live?: boolean
          kind?: string
          name?: string
          note?: string | null
          parent_id?: string | null
          postal_code?: string | null
          radius_m?: number | null
          slug?: string
          sort_order?: number
          updated_at?: string
          villages?: string[]
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
      accept_count: { Args: { _order: string }; Returns: undefined }
      accrue_demurrage: { Args: never; Returns: Json }
      acknowledge_password_changed: { Args: never; Returns: undefined }
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
      add_shift: {
        Args: { _date: string; _end: string; _staff: string; _start: string }
        Returns: undefined
      }
      admin_dashboard: { Args: { _from: string; _to: string }; Returns: Json }
      admin_save_staff_profile: {
        Args: { _data: Json; _user: string }
        Returns: undefined
      }
      admin_staff_detail: { Args: { _user: string }; Returns: Json }
      agent_gate: { Args: never; Returns: boolean }
      agent_performance: { Args: { _from: string; _to: string }; Returns: Json }
      agent_ping: {
        Args: { _accuracy: number; _lat: number; _lng: number; _order: string }
        Returns: undefined
      }
      agent_reopen_count: { Args: { _order: string }; Returns: undefined }
      agent_set_item: {
        Args: { _item: string; _order: string; _qty: number }
        Returns: undefined
      }
      agent_submit_count: { Args: { _order: string }; Returns: undefined }
      apply_promo: { Args: { _code: string; _order: string }; Returns: Json }
      approve_payroll: { Args: { _run: string }; Returns: undefined }
      assign_delivery_agent: {
        Args: { _agent: string; _order: string }
        Returns: undefined
      }
      assign_pickup_agent: {
        Args: { _agent: string; _order: string }
        Returns: undefined
      }
      attention_overview: { Args: never; Returns: Json }
      available_slots: { Args: { _date: string }; Returns: Json }
      book_pickup: {
        Args: { _address: string; _lat: number; _lng: number; _notes: string }
        Returns: string
      }
      book_pickup_scheduled: {
        Args: {
          _address: string
          _lat: number
          _lng: number
          _notes: string
          _slot: string
        }
        Returns: string
      }
      callbacks_queue: { Args: never; Returns: Json }
      campaign_audience: { Args: { _segment: string }; Returns: Json }
      cancel_my_order: { Args: { _order: string }; Returns: undefined }
      cancel_paid_order: {
        Args: { _note: string; _order: string; _refund_pickup: boolean }
        Returns: Json
      }
      check_in: { Args: { _lat: number; _lng: number }; Returns: Json }
      check_order_item: {
        Args: { _item: string; _note: string; _ok: boolean }
        Returns: undefined
      }
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
      clear_agent_locations: { Args: never; Returns: number }
      close_week: { Args: { _week_start: string }; Returns: number }
      compute_payroll: { Args: { _month: string }; Returns: string }
      correct_order_item: {
        Args: { _line: string; _new_item: string; _note: string }
        Returns: Json
      }
      coverage_plan: { Args: { _days: number; _from: string }; Returns: Json }
      create_payment_intent: {
        Args: { _order: string; _provider: string; _purpose: string }
        Returns: Json
      }
      create_promo: {
        Args: {
          _code: string
          _expires: string
          _max_uses: number
          _note: string
          _percent: number
        }
        Returns: string
      }
      customer_analytics: { Args: never; Returns: Json }
      customer_detail: { Args: { _id: string }; Returns: Json }
      customer_list: {
        Args: {
          _limit?: number
          _max?: number
          _min?: number
          _month?: string
          _offset?: number
          _opted?: boolean
          _q?: string
          _sort?: string
          _stage?: string
        }
        Returns: Json
      }
      customer_map: { Args: never; Returns: Json }
      daily_money_view: { Args: { _day: string }; Returns: Json }
      decide_expense: {
        Args: { _approve: boolean; _id: string; _note: string }
        Returns: undefined
      }
      demurrage_status: { Args: { _order: string }; Returns: Json }
      desk_add_item: {
        Args: {
          _category: string
          _description: string
          _name: string
          _price_kobo: number
        }
        Returns: string
      }
      desk_cancel_delivery: { Args: { _order: string }; Returns: undefined }
      desk_cancel_walkin: {
        Args: { _note: string; _order: string }
        Returns: undefined
      }
      desk_create_walkin_order: {
        Args: { _customer: string; _notes: string }
        Returns: string
      }
      desk_delivery_intent: {
        Args: { _order: string; _provider: string }
        Returns: Json
      }
      desk_find_customer: { Args: { _q: string }; Returns: Json }
      desk_gate: { Args: never; Returns: boolean }
      desk_handover: { Args: { _order: string }; Returns: undefined }
      desk_issues: { Args: never; Returns: Json }
      desk_pay_delivery: {
        Args: {
          _mode: string
          _money_point: string
          _note: string
          _order: string
        }
        Returns: Json
      }
      desk_record_payment: {
        Args: {
          _mode: string
          _money_point: string
          _note: string
          _order: string
        }
        Returns: Json
      }
      desk_reopen_count: { Args: { _order: string }; Returns: undefined }
      desk_request_delivery: {
        Args: { _address: string; _lat: number; _lng: number; _order: string }
        Returns: Json
      }
      desk_resolve_issue: {
        Args: {
          _action: string
          _comp_kobo: number
          _id: string
          _text: string
        }
        Returns: Json
      }
      desk_set_instant: {
        Args: { _on: boolean; _order: string }
        Returns: Json
      }
      desk_set_item: {
        Args: { _item: string; _order: string; _qty: number }
        Returns: undefined
      }
      desk_split_instant: {
        Args: { _lines: Json; _order: string }
        Returns: string
      }
      desk_submit_count: { Args: { _order: string }; Returns: undefined }
      desk_walkin_recent: { Args: never; Returns: Json }
      dispute_count: {
        Args: { _note: string; _order: string }
        Returns: undefined
      }
      dispute_evidence: { Args: { _id: string }; Returns: Json }
      expense_feed: {
        Args: { _before?: string; _limit?: number }
        Returns: Json
      }
      expire_unpaid_bookings: { Args: never; Returns: number }
      extend_instant: {
        Args: { _minutes: number; _note: string; _order: string }
        Returns: undefined
      }
      finance_overview: { Args: { _from: string; _to: string }; Returns: Json }
      find_user_by_email: { Args: { _email: string }; Returns: Json }
      finish_email: {
        Args: {
          _err?: string
          _id: string
          _ok: boolean
          _provider_id?: string
        }
        Returns: undefined
      }
      flag_initial_password: { Args: { _user: string }; Returns: undefined }
      flag_stain: {
        Args: {
          _item: string
          _item_name: string
          _note: string
          _order: string
          _path: string
        }
        Returns: string
      }
      generate_shifts: { Args: { _from: string; _to: string }; Returns: number }
      grant_staff_role: {
        Args: {
          _role: Database["public"]["Enums"]["staff_role"]
          _user: string
        }
        Returns: undefined
      }
      instant_board: { Args: never; Returns: Json }
      instant_quote: { Args: { _order: string }; Returns: Json }
      instant_watch: { Args: never; Returns: Json }
      integrity_check: { Args: never; Returns: Json }
      issue_order_code: {
        Args: { _order: string; _step: string }
        Returns: string
      }
      items_balance: { Args: { _order: string }; Returns: number }
      list_agents: { Args: never; Returns: Json }
      log_contact: {
        Args: {
          _note: string
          _order: string
          _outcome: string
          _promised: string
        }
        Returns: undefined
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
      log_units: {
        Args: { _note: string; _staff: string; _units: number }
        Returns: string
      }
      mark_absences: { Args: never; Returns: number }
      mark_dispute_evidence_sent: {
        Args: { _id: string; _note: string }
        Returns: undefined
      }
      mark_payout_paid: { Args: { _id: string }; Returns: undefined }
      mark_ready: { Args: { _order: string }; Returns: undefined }
      mark_received: { Args: { _order: string }; Returns: undefined }
      mark_refund_paid: {
        Args: { _id: string; _note: string }
        Returns: undefined
      }
      my_clients: { Args: never; Returns: Json }
      my_pay_overview: { Args: never; Returns: Json }
      my_staff_state: { Args: never; Returns: Json }
      open_dispute: {
        Args: { _due: string; _payment: string; _reason: string }
        Returns: string
      }
      order_agent_location: { Args: { _order: string }; Returns: Json }
      order_timeline: { Args: { _order: string }; Returns: Json }
      pickup_analytics: { Args: { _from: string; _to: string }; Returns: Json }
      quote_pickup: { Args: { _lat: number; _lng: number }; Returns: Json }
      rate_order: {
        Args: { _comment: string; _order: string; _stars: number }
        Returns: undefined
      }
      ratings_summary: { Args: never; Returns: Json }
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
      record_dispute_from_provider: {
        Args: {
          _due: string
          _external: string
          _provider: string
          _reason: string
          _reference: string
        }
        Returns: string
      }
      recovery_detail: { Args: never; Returns: Json }
      recovery_progress: { Args: never; Returns: Json }
      redispatch_delivery: { Args: { _order: string }; Returns: undefined }
      refresh_service_area: { Args: never; Returns: Json }
      refund_instant_fee: {
        Args: { _note: string; _order: string }
        Returns: undefined
      }
      remove_promo: { Args: { _order: string }; Returns: undefined }
      report_failed_delivery: {
        Args: { _note: string; _order: string; _outcome: string }
        Returns: undefined
      }
      report_failed_pickup: {
        Args: { _note: string; _order: string; _reason: string }
        Returns: undefined
      }
      report_issue: {
        Args: { _description: string; _kind: string; _order: string }
        Returns: undefined
      }
      reschedule_pickup: {
        Args: { _order: string; _slot: string }
        Returns: undefined
      }
      resolve_dispute: {
        Args: { _id: string; _note: string; _outcome: string }
        Returns: undefined
      }
      resolve_issue: {
        Args: {
          _compensation_kobo: number
          _id: string
          _resolution: string
          _status: string
        }
        Returns: undefined
      }
      resolve_payment_review:
        | {
            Args: { _action: string; _event: number; _note: string }
            Returns: undefined
          }
        | {
            Args: { _action: string; _event: string; _note: string }
            Returns: undefined
          }
      retry_email: { Args: { _id: string }; Returns: undefined }
      run_dispatch: { Args: never; Returns: Json }
      save_business_settings: { Args: { _patch: Json }; Returns: undefined }
      save_campaign: {
        Args: {
          _body: string
          _cta_label: string
          _cta_url: string
          _heading: string
          _id: string
          _name: string
          _promo: string
          _segment: string
          _subject: string
        }
        Returns: string
      }
      save_dispatch_settings: {
        Args: {
          _auto: boolean
          _max_jobs: number
          _need_checkin: boolean
          _reassign_min: number
        }
        Returns: undefined
      }
      save_instant_settings: {
        Args: {
          _enabled: boolean
          _fee_kobo: number
          _large_hours: number
          _large_items: number
          _pickup_target: number
          _target_hours: number
        }
        Returns: undefined
      }
      save_my_staff_profile: { Args: { _data: Json }; Returns: undefined }
      save_pricing_settings: { Args: { _patch: Json }; Returns: undefined }
      save_slot_settings: {
        Args: {
          _capacity: number
          _days: number
          _enabled: boolean
          _lead: number
          _window: number
        }
        Returns: undefined
      }
      send_campaign: { Args: { _id: string; _test?: boolean }; Returns: Json }
      send_daily_digest: { Args: never; Returns: number }
      send_test_email: { Args: never; Returns: undefined }
      set_client_owner: {
        Args: { _client: string; _owner: string }
        Returns: undefined
      }
      set_instant: { Args: { _on: boolean; _order: string }; Returns: Json }
      set_marketing_opt_in: { Args: { _on: boolean }; Returns: undefined }
      set_promo_active: {
        Args: { _active: boolean; _id: string }
        Returns: undefined
      }
      set_shift_template: {
        Args: {
          _active: boolean
          _end: string
          _staff: string
          _start: string
          _weekday: number
        }
        Returns: undefined
      }
      set_staff_pay: {
        Args: {
          _active: boolean
          _base: number
          _boosted: number
          _job_title: string
          _monthly_target: number
          _user: string
          _weekly: boolean
        }
        Returns: undefined
      }
      set_staff_roles: {
        Args: { _roles: string[]; _user: string }
        Returns: undefined
      }
      set_staff_status: {
        Args: { _reason?: string; _status: string; _user: string }
        Returns: undefined
      }
      set_user_status: {
        Args: { _reason?: string; _status: string; _user: string }
        Returns: undefined
      }
      set_weekly_bonus: {
        Args: { _payout_kobo: number; _units: number }
        Returns: undefined
      }
      settle_online_payment: {
        Args: { _amount_kobo: number; _provider: string; _reference: string }
        Returns: Json
      }
      staff_list: { Args: never; Returns: Json }
      staff_onboarding_status: { Args: never; Returns: Json }
      start_washing: { Args: { _order: string }; Returns: undefined }
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
      submit_onboarding: { Args: never; Returns: undefined }
      turnaround_analytics: {
        Args: { _from: string; _to: string }
        Returns: Json
      }
      turnaround_late_refunded: { Args: { _ids: string[] }; Returns: string[] }
      unsubscribe_marketing: { Args: { _token: string }; Returns: boolean }
      update_my_profile: {
        Args: { _full_name: string; _phone: string }
        Returns: undefined
      }
      verify_order_code: {
        Args: { _code: string; _order: string; _step: string }
        Returns: Json
      }
      verify_staff: {
        Args: { _approve: boolean; _note: string; _user: string }
        Returns: undefined
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
      void_units: { Args: { _id: string; _reason: string }; Returns: undefined }
      waive_demurrage: {
        Args: { _order: string; _reason: string }
        Returns: undefined
      }
      weekly_board: { Args: { _week_start?: string }; Returns: Json }
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
        | "secretary"
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
        "secretary",
        "admin",
        "super_admin",
      ],
    },
  },
} as const
