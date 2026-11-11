import type { MetadataRoute } from "next";
import { AREA_PAGES, SITE_URL } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/services`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/areas`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    ...AREA_PAGES.map((a) => ({ url: `${SITE_URL}/laundry/${a.slug}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.7 })),
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];
}
