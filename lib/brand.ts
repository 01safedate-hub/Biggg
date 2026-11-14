/** The logo lives in your own Supabase storage. Change LOGO_URL to switch it without touching code. */
export const LOGO_URL = process.env.LOGO_URL ?? "https://vqzvvupwhzjaahfqgron.supabase.co/storage/v1/object/public/skilled-niger-assets/posts/3508c6cb-f61e-465e-a276-2c4517e5548d-20-0.jpg";

export const FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#ea580c"/><text x="256" y="350" font-family="Arial,Helvetica,sans-serif" font-size="300" font-weight="700" text-anchor="middle" fill="#fff">L</text></svg>`;

export async function fetchLogo(): Promise<{ buf: Buffer; type: string } | null> {
  try {
    const r = await fetch(LOGO_URL, { next: { revalidate: 86400 } });
    if (!r.ok) return null;
    return { buf: Buffer.from(await r.arrayBuffer()), type: r.headers.get("content-type") ?? "image/webp" };
  } catch {
    return null;
  }
}
