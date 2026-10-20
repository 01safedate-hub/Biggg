import type { Metadata, Viewport } from "next";
import "./globals.css";

const DEFAULT_SITE = "https://laundrypoint.app";

/** Accepts "laundrypoint.app", "https://laundrypoint.app/" or a quoted value, and never throws. */
function siteUrl(): URL {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/^["']|["']$/g, "");
  if (!raw) return new URL(DEFAULT_SITE);
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return new URL(DEFAULT_SITE);
  }
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: { default: "LaundryPoint | Laundry pickup and delivery", template: "%s | LaundryPoint" },
  description:
    "Request a laundry pickup, pay the transport fare, and have your clothes counted, cleaned and returned with a secure three-code handover. Monthly plans available.",
  openGraph: { title: "LaundryPoint", description: "Laundry pickup and delivery with a secure handover.", type: "website" },
};

export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
