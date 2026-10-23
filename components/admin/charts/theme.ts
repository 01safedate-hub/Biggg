/** Chart colours, in the validated fixed order (blue, orange, aqua). Aqua is below 3:1 on white, so it is always labelled and has a table view. */
export const C = { sales: "#2a78d6", spend: "#eb6834", profit: "#1baf7a" } as const;
/** One-hue blue steps for ordered stages, darkest last (ordinal ramp, step 250 and darker). */
export const RAMP = ["#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95"];
