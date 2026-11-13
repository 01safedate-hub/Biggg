import type { Modifier } from "@dnd-kit/core";

// Keep dragged menu items moving up and down only.
export const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });
