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

/** Rules for a new password. Length matters more than symbols, so we ask for a long one and block the worst choices. */
export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < MIN_PASSWORD) return `Your password must be at least ${MIN_PASSWORD} characters.`;
  if (password.length > 72) return "Your password must be 72 characters or fewer.";
  if (/^(.)\1+$/.test(password)) return "Please choose a password that is not one repeated character.";
  const lower = password.toLowerCase();
  if (["password", "1234567890", "qwertyuiop", "laundrypoint", "0123456789"].some((w) => lower.includes(w))) return "That password is too easy to guess. Please choose another.";
  if (email && lower.includes(email.split("@")[0].toLowerCase()) && email.split("@")[0].length >= 4) return "Your password should not contain your email name.";
  return null;
}

/**
 * Checks the password against known data breaches using the Have I Been Pwned range API.
 * Only the first 5 characters of a SHA-1 hash leave the browser, never the password. If the check cannot run, we allow the password.
 */
export async function isPwnedPassword(password: string): Promise<boolean> {
  try {
    const bytes = new TextEncoder().encode(password);
    const digest = await crypto.subtle.digest("SHA-1", bytes);
    const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
    const res = await fetch(`https://api.pwnedpasswords.com/range/${hex.slice(0, 5)}`, { headers: { "Add-Padding": "true" } });
    if (!res.ok) return false;
    const text = await res.text();
    const suffix = hex.slice(5);
    return text.split("\n").some((line) => {
      const [h, count] = line.trim().split(":");
      return h === suffix && Number(count) > 0;
    });
  } catch {
    return false;
  }
}

export const PWNED_MESSAGE = "That password has appeared in a known data breach. Please choose a different one.";
