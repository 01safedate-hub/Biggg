/** Every photo in the app must be under 20 KB. This shrinks a picture on the phone before it is uploaded. */
export const MAX_IMAGE_BYTES = 20000;

const STEPS = [800, 720, 640, 560, 480, 400, 340, 280];
const QUALITIES = [0.75, 0.65, 0.55, 0.45, 0.36, 0.28, 0.2];

async function load(file: Blob): Promise<{ draw: (c: CanvasRenderingContext2D, w: number, h: number) => void; w: number; h: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { draw: (c, w, h) => c.drawImage(bmp, 0, 0, w, h), w: bmp.width, h: bmp.height, close: () => bmp.close() };
    } catch { /* fall back to an image element */ }
  }
  const url = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("unreadable")); i.src = url; });
  return { draw: (c, w, h) => c.drawImage(img, 0, 0, w, h), w: img.naturalWidth, h: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
}

const toBlob = (c: HTMLCanvasElement, type: string, q: number) => new Promise<Blob | null>((res) => c.toBlob(res, type, q));

export function extFor(blob: Blob) { return blob.type === "image/webp" ? "webp" : "jpg"; }

/** Returns a WebP (or JPEG where WebP is not supported) under 20 KB. Throws "too_big" if the picture cannot be made small enough. */
export async function compressImage(file: Blob): Promise<Blob> {
  if (!/^image\//.test(file.type)) throw new Error("not_image");
  const src = await load(file);
  try {
    for (const maxW of STEPS) {
      const scale = Math.min(1, maxW / src.w);
      const w = Math.max(1, Math.round(src.w * scale));
      const h = Math.max(1, Math.round(src.h * scale));
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("no_canvas");
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
      src.draw(ctx, w, h);
      for (const q of QUALITIES) {
        let b = await toBlob(c, "image/webp", q);
        if (!b || b.type !== "image/webp") b = await toBlob(c, "image/jpeg", q);
        if (b && b.size <= MAX_IMAGE_BYTES) return b;
      }
    }
  } finally { src.close(); }
  throw new Error("too_big");
}

export const PHOTO_PROBLEM = "That photo could not be made small enough. Move a little closer to the item, keep it well lit, and take it again.";
