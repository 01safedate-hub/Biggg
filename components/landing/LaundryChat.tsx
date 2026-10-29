"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, X } from "lucide-react";

type Msg = { id: number; role: "ai" | "you"; text: string; link?: { href: string; label: string }; typing?: boolean };

const SUGGESTIONS = [
  { key: "duvet", q: "Can you wash a king-size duvet?", a: "Yes, we wash duvets. Tell me the filling (cotton, feather or polyester) and I'll plan the wash and drying." },
  { key: "shoes", q: "Do you clean sneakers?", a: "Yes, we clean shoes. Tell me the material (canvas, leather, suede or mesh) and I'll match the right method." },
  { key: "suit", q: "Can you handle a suit or agbada?", a: "Yes, we handle suits and native wear with extra care. Tell me the fabric and any embroidery or stains." },
];

/** "Chat with our laundry AI" button and its chat window. Answers are canned until the AI endpoint is connected. */
export function LaundryChat({ whatsapp }: { whatsapp: string | null }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 0, role: "ai", text: "Hi, I'm the laundry AI. Tell me what you want cleaned and I'll explain how we handle it." }]);
  const [left, setLeft] = useState(SUGGESTIONS);
  const [text, setText] = useState("");

  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [msgs]);
  // The hero drum spins with SVG animation, which CSS cannot stop: pause it for people who ask for less motion.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) document.querySelectorAll("svg").forEach((s) => s.pauseAnimations?.());
  }, []);

  function open() {
    dlg.current?.showModal();
    input.current?.focus();
  }

  function reply(text: string, link?: Msg["link"]) {
    const id = nextId.current++;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setMsgs((m) => [...m, { id, role: "ai", text: "", typing: true }]);
    window.setTimeout(() => setMsgs((m) => m.map((x) => (x.id === id ? { ...x, text, link, typing: false } : x))), reduce ? 0 : 700);
  }

  function ask(q: string) {
    setMsgs((m) => [...m, { id: nextId.current++, role: "you", text: q }]);
  }

  function pick(key: string) {
    const s = SUGGESTIONS.find((x) => x.key === key);
    if (!s) return;
    ask(s.q);
    reply(s.a);
    setLeft((l) => l.filter((x) => x.key !== key));
  }

  function send(e: React.FormEvent) {
    e.preventDefault();
    const v = text.trim();
    if (!v) return;
    ask(v);
    setText("");
    const wa = whatsapp ? `https://wa.me/${whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(v)}` : null;
    reply(
      wa
        ? "I can't answer that here yet. Send it to us on WhatsApp and a person will reply, or tap Request pickup to book."
        : "I can't answer that here yet. Tap Request pickup to book and an agent will help you at your door.",
      wa ? { href: wa, label: "Ask on WhatsApp" } : undefined,
    );
  }

  return (
    <>
      <button type="button" onClick={open} className="btn-primary">
        <Sparkles className="h-4 w-4" aria-hidden />
        Chat with our laundry AI
      </button>

      <dialog
        ref={dlg}
        aria-labelledby="chat-title"
        onClick={(e) => { if (e.target === dlg.current) dlg.current?.close(); }}
        className="laundry-chat mx-0 mb-0 mt-auto w-screen max-w-none overflow-hidden rounded-t-2xl border-0 bg-white p-0 text-ink shadow-2xl backdrop:bg-ink/45 sm:mb-3 sm:ml-auto sm:mr-3 sm:mt-auto sm:w-[min(26rem,calc(100vw-1.5rem))] sm:rounded-2xl"
      >
        <div className="flex max-h-[88dvh] flex-col sm:max-h-[min(40rem,calc(100dvh-1.5rem))]">
          <div className="flex items-center gap-3 bg-brand py-3.5 pl-4 pr-3 text-white">
            <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-brand">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <h2 id="chat-title" className="text-base font-semibold leading-5">Laundry AI</h2>
              <p className="text-[0.8125rem] leading-[1.1rem] opacity-90">Ask how we handle any item</p>
            </div>
            <button type="button" onClick={() => dlg.current?.close()} aria-label="Close chat" className="ml-auto grid h-10 w-10 place-items-center rounded-full hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <div ref={log} role="log" aria-live="polite" className="flex min-h-40 flex-1 flex-col gap-2.5 overflow-auto bg-canvas p-4">
            {msgs.map((m) => (
              <div
                key={m.id}
                className={`max-w-[86%] rounded-2xl px-3.5 py-2.5 text-[0.9375rem] leading-[1.45] ${m.role === "ai" ? "self-start rounded-bl-sm border border-line bg-white" : "self-end rounded-br-sm bg-brand text-white"}`}
              >
                {m.typing ? (
                  <span className="chat-dots inline-flex gap-1 py-1" aria-label="Typing"><i /><i /><i /></span>
                ) : (
                  <>
                    {m.text}
                    {m.link && <a href={m.link.href} target="_blank" rel="noopener noreferrer" className="mt-2 block font-semibold text-brand-dark underline underline-offset-2">{m.link.label}</a>}
                  </>
                )}
              </div>
            ))}
          </div>

          {left.length > 0 && (
            <div className="flex flex-wrap gap-2 bg-canvas px-4 pb-3.5">
              {left.map((s) => (
                <button key={s.key} type="button" onClick={() => pick(s.key)} className="rounded-full border border-brand bg-white px-3 py-2 text-left text-[0.8125rem] font-semibold leading-[1.1rem] text-brand-dark hover:bg-brand-tint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                  {s.q}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={send} className="flex gap-2 border-t border-line bg-white p-3">
            <input
              ref={input}
              value={text}
              onChange={(e) => setText(e.target.value)}
              type="text"
              placeholder="Ask about an item"
              autoComplete="off"
              aria-label="Your message"
              maxLength={500}
              className="min-h-11 min-w-0 flex-1 rounded-md border border-line px-3.5 text-base focus:border-brand focus:outline-none"
            />
            <button type="submit" aria-label="Send" className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-brand text-white hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
              <Send className="h-[1.125rem] w-[1.125rem]" aria-hidden />
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}
