import type { PublicSettings } from "@/lib/site-data";

/** The public site address used for canonical links, the sitemap and structured data. */
export const SITE_URL = (() => {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/^["']|["']$/g, "").replace(/\/$/, "");
  if (!raw) return "https://laundrypoint.app";
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
})();

/** Google Search Console HTML-tag code (the content="..." part). Set NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION or paste it here. */
export const GOOGLE_VERIFICATION = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || "";

/**
 * Towns and neighbourhoods with their own landing page. Coordinates are a central point in each place
 * (checked against public maps); fares on the page are quoted live from them, so a point outside every
 * live zone would show "Shown at booking" rather than a wrong price. `detail` is extra local text.
 */
export const AREA_PAGES: readonly { slug: string; name: string; lga: string; lat: number; lng: number; note: string; detail?: string }[] = [
  { slug: "awka", name: "Awka", lga: "Awka South", lat: 6.2107, lng: 7.0742, note: "Anambra's capital, including Zik Avenue, Eke Awka market, Aroma, Umuokpu and Agu-Awka.",
    detail: "From Zik Avenue and Eke Awka to Kwata, Regina Caeli and Club Road, we cover the whole of Awka town. Busy workers and families use us so they spend the weekend resting, not washing." },
  { slug: "ifite", name: "Ifite", lga: "Awka South", lat: 6.251056, lng: 7.100335, note: "Our hub is here in Ifite, beside Nnamdi Azikiwe University (Unizik), so students and lodges nearby get the quickest pickups.",
    detail: "You can also walk in: drop your clothes at our front desk in Ifite and collect them free when they are ready." },
  { slug: "unizik", name: "Unizik", lga: "Awka South", lat: 6.242889, lng: 7.118289, note: "Laundry for Nnamdi Azikiwe University students and staff, on campus, at the hostels and in off-campus lodges around Ifite and Temp Site.",
    detail: "Our hub is a short ride from the Unizik gate. Students can pick a monthly student plan (a student ID is needed), and lodge owners can arrange one prepaid bill for the whole building." },
  { slug: "temp-site", name: "Temp Site", lga: "Awka South", lat: 6.2224, lng: 7.0555, note: "Unizik Temp Site and the streets around Unizik junction, Oby Okoli Avenue, Abakaliki Street and towards Okpuno.",
    detail: "Temp Site is full of student lodges, young workers and small businesses. We collect from your lodge gate or office and bring everything back folded and counted." },
  { slug: "aroma", name: "Aroma", lga: "Awka South", lat: 6.229, lng: 7.08, note: "Around Aroma junction and the flyover on the Enugu–Onitsha expressway, including Secretariat Road, Maduka Street and the streets behind the junction.",
    detail: "Aroma is one of Awka's busiest junctions, so we schedule pickups around the traffic and confirm the time with you before the agent sets out." },
  { slug: "amikwo", name: "Amikwo (Works Road)", lga: "Awka South", lat: 6.206719, lng: 7.064044, note: "Works Road, Dike Street, Ken Okoli Street and the streets of Amikwo between Eke Awka and Zik Avenue.",
    detail: "Amikwo homes are close to Eke Awka market. Families here like our monthly household plans, which include bedding and curtains." },
  { slug: "amawbia", name: "Amawbia", lga: "Awka South", lat: 6.215, lng: 7.048, note: "On the Enugu–Onitsha expressway, just south-west of Awka town.",
    detail: "We cover the whole of Amawbia, from the roundabout and the Awka South council area to the homes off the expressway. Government staff and families book pickups from home or the office." },
  { slug: "okpuno", name: "Okpuno", lga: "Awka South", lat: 6.19, lng: 7.056, note: "South of Awka, next to Amawbia." },
  { slug: "nibo", name: "Nibo", lga: "Awka South", lat: 6.162, lng: 7.098, note: "South of Awka town." },
  { slug: "nise", name: "Nise", lga: "Awka South", lat: 6.18, lng: 7.118, note: "South-east of Awka town." },
  { slug: "mbaukwu", name: "Mbaukwu", lga: "Awka South", lat: 6.24, lng: 7.135, note: "East of Ifite." },
  { slug: "isiagu", name: "Isiagu", lga: "Awka South", lat: 6.268, lng: 7.087, note: "A few minutes north of our Ifite hub." },
  { slug: "amansea", name: "Amansea", lga: "Awka North", lat: 6.29, lng: 7.115, note: "North of Ifite on the Enugu road." },
  { slug: "achalla", name: "Achalla", lga: "Awka North", lat: 6.318, lng: 7.096, note: "In Awka North, north of our hub." },
];

export type AreaPage = (typeof AREA_PAGES)[number];

export const SERVICES = ["Wash and fold", "Washing and ironing", "Dry cleaning", "Ironing only", "Duvets, curtains and bedding", "Suits and native wear"];

/** "08:00" → "8am" */
export const clock = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  const hh = ((h + 11) % 12) + 1;
  return `${hh}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
};

/** Street address as it appears on the building sign; keep in sync with the Google Business Profile. */
export const HUB_STREET = "D-Pikin's Luxury Apartment, Flat B2, opposite Wennys Plaza, Book Foundation, Ifite";
export const HUB_ADDRESS = `${HUB_STREET}, Awka, Anambra`;

export const HUB_PHOTOS = [
  { src: "/hub/front-desk", alt: "LaundryPoint front desk with the lit LaundryPoint sign at the Ifite hub", caption: "Front desk" },
  { src: "/hub/machines", alt: "Staff member loading a Hisense washer-dryer at the LaundryPoint hub", caption: "Washer-dryers" },
  { src: "/hub/building", alt: "D-Pikin's Luxury Apartment building in Ifite, Awka, home of the LaundryPoint hub", caption: "Our building in Ifite" },
] as const;

/** schema.org business data for Google (DryCleaningOrLaundry is a LocalBusiness). */
export function businessJsonLd(s: PublicSettings, areas: string[]) {
  const phone = s.contact.phone ? `+234${s.contact.phone.replace(/\D/g, "").replace(/^0/, "")}` : undefined;
  return {
    "@context": "https://schema.org",
    "@type": "DryCleaningOrLaundry",
    "@id": `${SITE_URL}/#business`,
    name: s.business.name,
    url: SITE_URL,
    image: [...HUB_PHOTOS.map((p) => `${SITE_URL}${p.src}.jpg`), `${SITE_URL}/opengraph-image`],
    logo: `${SITE_URL}/brand/icon/512.png`,
    telephone: phone,
    priceRange: "₦₦",
    address: {
      "@type": "PostalAddress",
      streetAddress: HUB_STREET,
      addressLocality: "Awka",
      addressRegion: "Anambra",
      postalCode: "420112",
      addressCountry: "NG",
    },
    geo: s.hub.lat != null && s.hub.lng != null ? { "@type": "GeoCoordinates", latitude: s.hub.lat, longitude: s.hub.lng } : undefined,
    hasMap: s.hub.maps_url ?? undefined,
    openingHoursSpecification: [{
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
      opens: s.business.opening_time, closes: s.business.closing_time,
    }],
    areaServed: areas.map((name) => ({ "@type": "Place", name: `${name}, Anambra` })),
    makesOffer: SERVICES.map((name) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name } })),
  };
}

export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
