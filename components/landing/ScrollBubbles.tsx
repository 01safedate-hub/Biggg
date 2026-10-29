"use client";

import { useEffect, useRef } from "react";

/**
 * Soap bubbles that float up from the bottom of the screen while the visitor scrolls.
 * More scrolling makes more bubbles; they stop when scrolling stops. Purely decorative:
 * no pointer events, hidden from screen readers, off for people who prefer less motion.
 */
const MAX_ALIVE = 18; // never more than this many bubbles on screen
const PX_PER_BUBBLE = 70; // one bubble for every 70 px scrolled

export function ScrollBubbles() {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = box.current;
    if (!root) return;
    let lastY = window.scrollY;
    let pending = 0;
    let frame = 0;

    const spawn = () => {
      if (root.childElementCount >= MAX_ALIVE) return;
      const b = document.createElement("span");
      const size = 10 + Math.random() * 22; // 10 to 32 px
      const rise = 160 + Math.random() * 260; // how far it floats, px
      const time = 1.8 + Math.random() * 1.6; // seconds
      b.className = "scroll-bubble";
      b.style.cssText = [
        `left:${4 + Math.random() * 92}%`,
        `width:${size}px`,
        `height:${size}px`,
        `--rise:-${rise}px`,
        `--sway:${(Math.random() * 2 - 1) * 28}px`,
        `--time:${time}s`,
      ].join(";");
      b.addEventListener("animationend", () => b.remove(), { once: true });
      root.appendChild(b);
    };

    const tick = () => {
      frame = 0;
      while (pending >= PX_PER_BUBBLE) {
        pending -= PX_PER_BUBBLE;
        spawn();
      }
    };

    const onScroll = () => {
      const y = window.scrollY;
      pending += Math.min(Math.abs(y - lastY), PX_PER_BUBBLE * 4); // a jump to an anchor makes at most 4
      lastY = y;
      if (!frame) frame = window.requestAnimationFrame(tick);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return <div ref={box} aria-hidden className="pointer-events-none fixed inset-x-0 bottom-0 z-30 h-0 overflow-visible" />;
}
