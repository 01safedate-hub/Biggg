"use client";

import { useEffect } from "react";

/** The hero drum turns with SVG animation, which CSS cannot stop. Pause it for visitors who ask for less motion. */
export function ReduceHeroMotion() {
  useEffect(() => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    document.querySelector<SVGSVGElement>("#hero-art")?.pauseAnimations?.();
  }, []);
  return null;
}
