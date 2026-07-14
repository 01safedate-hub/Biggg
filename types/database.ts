export type Json =
  | string
  | number
  | boolean
  | null
  | {[key: string]: Json | undefined}
  | Json[];

export interface Database {
  public: {
    Tables: {
      restaurants: {
        Row: {
          id: string;
          name: string;
          slug: string;
          category: string;
          rating: number;
          delivery_time_min: number;
          delivery_time_max: number;
          zone: string;
          is_open: boolean;
          is_promoted: boolean;
          image_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          category: string;
          rating?: number;
          delivery_time_min: number;
          delivery_time_max: number;
          zone: string;
          is_open?: boolean;
          is_promoted?: boolean;
          image_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          category?: string;
          rating?: number;
          delivery_time_min?: number;
          delivery_time_max?: number;
          zone?: string;
          is_open?: boolean;
          is_promoted?: boolean;
          image_url?: string | null;
          created_at?: string;
        };
      };
      menu_items: {
        Row: {
          id: string;
          restaurant_id: string;
          name: string;
          price: number;
          category: string;
          image_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          name: string;
          price: number;
          category: string;
          image_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          restaurant_id?: string;
          name?: string;
          price?: number;
          category?: string;
          image_url?: string | null;
          created_at?: string;
        };
      };
      orders: {
        Row: {
          id: string;
          user_id: string | null;
          restaurant_id: string;
          status: string;
          total: number;
          delivery_code: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          restaurant_id: string;
          status?: string;
          total: number;
          delivery_code: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          restaurant_id?: string;
          status?: string;
          total?: number;
          delivery_code?: string;
          created_at?: string;
        };
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          menu_item_id: string;
          quantity: number;
          price: number;
        };
        Insert: {
          id?: string;
          order_id: string;
          menu_item_id: string;
          quantity: number;
          price: number;
        };
        Update: {
          id?: string;
          order_id?: string;
          menu_item_id?: string;
          quantity?: number;
          price?: number;
        };
      };
      riders: {
        Row: {
          id: string;
          name: string;
          phone: string;
          vehicle_type: string;
          plate_number: string;
          is_online: boolean;
          zone: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          phone: string;
          vehicle_type: string;
          plate_number: string;
          is_online?: boolean;
          zone: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          phone?: string;
          vehicle_type?: string;
          plate_number?: string;
          is_online?: boolean;
          zone?: string;
          created_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}

export type Restaurant = Database['public']['Tables']['restaurants']['Row'];
export type MenuItem = Database['public']['Tables']['menu_items']['Row'];
export type Order = Database['public']['Tables']['orders']['Row'];
export type OrderItem = Database['public']['Tables']['order_items']['Row'];
export type Rider = Database['public']['Tables']['riders']['Row'];
