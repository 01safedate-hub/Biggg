import sharp from "sharp";
import { FALLBACK_SVG, fetchLogo } from "@/lib/brand";

export const revalidate = 86400;

const SPEC: Record<string, { size: number; mode: "any" | "maskable" | "solid" }> = {
  "32.png": { size: 32, mode: "any" },
  "180.png": { size: 180, mode: "solid" },
  "192.png": { size: 192, mode: "any" },
  "512.png": { size: 512, mode: "any" },
  "maskable-512.png": { size: 512, mode: "maskable" },
};

/** App icons are cut from the logo on request, then cached for a day. */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const spec = SPEC[file];
  if (!spec) return new Response("not found", { status: 404 });
  const logo = await fetchLogo();
  const src = logo?.buf ?? Buffer.from(FALLBACK_SVG);
  const white = { r: 255, g: 255, b: 255, alpha: 1 };
  let img: Buffer;
  if (spec.mode === "any") {
    img = await sharp(src).resize(spec.size, spec.size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  } else {
    // Maskable and solid icons keep the logo inside a safe zone on a white tile so no phone shape crops it.
    const inner = Math.round(spec.size * (spec.mode === "maskable" ? 0.62 : 0.8));
    const logoBuf = await sharp(src).resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    img = await sharp({ create: { width: spec.size, height: spec.size, channels: 4, background: white } })
      .composite([{ input: logoBuf, gravity: "center" }]).png().toBuffer();
  }
  return new Response(new Uint8Array(img), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" } });
}
