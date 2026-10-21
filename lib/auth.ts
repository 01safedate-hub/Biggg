/** Only allow redirects to paths inside this site. */
export function safeNext(value: string | null | undefined, fallback = "/account"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  return value;
}

/** Nigerian-friendly phone cleanup: keeps digits and a leading +, accepts 10 to 15 digits. */
export function cleanPhone(value: string): string | null {
  const trimmed = value.trim().replace(/[\s()-]/g, "");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

export const MIN_PASSWORD = 10;
