import { FALLBACK_SVG, fetchLogo } from "@/lib/brand";

export const revalidate = 86400;

export async function GET() {
  const logo = await fetchLogo();
  const headers = { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" };
  if (!logo) return new Response(FALLBACK_SVG, { headers: { ...headers, "Content-Type": "image/svg+xml" } });
  return new Response(new Uint8Array(logo.buf), { headers: { ...headers, "Content-Type": logo.type } });
}
