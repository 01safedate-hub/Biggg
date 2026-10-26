/** Reads a pin from what a customer shares on WhatsApp: "6.25,7.10", or a Google Maps link. */
const HOSTS = new Set(["maps.app.goo.gl", "goo.gl", "www.google.com", "google.com", "maps.google.com", "www.google.com.ng", "google.com.ng"]);

function fromText(t: string): { lat: number; lng: number } | null {
  const pats = [/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/, /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/, /[?&](?:q|ll|query|destination)=(-?\d{1,2}\.\d+)(?:,|%2C)\s*(-?\d{1,3}\.\d+)/i, /^\s*(-?\d{1,2}\.\d+)\s*[, ]\s*(-?\d{1,3}\.\d+)\s*$/];
  for (const p of pats) {
    const m = t.match(p);
    if (m) { const lat = Number(m[1]); const lng = Number(m[2]); if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng }; }
  }
  return null;
}

export async function parseLocation(input: string): Promise<{ lat: number; lng: number } | null> {
  const text = input.trim().slice(0, 600);
  const direct = fromText(text) ?? fromText(decodeURIComponent(text.replace(/%(?![0-9a-f]{2})/gi, "")));
  if (direct) return direct;
  const url = text.match(/https:\/\/[^\s]+/)?.[0];
  if (!url) return null;
  let cur = url;
  for (let i = 0; i < 4; i++) {
    let u: URL;
    try { u = new URL(cur); } catch { return null; }
    if (u.protocol !== "https:" || !HOSTS.has(u.hostname)) return null;
    const hit = fromText(decodeURIComponent(u.pathname + u.search));
    if (hit) return hit;
    try {
      const res = await fetch(cur, { redirect: "manual", signal: AbortSignal.timeout(4000), headers: { "user-agent": "Mozilla/5.0" } });
      const next = res.headers.get("location");
      if (!next) return null;
      cur = new URL(next, cur).toString();
    } catch { return null; }
  }
  return null;
}
