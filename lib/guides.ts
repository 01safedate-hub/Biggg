/**
 * Helpful articles that answer what people in Awka search for. Prices are never typed here:
 * a section with `live` renders the current prices or plans from the database, so the text stays true
 * when prices change in admin.
 */
export type GuideSection = {
  h2: string;
  p?: string[];
  list?: string[];
  /** "prices:Item A|Item B" shows a live price table for those items; "plans" shows the live monthly plans;
   *  "cleaning" shows live cleaning guide prices; "cleaning-plans" shows the cleaning plans. */
  live?: string;
};

export type Guide = {
  slug: string;
  title: string; // <title> and card heading
  h1: string;
  description: string; // meta description, about 150 characters
  keywords: string[];
  published: string; // ISO date
  intro: string;
  sections: GuideSection[];
  faqs: { q: string; a: string }[];
  areas: string[]; // AREA_PAGES slugs to link
  topic?: "laundry" | "cleaning"; // defaults to laundry
};

const EVERYDAY = "prices:T-shirt|Shirt|Polo|Trousers|Jeans|Skirt|Gown|Underwear|Socks, pair|Towel|Bedsheet";
const SPECIAL = "prices:Senator set|Kaftan|Agbada|Iro and buba|Lace gown|Blazer|Suit, 2 piece|Suit, 3 piece|Wedding gown|Duvet|Curtain panel";

export const GUIDES: Guide[] = [
  {
    slug: "cheap-laundry-in-awka",
    title: "Cheap Laundry in Awka: Real Prices Per Item",
    h1: "Cheap laundry in Awka: what you really pay",
    description: "Affordable laundry in Awka with clear prices per item, monthly plans that cut the cost per piece, and pickup fares you see before paying.",
    keywords: ["cheap laundry in Awka", "affordable laundry Awka", "laundry prices Awka", "laundry price list Awka"],
    published: "2026-11-11",
    intro: "Cheap laundry is not only a low price per shirt. It is a fair price, no surprise charges, and clothes that come back complete. Here is exactly what LaundryPoint charges, and how to pay even less.",
    sections: [
      { h2: "Our price per item", p: ["Every item has one fixed price, shown in your bill before you pay. Washing, drying, ironing and folding are included."], live: EVERYDAY },
      { h2: "Pay less with a monthly plan", p: ["If you wash every week, a monthly plan is the cheapest way. You pay once for a set number of pieces and use them across the month. The cost per piece is usually far below the single-item price."], live: "plans" },
      { h2: "Five ways to keep your laundry bill low", list: [
        "Drop off at our Ifite hub and collect free, so you pay no transport fare.",
        "Book one bigger pickup instead of many small ones, because the fare is per trip, not per item.",
        "Choose ironing only for clothes that are already clean.",
        "Students can use a student plan (a student ID is needed).",
        "Lodges, hostels and businesses can ask for a custom rate on one prepaid bill.",
      ] },
      { h2: "No hidden charges", p: ["Your clothes are counted with you at pickup, and the count is photographed. You see the bill on your phone and pay online. Agents never collect cash, so the price you see is the price you pay."] },
    ],
    faqs: [
      { q: "What is the cheapest laundry option in Awka?", a: "A monthly plan gives the lowest cost per piece. If you only wash now and then, drop your clothes at our Ifite hub and collect them yourself, so you pay only for the items." },
      { q: "Do you charge for pickup?", a: "Yes, a transport fare that depends on the distance from our hub. You see it before you pay. Dropping off and collecting at the hub is free." },
      { q: "Is ironing included in the price?", a: "Yes. The item price covers washing, drying, ironing and folding." },
    ],
    areas: ["awka", "ifite", "temp-site", "unizik"],
  },
  {
    slug: "laundry-pickup-and-delivery-awka",
    title: "Laundry Pickup and Delivery in Awka: How It Works",
    h1: "Laundry pickup and drop-off in Awka",
    description: "Book a laundry pickup anywhere within about 15 km of Ifite. We count your clothes with you, wash and iron them, and deliver them back.",
    keywords: ["laundry pickup and delivery Awka", "laundry that picks up Awka", "laundry drop off Awka", "door to door laundry Awka"],
    published: "2026-11-11",
    intro: "You should not have to carry a heavy bag across Awka to get your clothes washed. LaundryPoint picks up from your home, lodge or office and brings everything back clean.",
    sections: [
      { h2: "How a pickup works", list: [
        "Book on the website or on WhatsApp and pay the transport fare. You see the amount first.",
        "An agent arrives and shows a 4-digit arrival code, so you know the agent is ours.",
        "We count your clothes with you and photograph the count. The bill comes to your phone.",
        "We wash, dry and iron everything at our Ifite hub, in our own machines.",
        "We deliver it back and you confirm with a delivery code. Or you collect it free at the hub.",
      ] },
      { h2: "Where we pick up", p: ["We cover Awka and the towns around it, about 15 km from our hub in Ifite. That includes Ifite, Unizik, Temp Site, Aroma, Amikwo, Amawbia, Okpuno, Nibo, Nise, Isiagu, Amansea, Mbaukwu and Achalla. The booking page checks your exact address for you."] },
      { h2: "How the fare is worked out", p: ["The fare depends on the road distance from our hub to you. Places close to Ifite pay the least. Each area page shows the live fare for that area, and the booking page shows the exact fare for your address before you pay."] },
      { h2: "Why it is safer than handing clothes to a stranger", p: ["Three codes protect every order: one when the agent arrives, one to confirm the count, and one at delivery. Each code works only once. You always have a record of what you handed over and what came back."] },
    ],
    faqs: [
      { q: "Do you offer laundry pickup and drop-off in Awka?", a: "Yes. We pick up and deliver anywhere within about 15 km of our Ifite hub, and you can also drop off and collect at the hub yourself." },
      { q: "Can I book after closing time?", a: "Yes. Book any time and the pickup is scheduled for the next working morning." },
      { q: "Do I need to be at home for the pickup?", a: "Someone needs to meet the agent to enter the arrival code and confirm the count. It can be anyone you trust." },
    ],
    areas: ["awka", "aroma", "amawbia", "amikwo", "okpuno", "nibo"],
  },
  {
    slug: "best-laundry-in-awka",
    title: "How to Choose the Best Laundry in Awka",
    h1: "How to choose the best laundry in Awka",
    description: "Seven things to check before you trust a laundry in Awka with your clothes: counting, drying, speed, prices, pickup, safety and a real shop.",
    keywords: ["best laundry in Awka", "best laundry service Awka", "good laundry in Awka", "reliable laundry Awka", "laundry near me Awka"],
    published: "2026-11-11",
    intro: "Most people have a story about a missing shirt or clothes that came back smelling damp. Before you choose a laundry in Awka, check these seven things. We built LaundryPoint around them.",
    sections: [
      { h2: "1. They count your clothes with you", p: ["A good laundry counts every piece in front of you and gives you a record. At LaundryPoint the count is photographed and sent to your phone, so nothing goes missing."] },
      { h2: "2. They do not depend on sunshine", p: ["Clothes dried on a line wait for the weather and can come back damp or dusty, especially in the rainy season. We wash and dry with our own machines, so clothes come back fresh and on time."] },
      { h2: "3. They tell you when it will be ready", p: ["Ask how long it takes and whether they can rush an order. Speed is our focus, and instant service is available for selected items."] },
      { h2: "4. The price is clear before you pay", p: ["Look for a fixed price per item and no surprise charges. Our prices are published, and the bill is on your phone before you pay. See our cheap laundry guide for the full price list."] },
      { h2: "5. They come to you", p: ["Pickup and delivery saves you hours. Check how far they go and how the fare is worked out. We cover about 15 km around Ifite and show the fare first."] },
      { h2: "6. Handover is safe", p: ["Who is the person collecting your clothes? Our agents show an arrival code, and a second and third code confirm the count and the delivery."] },
      { h2: "7. There is a real shop you can visit", p: ["A laundry with a real address is accountable. Our hub is in D-Pikin's Luxury Apartment, Flat B2, opposite Wennys Plaza, Book Foundation, Ifite, Awka. Walk in any time we are open."] },
    ],
    faqs: [
      { q: "What should I look for in a laundry in Awka?", a: "Counting with a record, machine drying, a clear price per item, a clear ready time, safe pickup and a real shop you can visit." },
      { q: "Where is LaundryPoint?", a: "D-Pikin's Luxury Apartment, Flat B2, opposite Wennys Plaza, Book Foundation, Ifite, Awka, Anambra." },
    ],
    areas: ["awka", "ifite", "aroma", "temp-site"],
  },
  {
    slug: "laundry-near-unizik",
    title: "Laundry Near Unizik for Students and Lodges",
    h1: "Laundry near Unizik for students and lodges",
    description: "Student laundry near Nnamdi Azikiwe University: pickup from hostels and lodges in Ifite and Temp Site, student plans and custom rates for lodges.",
    keywords: ["laundry near Unizik", "Unizik laundry", "student laundry Awka", "laundry Ifite", "laundry Temp Site Awka", "lodge laundry Awka"],
    published: "2026-11-11",
    intro: "Lectures, tests and power cuts leave little time for washing. Our hub is in Ifite, a short ride from the Unizik gate, so students get some of our quickest pickups.",
    sections: [
      { h2: "Student plans", p: ["Student plans cover uniforms and school wear for a fixed monthly price, and you need a student ID. Drop off at the hub, or book a paid pickup from your lodge."], live: "plans" },
      { h2: "Lodges and hostels: one bill for everyone", p: ["Lodge owners and managers can set up a custom account. Each tenant's clothes are counted and recorded under their name, the whole building pays one prepaid bill, and each tenant can confirm their own items."] },
      { h2: "Where we collect around campus", p: ["Ifite, the Unizik hostels, Temp Site and Unizik junction, Okpuno, and the lodges off Oby Okoli Avenue and Abakaliki Street. If you are not sure, the booking page checks your address."] },
    ],
    faqs: [
      { q: "Do you pick up from Unizik hostels and lodges?", a: "Yes. We pick up from hostels and off-campus lodges in Ifite, Temp Site and around Unizik junction." },
      { q: "Is there a student discount?", a: "Yes. Student plans are cheaper per piece. You need a valid student ID." },
    ],
    areas: ["unizik", "ifite", "temp-site", "okpuno"],
  },
  {
    slug: "dry-cleaning-in-awka",
    title: "Dry Cleaning in Awka: Suits, Native Wear and Gowns",
    h1: "Dry cleaning in Awka for suits, native wear and gowns",
    description: "Dry cleaning and careful washing in Awka for suits, senator sets, agbada, lace, wedding gowns and duvets, with pickup and delivery and clear prices.",
    keywords: ["dry cleaning Awka", "dry cleaner in Awka", "suit cleaning Awka", "native wear cleaning Awka", "wedding gown cleaning Awka"],
    published: "2026-11-11",
    intro: "Your best clothes need more care than a quick wash. We handle suits, native wear, lace and gowns gently, and press them so they are ready to wear.",
    sections: [
      { h2: "Prices for special items", p: ["These are our current prices. Each price covers cleaning and pressing."], live: SPECIAL },
      { h2: "How we care for delicate clothes", list: [
        "We sort by fabric and colour before washing, so colours do not bleed.",
        "Lace, beads and embroidery get gentle treatment.",
        "Suits and native wear are pressed and returned on hangers or neatly folded.",
        "Tell us about any stain when we collect, so we can treat it first.",
      ] },
      { h2: "Before a wedding or event", p: ["Book a few days early for aso-ebi, lace and gowns. If you are short on time, ask about instant service for selected items."] },
    ],
    faqs: [
      { q: "Do you dry clean suits and agbada in Awka?", a: "Yes. We clean and press suits, senator sets, agbada, kaftans, lace and gowns, with pickup and delivery." },
      { q: "Can you clean a wedding gown?", a: "Yes. Wedding gowns get special care. The current price is in the table on this page." },
    ],
    areas: ["awka", "amawbia", "aroma", "amikwo"],
  },
  {
    slug: "laundry-for-hotels-lodges-and-businesses-awka",
    title: "Laundry for Hotels, Lodges and Businesses in Awka",
    h1: "Laundry for hotels, lodges, salons and offices in Awka",
    description: "Bulk laundry for hotels, guest houses, lodges, salons and offices in Awka: custom rates, one prepaid bill, regular pickups and itemised records.",
    keywords: ["hotel laundry Awka", "commercial laundry Awka", "bulk laundry Awka", "laundry for business Awka", "guest house laundry Awka"],
    published: "2026-11-11",
    intro: "Bedsheets, towels and uniforms pile up fast in a business. We take the whole load on a schedule, keep an itemised record, and bill you once.",
    sections: [
      { h2: "How a business account works", list: [
        "We agree a custom rate for your items, such as bedsheets, towels and uniforms.",
        "You prepay into one account, and each batch is drawn from it.",
        "Every batch is counted and recorded, and the manager confirms it on their phone.",
        "We collect on a regular schedule and bring everything back clean and folded.",
      ] },
      { h2: "Who it is for", p: ["Hotels, guest houses, short-let apartments, student lodges, salons and spas, restaurants, clinics, schools and offices across Awka, Amawbia and the towns around."] },
      { h2: "Or start with a business plan", p: ["If you prefer a fixed monthly price, the Business plan includes pieces and pickups each month."], live: "plans" },
    ],
    faqs: [
      { q: "Do you do bulk laundry for hotels in Awka?", a: "Yes. We set a custom rate, collect on a schedule, and bill one prepaid account with an itemised record of every batch." },
      { q: "Can different people in my business confirm their items?", a: "Yes. The manager can confirm a whole batch, or each member can confirm their own items." },
    ],
    areas: ["awka", "amawbia", "aroma", "temp-site"],
  },
  {
    slug: "rainy-season-laundry-awka",
    title: "Rainy Season Laundry in Awka: No More Damp Clothes",
    h1: "Rainy season laundry in Awka: no more damp clothes",
    description: "Clothes that will not dry and smell damp in the rainy season? Here is how to avoid mildew at home, and how machine drying in Awka solves it.",
    keywords: ["rainy season laundry Awka", "clothes not drying", "damp clothes smell", "machine drying Awka"],
    published: "2026-11-11",
    intro: "From about April to October, clothes on the line in Awka can take days to dry and often come back smelling damp. Here is what helps.",
    sections: [
      { h2: "Why damp clothes smell", p: ["When clothes stay wet for too long, mildew starts to grow in the fabric. That is the sour smell, and it can return every time the clothes get warm."] },
      { h2: "Tips if you dry at home", list: [
        "Wash smaller loads and spin them well, so less water is left in the fabric.",
        "Hang clothes with space between them, where air moves.",
        "Do not fold or pack clothes until they are completely dry.",
        "Re-wash anything that already smells. Perfume only hides the smell.",
      ] },
      { h2: "Or let machines do the drying", p: ["We wash and dry every order in our own machines, so the weather does not decide when your clothes are ready. They come back fully dry, ironed and fresh, rain or shine."] },
    ],
    faqs: [
      { q: "How do I stop clothes smelling damp in the rainy season?", a: "Dry them completely and quickly, with air moving between them, and never store them damp. Machine drying is the most reliable way." },
      { q: "Do you dry clothes in the sun?", a: "No. We dry everything in our own machines, so your clothes are ready on time whatever the weather." },
    ],
    areas: ["awka", "ifite", "nibo", "nise"],
  },
  {
    slug: "how-to-care-for-ankara-and-lace",
    title: "How to Care for Ankara, Lace and Native Wear",
    h1: "How to keep Ankara, lace and native wear looking new",
    description: "Simple care tips to stop Ankara fading, keep lace soft and protect embroidery on native wear, plus when to hand it to a professional laundry.",
    keywords: ["how to wash Ankara", "how to wash lace", "native wear care", "stop Ankara fading"],
    published: "2026-11-11",
    intro: "Ankara, lace and native wear are often the most expensive clothes we own. A few habits keep them bright for years.",
    sections: [
      { h2: "Ankara and other wax prints", list: [
        "Wash it inside out in cool water, so the colour stays bright.",
        "Wash it with similar colours for the first few washes.",
        "Use a mild detergent and do not soak it for long.",
        "Dry it out of direct sun, and iron it on the reverse side.",
      ] },
      { h2: "Lace and embroidered pieces", list: [
        "Wash by hand or on a gentle cycle, and never wring it.",
        "Treat stains early and do not scrub hard.",
        "Iron on low heat with a cloth between the iron and the lace.",
      ] },
      { h2: "When to hand it over", p: ["For agbada, heavy embroidery, beaded lace and wedding outfits, a professional clean is safer. We sort by fabric and colour and press each piece. See our dry cleaning guide for current prices."] },
    ],
    faqs: [
      { q: "How do I stop Ankara from fading?", a: "Wash it inside out in cool water with mild detergent, avoid long soaking, and dry it away from direct sun." },
      { q: "Can lace go in a washing machine?", a: "Only on a gentle cycle in a mesh bag. Hand washing is safer, and beaded lace is best cleaned professionally." },
    ],
    areas: ["awka", "amawbia", "ifite"],
  },

  // ---------- Cleaning guides ----------
  {
    slug: "house-cleaning-cost-in-awka",
    topic: "cleaning",
    title: "How Much Does House Cleaning Cost in Awka?",
    h1: "How much does house cleaning cost in Awka?",
    description: "Real house cleaning prices in Awka for self-contains, flats and duplexes: standard and deep cleaning, what changes the price, and how monthly plans save money.",
    keywords: ["house cleaning cost Awka", "cleaning prices Awka", "how much is deep cleaning in Awka", "cleaning service price Anambra"],
    published: "2026-11-13",
    intro: "Cleaning prices in Awka vary a lot, and many cleaners only give a figure at the door. Here is how we price, what a typical home costs, and how to pay less.",
    sections: [
      { h2: "Guide prices", p: ["These are our current starting prices for homes in normal condition. Your quote lists every room."], live: "cleaning" },
      { h2: "What changes the price", list: ["The number of rooms, kitchens and toilets", "Standard or deep clean (a deep clean takes about 70% longer)", "The condition: light, normal or heavy", "Add-ons such as inside the fridge or oven, sofa seats and mattresses", "Crew transport from our Ifite hub, by distance"] },
      { h2: "How to pay less", p: ["A monthly plan is the cheapest way to keep a home clean. Every plan starts with a deep clean, then each regular visit is quicker and discounted."], live: "cleaning-plans" },
      { h2: "Do you need an inspection?", p: ["Small homes can be quoted from photos or a short WhatsApp video call, free. Large, dirty or unusual jobs need a visit first. The inspection fee depends on distance and is taken off your clean when you book."] },
    ],
    faqs: [
      { q: "Do I pay before the clean?", a: "Yes. You accept the quote, pick a day and pay online or at our hub. Big jobs can be booked with a deposit." },
      { q: "Is transport extra?", a: "Yes. Crew transport is shown as its own line on your quote, worked out by distance from our Ifite hub." },
    ],
    areas: ["awka", "ifite", "amawbia"],
  },
  {
    slug: "deep-cleaning-checklist",
    topic: "cleaning",
    title: "Deep Cleaning Checklist for Nigerian Homes",
    h1: "A deep cleaning checklist for homes in Nigeria",
    description: "A room-by-room deep cleaning checklist for Nigerian homes: kitchen grease, toilet stains, louvres, fans, tiles and the corners people forget.",
    keywords: ["deep cleaning checklist", "house deep cleaning Nigeria", "how to deep clean a house", "deep cleaning Awka"],
    published: "2026-11-13",
    intro: "Dust, harmattan haze and cooking oil build up fast. Use this checklist to deep clean yourself, or to know what a professional deep clean should include.",
    sections: [
      { h2: "Kitchen", list: ["Degrease the cooker top, the wall behind it and the extractor", "Wipe cabinet fronts and handles", "Scrub the sink and taps, clear the drain", "Clean inside the fridge (throw out old food first)", "Mop under and behind movable items"] },
      { h2: "Toilets and bathrooms", list: ["Descale the toilet bowl and under the rim", "Scrub tiles and grout", "Clean the shower head, taps and mirror", "Disinfect handles, switches and the flush"] },
      { h2: "Bedrooms and living room", list: ["Dust ceiling fans and the tops of wardrobes", "Wipe louvres, frames and burglary proof", "Vacuum or beat rugs, wipe skirting", "Move furniture and clean behind it", "Wipe switches, sockets and door handles"] },
      { h2: "Let us do it", p: ["Our deep clean follows this list room by room, with our own supplies."], live: "cleaning" },
    ],
    faqs: [
      { q: "How often should I deep clean?", a: "Every three months is a good rhythm. Our Care 4+ plan includes one every third month." },
      { q: "What should I do before the cleaners arrive?", a: "Put away valuables and loose items, and make sure there is water. We bring everything else." },
    ],
    areas: ["awka", "ifite", "aroma"],
  },
  {
    slug: "cleaning-after-building-or-painting",
    topic: "cleaning",
    title: "Cleaning a New House After Building or Painting",
    h1: "Cleaning a new house after building or painting",
    description: "How to clean a new or renovated house in Awka: cement on tiles, paint on glass, dust in every corner, and when to call a post-construction cleaning crew.",
    keywords: ["post construction cleaning", "cleaning after painting", "new house cleaning Awka", "remove cement from tiles"],
    published: "2026-11-13",
    intro: "A new building is never clean when the builders leave. Fine dust settles for days, and cement and paint spots set hard. Here is how to tackle it.",
    sections: [
      { h2: "Before you start", list: ["Ask the builder to remove blocks, rubble and leftover materials", "Make sure water is connected", "Open all windows to let dust out"] },
      { h2: "Work from top to bottom", list: ["Dust ceilings, fans and light fittings first", "Then walls, frames and burglary proof", "Then counters and fittings", "Floors last, swept then mopped twice"] },
      { h2: "Cement, paint and stickers", p: ["Soften cement spots with water before scraping, so you do not scratch tiles. Lift paint from glass with a flat blade held low. Peel stickers off fittings and clean the glue with a little oil."] },
      { h2: "When to call a crew", p: ["Whole buildings and several flats are faster with a trained crew. We inspect, quote and clean so the place is ready for tenants."], live: "cleaning" },
    ],
    faqs: [
      { q: "How long after painting should I clean?", a: "Wait at least two days for paint to dry fully before washing walls or frames." },
      { q: "Do you clean whole buildings?", a: "Yes. Landlords and developers can book several flats on one quote." },
    ],
    areas: ["amawbia", "awka", "temp-site"],
  },
  {
    slug: "move-out-cleaning-caution-fee",
    topic: "cleaning",
    title: "Move-Out Cleaning: How to Get Your Caution Fee Back",
    h1: "Move-out cleaning: how to get your caution fee back",
    description: "Moving out of a flat or lodge in Awka? This move-out cleaning checklist helps you hand the place back clean and get your caution fee.",
    keywords: ["move out cleaning Awka", "caution fee refund", "end of tenancy cleaning", "lodge cleaning Unizik"],
    published: "2026-11-13",
    intro: "Landlords and agents in Awka often keep part of the caution fee for cleaning. A proper move-out clean, with photos, makes that much harder.",
    sections: [
      { h2: "What landlords check", list: ["Kitchen grease and the cooker area", "Toilet and bathroom stains", "Marks on walls and doors", "Inside wardrobes and cabinets", "Windows, nets and louvres"] },
      { h2: "Take your own photos", p: ["When the clean is done, take clear photos of every room before you hand over the keys. Send them to the landlord or agent the same day."] },
      { h2: "Book a move-out clean", p: ["We clean empty homes top to bottom, inside every cabinet and wardrobe."], live: "cleaning" },
    ],
    faqs: [
      { q: "Can my landlord pay for the clean?", a: "Yes. Anyone can pay the quote online or at our Ifite hub." },
      { q: "Do you clean student lodges?", a: "Yes, around Unizik, Ifite and Temp Site. Lodge owners can also book the whole building." },
    ],
    areas: ["unizik", "temp-site", "ifite"],
  },
  {
    slug: "weekly-cleaning-plan-or-house-help",
    topic: "cleaning",
    title: "Weekly Cleaning Plan or a House Help: Which Is Better?",
    h1: "A weekly cleaning plan or a house help: which is better?",
    description: "Comparing a live-in or daily house help with a weekly professional cleaning plan in Awka: cost, reliability, trust and what each is good for.",
    keywords: ["house help Awka", "weekly cleaner Awka", "cleaning plan vs house help", "regular house cleaning Awka"],
    published: "2026-11-13",
    intro: "Many families in Awka rely on a house help. Others want a clean home without someone living in. Here is an honest comparison.",
    sections: [
      { h2: "A house help", list: ["Daily help with cleaning, cooking and children", "Feeding, accommodation and monthly pay", "You train and supervise them", "Cover is hard when they travel or leave"] },
      { h2: "A weekly cleaning plan", list: ["A trained crew on the same day each week", "One fixed monthly price, no feeding or accommodation", "Checklist, arrival and completion codes", "If we cancel a visit, you get a free credit visit", "Pause when you travel"] },
      { h2: "Our plans", p: ["Plans start with a deep clean and then visit weekly or every two weeks."], live: "cleaning-plans" },
    ],
    faqs: [
      { q: "Can I have both?", a: "Yes. Many homes book a weekly clean so the house help can focus on children and cooking." },
      { q: "Do you do laundry too?", a: "Yes. Home Complete adds laundry with free pickup and delivery to your cleaning plan." },
    ],
    areas: ["awka", "ifite", "amawbia"],
  },
  {
    slug: "office-cleaning-checklist",
    topic: "cleaning",
    title: "Office Cleaning Checklist for Businesses in Awka",
    h1: "An office cleaning checklist for businesses in Awka",
    description: "Daily, weekly and monthly office cleaning tasks for offices, shops and clinics in Awka, and how a monthly office cleaning plan works.",
    keywords: ["office cleaning checklist", "office cleaning Awka", "commercial cleaning Awka", "shop cleaning Awka"],
    published: "2026-11-13",
    intro: "Customers notice a dusty reception and a dirty toilet straight away. Use this checklist to keep your office or shop presentable.",
    sections: [
      { h2: "Every day", list: ["Empty bins", "Wipe reception and desks", "Clean the toilet and wash-hand basin", "Sweep the entrance"] },
      { h2: "Every week", list: ["Mop all floors", "Wipe doors, handles and switches", "Clean glass doors and windows", "Clean the kitchenette and fridge"] },
      { h2: "Every month or quarter", list: ["Dust fans, AC vents and high shelves", "Scrub toilet tiles", "Clean chairs and sofas", "Deep clean the kitchenette"] },
      { h2: "Hand it to us", p: ["Our office plans cover the weekly list on a fixed monthly price, early morning or weekends if you prefer."], live: "cleaning-plans" },
    ],
    faqs: [
      { q: "Can you clean outside working hours?", a: "Yes. Tell us your opening time and we schedule the crew to finish before it." },
      { q: "Do you supply toilet rolls and soap?", a: "We bring cleaning supplies. Consumables like toilet rolls and hand soap stay your own." },
    ],
    areas: ["aroma", "awka", "amawbia"],
  },
];

export const findGuide = (slug: string) => GUIDES.find((g) => g.slug === slug);
