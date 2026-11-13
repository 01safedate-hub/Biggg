// Public cleaning pages: service pages, area pages and the live price information they show.
// Prices are never typed here. They come from the admin rate card through cleaning_public_info().
import { createPublicClient } from "@/lib/supabase/public";

export type CleaningInfo = {
  examples: { label: string; standard_kobo: number; deep_kobo: number }[];
  min_job_kobo: number;
  inspection_fee_bands: { max_km: number; fee_kobo: number }[];
  services: Record<string, string>;
  addons: { code: string; label: string; price_kobo: number }[];
  plans: { slug: string; name: string; blurb: string | null; visits_per_month: number; deep_every_months: number | null; discount_pct: number; custom: boolean }[];
  bundle_discount_pct: number;
  hotline: string | null;
  whatsapp: string | null;
};

export async function getCleaningInfo(): Promise<CleaningInfo | null> {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
    const { data, error } = await createPublicClient().rpc("cleaning_public_info" as never);
    if (error || !data) return null;
    return data as unknown as CleaningInfo;
  } catch {
    return null;
  }
}

export type CleaningServicePage = {
  slug: string;
  service: string; // rate card service code
  name: string;
  title: string;
  h1: string;
  description: string;
  keywords: string[];
  intro: string;
  includes: string[];
  goodFor: string[];
  faqs: { q: string; a: string }[];
};

export const CLEANING_SERVICE_PAGES: CleaningServicePage[] = [
  {
    slug: "deep-cleaning", service: "deep", name: "Deep cleaning",
    title: "Deep Cleaning Services in Awka",
    h1: "Deep cleaning in Awka",
    description: "Professional deep cleaning for homes and flats in Awka: kitchens, toilets, tiles, cabinets, fans and corners. Clear prices, trained crews, we bring the supplies.",
    keywords: ["deep cleaning Awka", "deep cleaning services Awka", "house deep cleaning Anambra", "kitchen deep cleaning Awka"],
    intro: "A deep clean reaches what weekly cleaning misses: grease on the cooker and walls, stains in the toilet and bathroom tiles, dust on fans and louvres, and the corners behind furniture. We do it room by room with a checklist, and you sign off before we leave.",
    includes: ["Kitchen degreasing: cooker top, tiles, sink, cabinet fronts", "Toilets and bathrooms scrubbed and descaled", "Floors scrubbed, skirting and corners", "Fans, louvres, switches and door handles wiped", "Windows and burglary proof (inside and ground floor outside)", "Wardrobe and cabinet fronts", "Before and after photos for our quality check"],
    goodFor: ["Homes that have not had a proper clean in months", "Before a visit, a celebration or Christmas", "The first visit of every monthly plan"],
    faqs: [
      { q: "How long does a deep clean take?", a: "A 2-bedroom flat usually takes a crew of two about four hours. Your quote shows the crew size and the time." },
      { q: "Do you bring cleaning supplies?", a: "Yes. We bring our own detergents, disinfectant, brushes, mops and buckets. We only ask that water is available." },
      { q: "Can you do inside the fridge and oven?", a: "Yes, as add-ons. They are listed with their price when you request a quote." },
    ],
  },
  {
    slug: "post-construction-cleaning", service: "post_construction", name: "Post-construction cleaning",
    title: "Post-Construction Cleaning in Awka",
    h1: "Post-construction and after-painting cleaning in Awka",
    description: "After building, renovation or painting in Awka, we remove dust, cement and paint spots from floors, tiles, windows and fittings so you can move in.",
    keywords: ["post construction cleaning Awka", "after building cleaning Awka", "after painting cleaning Awka", "renovation cleaning Anambra"],
    intro: "Builders leave dust in every corner, cement on tiles and paint on windows and switches. We clean new and renovated buildings so they are ready to live in, rent out or hand over.",
    includes: ["Dust removal from walls, ceilings, fans and fittings", "Cement and paint spots lifted from tiles and glass", "Windows, frames and burglary proof", "Kitchen and bathroom fittings polished", "Floors scrubbed and mopped", "Rubbish bagged and taken to the building's bin point"],
    goodFor: ["New houses before the first tenant", "Flats after painting or tiling", "Landlords handing over to tenants"],
    faqs: [
      { q: "Do you need to inspect first?", a: "Usually yes. Building sites vary a lot, so we visit, measure and quote. The inspection fee is taken off your clean if you book." },
      { q: "Do you remove building rubble?", a: "We bag dust and light debris. Heavy rubble, blocks and leftover materials need to be cleared by the builder first." },
    ],
  },
  {
    slug: "move-in-move-out-cleaning", service: "move", name: "Move-in and move-out cleaning",
    title: "Move-In and Move-Out Cleaning in Awka",
    h1: "Move-in and move-out cleaning in Awka",
    description: "Moving house in Awka? We clean empty flats top to bottom before you move in or after you move out, inside cabinets and wardrobes too.",
    keywords: ["move in cleaning Awka", "move out cleaning Awka", "end of tenancy cleaning Awka", "empty house cleaning Awka"],
    intro: "An empty home is the best time to clean properly. We clean inside every cabinet, wardrobe and drawer, wash down the kitchen and bathrooms, and leave the place ready for the next person.",
    includes: ["Inside cabinets, wardrobes and drawers", "Kitchen and bathrooms deep cleaned", "Walls spot-cleaned where marked", "Windows, nets and burglary proof", "Floors scrubbed and mopped", "Before and after photos for our quality check"],
    goodFor: ["Tenants getting their caution fee back", "Landlords and agents between tenants", "Students moving in or out of lodges"],
    faqs: [
      { q: "Does the house need to be empty?", a: "It works best empty. If some furniture is still there, tell us and we will plan around it." },
      { q: "Can the landlord or agent pay?", a: "Yes. Anyone can pay the quote online, or at our Ifite hub." },
    ],
  },
  {
    slug: "office-cleaning", service: "office", name: "Office cleaning",
    title: "Office Cleaning Services in Awka",
    h1: "Office and shop cleaning in Awka",
    description: "Office, shop and clinic cleaning in Awka: one-off or on a monthly plan, at times that do not disrupt your work. Clear monthly price.",
    keywords: ["office cleaning Awka", "office cleaning services Awka", "commercial cleaning Awka", "shop cleaning Awka"],
    intro: "A clean office makes a better impression and a healthier team. We clean offices, shops, salons and clinics in Awka once, or on a weekly plan with a fixed monthly price.",
    includes: ["Desks, chairs and reception wiped", "Floors swept, mopped or scrubbed", "Toilets and kitchenette cleaned and restocked with your supplies", "Bins emptied", "Glass doors and windows", "Early morning or weekend visits on request"],
    goodFor: ["Offices on Zik Avenue, Aroma and around the secretariat", "Banks, schools, churches and clinics", "Shops and salons that need a weekly clean"],
    faqs: [
      { q: "Can you clean before we open?", a: "Yes. Tell us your opening time and we will schedule the crew to finish before it." },
      { q: "Do you give a monthly invoice?", a: "Yes. Office plans have one monthly price, paid online or at the hub." },
    ],
  },
  {
    slug: "shortlet-cleaning", service: "shortlet", name: "Shortlet and Airbnb cleaning",
    title: "Shortlet and Airbnb Cleaning in Awka",
    h1: "Shortlet and Airbnb turnover cleaning in Awka",
    description: "Fast turnover cleaning for shortlet apartments and Airbnbs in Awka, with fresh linen from our laundry. Book per guest or on a monthly plan.",
    keywords: ["shortlet cleaning Awka", "Airbnb cleaning Awka", "apartment turnover cleaning Awka", "shortlet laundry Awka"],
    intro: "Between guests you need the apartment spotless, the beds made with fresh linen, and the bathroom shining. We clean and reset your shortlet, and our laundry washes the sheets and towels.",
    includes: ["Bedrooms reset, beds made", "Kitchen and dishes cleaned", "Bathroom cleaned, towels replaced", "Floors and surfaces", "Bins emptied", "Sheets and towels washed by our laundry (Home Complete)"],
    goodFor: ["Shortlet and Airbnb hosts", "Serviced apartments", "Guest houses"],
    faqs: [
      { q: "Can you clean the same day a guest leaves?", a: "Usually yes, if you book ahead. A monthly plan keeps a regular slot for you." },
      { q: "Do you wash the linen?", a: "Yes. With Home Complete, our laundry collects the used linen and returns it clean, with free pickup and delivery." },
    ],
  },
  {
    slug: "after-party-cleaning", service: "after_event", name: "After-party and event cleaning",
    title: "After-Party and Event Cleaning in Awka",
    h1: "After-party and event cleaning in Awka",
    description: "After a party, burial reception, naming ceremony or event in Awka, we clean the house or venue so you can rest.",
    keywords: ["after party cleaning Awka", "event cleaning Awka", "post event cleaning Anambra", "house cleaning after party Awka"],
    intro: "After the guests leave, the last thing you want is a long clean-up. We collect rubbish, wash floors, clean kitchens and toilets, and put the house back in order.",
    includes: ["Rubbish collected and bagged", "Kitchen, plates and pots area cleaned", "Toilets cleaned and disinfected", "Floors swept and mopped", "Compound swept (add-on)", "Chairs and tables wiped"],
    goodFor: ["Birthday and wedding parties at home", "Naming ceremonies and burial receptions", "Church and hall events"],
    faqs: [
      { q: "Can you come the morning after?", a: "Yes. Book ahead with the date and we hold the crew for you." },
      { q: "Do you clean outdoor areas?", a: "Yes. Compound sweeping is an add-on." },
    ],
  },
];

// Places with a house-cleaning page. Coordinates come from AREA_PAGES.
export const CLEANING_AREA_SLUGS = ["awka", "ifite", "unizik", "temp-site", "aroma", "amawbia"];

export const CLEANING_AREA_TEXT: Record<string, string> = {
  awka: "We clean homes and offices across Awka town, from Zik Avenue, Kwata and Regina Caeli to Club Road and Eke Awka.",
  ifite: "Our hub is in Ifite, so crews reach Ifite homes, estates and lodges quickly, and plan visits here are the easiest to schedule.",
  unizik: "Students, lecturers and lodge owners around Nnamdi Azikiwe University book us for move-in cleans, end-of-session cleans and weekly lodge cleaning.",
  "temp-site": "Temp Site lodges, flats and shops get regular and one-off cleaning. Lodge owners can put the whole building on one monthly plan.",
  aroma: "Homes and offices around Aroma junction, Secretariat Road and Maduka Street book deep cleans and weekly office cleaning.",
  amawbia: "Families and government staff in Amawbia book deep cleans, post-construction cleans for new houses, and monthly plans.",
};

export const CLEANING_GENERAL_FAQS: { q: string; a: string }[] = [
  { q: "How do I get a price?", a: "Request a quote online or call or WhatsApp 0913 258 4627. For small homes we can quote from photos. For larger jobs we inspect first, and the inspection fee is taken off your clean when you book." },
  { q: "Do you bring your own supplies?", a: "Yes. Crews bring detergents, disinfectant, brushes, mops and buckets. Please make sure water is available." },
  { q: "How do I pay?", a: "Online with card, transfer or USSD through Paystack or Flutterwave, or at our Ifite hub. You never pay cash to the crew." },
  { q: "How do I know the crew is ours?", a: "When the crew lead arrives, you give them a 4-digit arrival code from your account. When they finish and you are happy, you give a completion code." },
  { q: "What if something is missed?", a: "Tell us within 24 hours with a photo and we come back to fix it at no cost." },
  { q: "Do you offer fumigation?", a: "No. We do cleaning only, not fumigation or pest control." },
];
