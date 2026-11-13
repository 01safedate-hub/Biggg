import type { MetadataRoute } from "next";
import { AREA_PAGES, SITE_URL } from "@/lib/seo";
import { GUIDES } from "@/lib/guides";
import { CLEANING_AREA_SLUGS, CLEANING_SERVICE_PAGES } from "@/lib/cleaning-seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/services`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/areas`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    ...AREA_PAGES.map((a) => ({ url: `${SITE_URL}/laundry/${a.slug}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.7 })),
    { url: `${SITE_URL}/cleaning`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/cleaning/plans`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/cleaning/home-complete`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    ...CLEANING_SERVICE_PAGES.map((s) => ({ url: `${SITE_URL}/cleaning/${s.slug}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.8 })),
    ...CLEANING_AREA_SLUGS.map((a) => ({ url: `${SITE_URL}/house-cleaning/${a}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.7 })),
    { url: `${SITE_URL}/guides`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    ...GUIDES.map((g) => ({ url: `${SITE_URL}/guides/${g.slug}`, lastModified: new Date(g.published), changeFrequency: "monthly" as const, priority: 0.6 })),
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];
}
