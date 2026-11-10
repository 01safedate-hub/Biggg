"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { loadSupport } from "@/app/staff/(app)/support/actions";
import { toast } from "sonner";

type SupportRow = { phone: string; customer_name: string | null };

export function SupportNotifications() {
  const pathname = usePathname();
  const router = useRouter();
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function start() {
      try {
        const { data: allowed, error } = await supabase.rpc("staff_support_allowed");
        if (!active || error || allowed !== true) return;

        channel = supabase
          .channel("staff-support-global-notifications")
          .on("postgres_changes", {
            event: "INSERT",
            schema: "public",
            table: "whatsapp_conversation_messages",
          }, async (payload) => {
            const message = payload.new as {
              id?: string;
              phone?: string;
              direction?: string;
              body?: string;
            };
            if (!message.id || !message.phone || message.direction !== "inbound" || seen.current.has(message.id)) return;
            seen.current.add(message.id);

            let customerName = message.phone;
            try {
              const rows = await loadSupport("all") as SupportRow[];
              customerName = rows.find((row) => row.phone === message.phone)?.customer_name || message.phone;
            } catch {
              // The phone number remains a useful fallback label.
            }
            if (!active) return;

            toast(customerName, {
              description: message.body || "New WhatsApp message",
              duration: 8000,
              action: {
                label: "Open chat",
                onClick: () => router.push("/staff/support"),
              },
            });
          })
          .subscribe();
      } catch {
        // Keep the rest of the staff dashboard usable if realtime is unavailable.
      }
    }

    void start();
    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [router, pathname]);

  return null;
}
