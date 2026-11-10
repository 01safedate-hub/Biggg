/** Shelves A1 to G9: seven rows of nine. */
export const SHELF_ROWS = ["A", "B", "C", "D", "E", "F", "G"] as const;
export const SHELF_NUMS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export const SHELF_RE = /^[A-G][1-9]$/;
