"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { loadSupport } from "@/app/staff/(app)/support/actions";
import { toast } from "sonner";

type SupportRow = { phone: string; customer_name: string | null };

export function SupportNotifications() {
  const router = useRouter();
  const seen = useRef<Set<string>>(new Set());
  const audioContext = useRef<AudioContext | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);

  useEffect(() => {
    try {
      setSoundEnabled(window.localStorage.getItem("staff-notification-sound") !== "off");
    } catch {
      // Keep sound enabled when browser storage is unavailable.
    }
  }, []);

  const playChime = useCallback(() => {
    if (!soundEnabled || typeof window === "undefined") return;
    try {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const context = audioContext.current ?? new AudioContextClass();
      audioContext.current = context;

      const play = () => {
        const now = context.currentTime;
        // A clear, two-note chime with a longer tail and stronger volume.
        [740, 988].forEach((frequency, index) => {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const startAt = now + index * 0.16;
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(frequency, startAt);
          gain.gain.setValueAtTime(0.0001, startAt);
          gain.gain.exponentialRampToValueAtTime(0.14, startAt + 0.025);
          gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.32);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(startAt);
          oscillator.stop(startAt + 0.34);
        });
      };

      if (context.state === "running") play();
      else void context.resume().then(() => {
        if (context.state === "running") play();
      }).catch(() => {});
    } catch {
      // Notifications must never interrupt dashboard navigation.
    }
  }, [soundEnabled]);

  useEffect(() => {
    const unlockAudio = () => {
      try {
        const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) return;
        const context = audioContext.current ?? new AudioContextClass();
        audioContext.current = context;
        if (context.state === "suspended") void context.resume();
      } catch {
        // Audio remains unavailable until the browser permits it.
      }
    };
    window.addEventListener("pointerdown", unlockAudio);
    window.addEventListener("keydown", unlockAudio);
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);

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
            playChime();

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
  }, [router, playChime]);

  function toggleSound() {
    setSoundEnabled((enabled) => {
      const next = !enabled;
      try {
        window.localStorage.setItem("staff-notification-sound", next ? "on" : "off");
      } catch {
        // The preference still applies for this session.
      }
      return next;
    });
    if (!soundEnabled) {
      try {
        const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioContextClass) {
          const context = audioContext.current ?? new AudioContextClass();
          audioContext.current = context;
          if (context.state === "suspended") void context.resume();
        }
      } catch {
        // Browser audio may remain unavailable.
      }
    }
  }

  return (
    <button
      type="button"
      onClick={toggleSound}
      aria-label={soundEnabled ? "Mute notification sound" : "Enable notification sound"}
      title={soundEnabled ? "Notification sound on" : "Notification sound off"}
      className="fixed bottom-5 right-5 z-[90] rounded-full border border-orange-300 bg-orange-600 px-3 py-2 text-sm font-semibold text-white shadow-lg hover:bg-orange-700"
    >
      {soundEnabled ? "🔔 Sound on" : "🔕 Sound off"}
    </button>
  );
}
