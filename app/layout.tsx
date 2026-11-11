import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegister } from "@/components/brand/PwaRegister";
import { Toaster } from "sonner";
import { GOOGLE_VERIFICATION } from "@/lib/seo";

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
  title: { default: "Laundry Pickup and Delivery in Awka | LaundryPoint", template: "%s | LaundryPoint" },
  description:
    "Laundry, dry cleaning and ironing in Awka with pickup and delivery. Our Ifite hub serves Awka, Ifite, Amawbia, Okpuno, Nibo, Nise and towns up to 15 km away. Fast turnaround with our own dryers. Open 9am to 6pm.",
  applicationName: "LaundryPoint",
  keywords: ["laundry Awka", "laundry service Awka", "dry cleaning Awka", "laundry pickup and delivery Awka", "laundry near Unizik", "laundry Ifite", "laundry Amawbia", "wash and fold Awka", "ironing Awka", "cheap laundry in Awka", "best laundry in Awka", "laundry pickup and drop off Awka", "laundry Temp Site Awka", "laundry Aroma Awka", "hotel laundry Awka", "LaundryPoint"],
  openGraph: {
    type: "website", locale: "en_NG", siteName: "LaundryPoint",
    title: "LaundryPoint: laundry pickup and delivery in Awka",
    description: "Get your clothes fast. Washing, drying, ironing and dry cleaning with pickup and delivery across Awka.",
  },
  twitter: { card: "summary_large_image", title: "LaundryPoint: laundry pickup and delivery in Awka", description: "Get your clothes fast. Laundry pickup and delivery across Awka." },
  ...(GOOGLE_VERIFICATION ? { verification: { google: GOOGLE_VERIFICATION } } : {}),
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
        <Toaster position="top-right" closeButton duration={7000} toastOptions={{ className: "border border-orange-300 !bg-orange-600 !text-white shadow-xl", descriptionClassName: "!text-orange-50", actionButtonStyle: { background: "#fff", color: "#c2410c" }, cancelButtonStyle: { background: "#9a3412", color: "#fff" } }} />
        <PwaRegister />
      </body>
    </html>
  );
}
