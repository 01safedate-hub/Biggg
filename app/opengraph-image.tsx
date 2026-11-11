import { ImageResponse } from "next/og";

export const alt = "LaundryPoint: laundry pickup and delivery in Awka";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(135deg, #ea580c 0%, #f97316 60%, #fb923c 100%)", color: "#fff", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 72, height: 72, borderRadius: 18, background: "#fff", color: "#ea580c", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44, fontWeight: 800 }}>L</div>
          <div style={{ fontSize: 44, fontWeight: 800 }}>LaundryPoint</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.05 }}>Get your clothes fast.</div>
          <div style={{ marginTop: 20, fontSize: 38, opacity: 0.95 }}>Laundry pickup and delivery across Awka</div>
        </div>
        <div style={{ display: "flex", fontSize: 28, opacity: 0.9 }}>Ifite · Awka · Amawbia · Okpuno · Nibo · Nise · and more</div>
      </div>
    ),
    size,
  );
}
