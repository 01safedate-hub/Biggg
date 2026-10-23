import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegister } from "@/components/brand/PwaRegister";

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
  openGraph: { title: "LaundryPoint", description: "Laundry pickup and delivery with a secure handover.", type: "website", images: [{ url: "/brand/icon/512.png", width: 512, height: 512 }] },
  manifest: "/manifest/customer",
  icons: { icon: [{ url: "/brand/icon/32.png", sizes: "32x32", type: "image/png" }, { url: "/brand/icon/192.png", sizes: "192x192", type: "image/png" }], apple: [{ url: "/brand/icon/180.png", sizes: "180x180" }] },
  appleWebApp: { capable: true, title: "LaundryPoint", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#ea580c", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2">
          Skip to content
        </a>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
