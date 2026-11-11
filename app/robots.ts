import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/staff", "/account", "/dashboard", "/orders", "/my-customs", "/customs/", "/notifications", "/onboarding", "/welcome", "/paid", "/unsubscribe", "/auth", "/api", "/offline", "/request", "/subscriptions"],
    }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
