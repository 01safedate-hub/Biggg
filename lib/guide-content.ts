// Text for the in-app guides. Each step points at a menu item (href) so the guide can highlight it.
// Steps for pages a person cannot open are hidden automatically.

export type GuideStep = {
  id: string;
  title: string;
  href?: string; // menu item to highlight and the page to open
  alt?: string[]; // other hrefs that count as the same page (e.g. plans vs manage plan)
  target?: string; // highlight something other than a menu item (data-guide value)
  body: string[];
  points?: string[];
  tip?: string;
  always?: boolean; // show even when the page is not in this person's menu
};

export type GuideChapter = { id: string; title: string; summary: string; roles: string[] | "all"; steps: GuideStep[] };

// ---------------- Customers ----------------
export const CUSTOMER_STEPS: GuideStep[] = [
  {
    id: "welcome", title: "Welcome to LaundryPoint", always: true,
    body: ["This short guide shows you around your account in about two minutes.", "Skip any step, or close it and carry on later. Open it again any time from Getting started in the menu."],
  },
  {
    id: "dashboard", title: "Your dashboard", href: "/dashboard",
    body: ["Your home page. It shows your pickup location, your latest orders and anything waiting for you."],
    tip: "Add your pickup location first so we can tell you prices and send agents to the right place.",
  },
  {
    id: "book", title: "Book a pickup", href: "/request",
    body: ["Ask us to collect your clothes. Pickup and delivery transport is paid online before we send an agent."],
    points: ["On a monthly plan, your clothes count against your plan allowance.", "You can also bring clothes to our Ifite hub yourself."],
  },
  {
    id: "orders", title: "Track your orders", href: "/orders",
    body: ["Follow each order from pickup to delivery."],
    points: [
      "When the agent arrives, they show you a 4-digit code. Enter it in the order so you know it is really them.",
      "The agent counts your clothes and sends you a bill. Check every line, accept it, then pay online.",
      "On delivery, enter the code the agent shows you to confirm you have your clothes.",
    ],
    tip: "Never pay an agent in cash. All payments are online or at the hub.",
  },
  {
    id: "plans", title: "Monthly plans", href: "/subscriptions", alt: ["/subscriptions/manage"],
    body: ["A plan covers a set number of pieces each month, with pickup and delivery included for covered clothes.", "If you already have a plan, this is where you manage it."],
  },
  {
    id: "customs", title: "My customs", href: "/my-customs",
    body: ["Your lodge or business has its own LaundryPoint account and rates. You can see it here."],
  },
  {
    id: "cleaning", title: "House cleaning", href: "/cleaning/my",
    body: ["We also clean homes and offices. Request a quote, choose a day, and pay online."],
    points: ["Give the crew lead your arrival code when they arrive.", "When you are happy with the work, give them your completion code."],
  },
  {
    id: "extra", title: "Extra-clothes bills", href: "/account/extra-clothes",
    body: ["If a plan pickup has more pieces than your plan covers, or items your plan does not include, the bill appears here. Pay it online."],
  },
  {
    id: "settings", title: "Your settings", href: "/account",
    body: ["Your details, pickup location, password and email, and your order history."],
  },
  {
    id: "done", title: "You are all set", always: true, target: "/guide",
    body: ["That is everything. Getting started in the menu shows what you have seen and lets you open any step again.", "Questions? Message us on WhatsApp from any page."],
  },
];

// ---------------- Staff ----------------
const ALL = "all" as const;
const DESK = ["cashier", "secretary", "admin", "super_admin"];
const OFFICE = ["secretary", "admin", "super_admin"];

export const STAFF_CHAPTERS: GuideChapter[] = [
  {
    id: "start", title: "Getting started", roles: ALL,
    summary: "Your home page, details, shifts, leave and savings. Everyone does this chapter first.",
    steps: [
      { id: "welcome", title: "Welcome to the staff app", always: true,
        body: ["This guide walks you through every page you use, one chapter at a time. You only see chapters for your job.", "Skip any step, close the guide and come back later from Staff guide in the menu. Your progress is saved."] },
      { id: "home", title: "Home", href: "/staff",
        body: ["Your starting point. It shows your pay (basic and target-met salary), the weekly team target, and quick links to your main tasks."] },
      { id: "details", title: "My details", href: "/staff/onboarding",
        body: ["Your personal details, NIN, bank account, someone who knows you well, and a live photo. Save and send it for review: you must finish this before you can work."],
        points: ["Your bank account name must match your name, or pay cannot be sent.", "Your photo is private: only the super admin sees it."] },
      { id: "shifts", title: "My shifts and check-in", href: "/staff/my-shifts",
        body: ["Your upcoming shifts and attendance. Check in with GPS when you start."],
        points: ["You must be within 150 metres of your station to check in.", "Turn on location and allow it for this site, or check-in will fail."],
        tip: "Delivery agents only receive jobs after checking in." },
      { id: "leave", title: "Leave and shift swaps", href: "/staff/leave",
        body: ["Ask for leave or swap a shift with a colleague who has the same role."],
        points: ["A swap needs your colleague to accept, then a manager to approve.", "Leave is counted in calendar days and needs approval.", "You can cancel a future request yourself."] },
      { id: "savings", title: "My savings", href: "/staff/savings",
        body: ["Part of your salary is set aside every month and paid back to you in full when you leave. Track it here."] },
      { id: "menu", title: "Arrange your menu", target: "nav-edit", always: true,
        body: ["Put the pages you use most at the top.", "Tap Arrange menu, then pin a page to move it into Pinned, or drag the handle to change the order. On a phone you can use the up and down arrows instead."],
        tip: "Reset to default puts everything back." },
      { id: "guide", title: "Come back any time", href: "/staff/guide", always: true,
        body: ["Staff guide in the menu lists every chapter for your job, with your progress. Open any chapter again, or read it all as text."] },
    ],
  },
  {
    id: "desk", title: "Front desk and orders", roles: DESK,
    summary: "Finding orders, walk-in customers, shelves, customs, pickup calls, counting money and spending.",
    steps: [
      { id: "orders", title: "Orders", href: "/staff/orders",
        body: ["Search any order by number, shelf, or the customer's name, phone or email. Open one for the full history, items, payments and photos."] },
      { id: "walkin", title: "Walk-in orders", href: "/staff/walkin",
        body: ["For customers who come to the hub."],
        points: [
          "Search the customer, or add them with name and phone.",
          "Count the clothes in front of them and add each line.",
          "Take payment: POS (enter the receipt number), bank transfer (enter the sender name) or cash, into the right money point. Or send an online payment link.",
          "If they want delivery, add their location to work out the delivery fee.",
          "When they collect, mark that the customer has collected their clothes.",
        ],
        tip: "Walk-in orders join the same wash queue as online orders." },
      { id: "shelves", title: "Shelf map", href: "/staff/shelves",
        body: ["Shows which order is on which of the 63 shelves. A shelf frees itself when its order is delivered or collected."],
        points: ["Red means the order has waited over 2 days: call the customer."] },
      { id: "customs", title: "Customs", href: "/staff/customs",
        body: ["Businesses and student lodges with their own rates and a manager."],
        points: ["Every custom is prepaid: record a deposit before taking clothes in.", "Each batch of clothes becomes its own order."] },
      { id: "calls", title: "Subscription pickup calls", href: "/staff/subscription-pickup-calls",
        body: ["Plan customers whose next planned pickup is due in the next 24 hours. Call them to remind them and log the outcome."],
        tip: "These are reminders, not booked orders. Nothing is collected until the customer books." },
      { id: "studentids", title: "Student IDs", href: "/staff/student-ids",
        body: ["Students pay for a student plan, then wait here while you check their ID."],
        points: ["Approve: the plan starts today.", "Reject: the plan is cancelled and a full refund is listed for an admin to pay back."] },
      { id: "problems", title: "Customer problems", href: "/staff/issues",
        body: ["Complaints and problems customers raise on their orders. Call the customer, find out what happened, and answer."],
        points: ["You may be allowed to refund up to a limit. Bigger refunds go up to the super admin with the amount you suggest."] },
      { id: "count", title: "Count money", href: "/staff/count",
        body: ["At the end of the day, count each cash drawer, POS and bank account and enter the total held, including earlier days."],
        tip: "Count what is really there. The super admin compares it with what the system expects." },
      { id: "expense", title: "Record an expense", href: "/staff/expenses",
        body: ["Fuel, supplies, repairs. Every expense needs a receipt or bank debit screenshot, and counts only after the super admin approves it."] },
      { id: "spending", title: "Spending", href: "/staff/spending",
        body: ["Every approved business expense, with its proof. Nothing is spent without a receipt or bank record."] },
      { id: "support", title: "Customer support", href: "/staff/support",
        body: ["WhatsApp conversations customers start with us. Answer them here. You hear a sound when a new message arrives; you can mute it."] },
    ],
  },
  {
    id: "office", title: "Dispatch and the hub", roles: OFFICE,
    summary: "Sending agents, online and instant orders, receiving bags, the wash queue, the roster and agent checks.",
    steps: [
      { id: "dispatch", title: "Dispatch", href: "/staff/dispatch",
        body: ["Paid pickups waiting for an agent, and those on the way."],
        points: ["Choose an agent for each waiting pickup.", "You can change the agent until they reach the customer.", "Cancel and refund a booking only after talking to the customer."] },
      { id: "online", title: "Online orders", href: "/staff/online",
        body: ["Every order customers booked and paid online, from pickup to delivery. Use it to see where each order is."] },
      { id: "instant", title: "Instant orders", href: "/staff/instant",
        body: ["Customers who paid extra for a fast return. Most urgent first, with time left. Late ones are flagged."] },
      { id: "receiving", title: "Receiving", href: "/staff/receiving",
        body: ["Bags agents bring back to the hub."],
        points: ["Open the bag and check every line against the clothes.", "Mark each line correct, or fix the category if it is wrong.", "Then mark the order received and put it on a shelf."],
        tip: "On plan orders the allowance is based on total pieces, not prices." },
      { id: "hub", title: "Wash queue", href: "/staff/hub",
        body: ["Orders in the hub: received, being washed, and ready."],
        points: ["Start washing a received order.", "When folded and packed, mark it ready and say which shelf it is on."] },
      { id: "roster", title: "Shift roster", href: "/staff/roster",
        body: ["Set each agent's weekly working pattern, then create the shifts. Agents can only check in during a shift, and automatic dispatch only uses checked-in agents."] },
      { id: "verify", title: "Verify agents", href: "/staff/agent-verification",
        body: ["New commission agents come to the hub. Compare their original NIN document with their details and check their face matches their photo. The super admin activates them."] },
    ],
  },
  {
    id: "agent", title: "Pickups and deliveries", roles: ["delivery_agent", "commission_agent"],
    summary: "Your jobs, codes at the door, counting clothes, failed visits, referrals and commission.",
    steps: [
      { id: "jobs", title: "My jobs", href: "/staff/jobs",
        body: ["Your assigned pickups and deliveries. Open a job for the map, the customer's phone and the steps."],
        tip: "You only get jobs after checking in to your shift." },
      { id: "pickup", title: "Doing a pickup", href: "/staff/jobs", always: true,
        body: ["At the door, follow the steps in the job."],
        points: [
          "Show the customer the pickup code on your phone. They enter it on their side.",
          "Count the clothes by category, reading each line out loud while the customer watches.",
          "Send the bill. The customer checks it on their phone, accepts it and pays online.",
          "Leave only once it shows paid. Bring the bag straight to the hub.",
        ],
        tip: "Never collect cash. If something is wrong, withdraw the bill and correct it." },
      { id: "delivery", title: "Doing a delivery", href: "/staff/jobs", always: true,
        body: ["Take the clean clothes to the customer."],
        points: ["Show the delivery code. The customer enters it to confirm they have the clothes.", "The delivery fare is already paid. Do not collect any money."] },
      { id: "failed", title: "When you cannot finish", href: "/staff/jobs", always: true,
        body: ["Call the customer first. If you still cannot do the job, log what happened: not answering, not at the address, cannot find the address, or no longer wants it."],
        points: ["For a failed delivery, bring the bag back to the hub. The office arranges another try."] },
      { id: "referrals", title: "Referrals", href: "/staff/referrals",
        body: ["Invite customers to LaundryPoint and follow each invitation through signup and orders. You can resend an invitation a limited number of times."] },
      { id: "commissions", title: "My commissions", href: "/staff/commissions",
        body: ["Commission is earned only after eligible service payments succeed. Transport fares and refunds do not count. Ask for a withdrawal once your bank details are in My details."] },
    ],
  },
  {
    id: "washer", title: "Washing and shelves", roles: ["washer"],
    summary: "Working the wash queue and keeping shelves right.",
    steps: [
      { id: "hub", title: "Wash queue", href: "/staff/hub",
        body: ["Every order in the hub."],
        points: ["Received, not started: start washing.", "Being washed: when folded and packed, mark it ready.", "Always say which shelf you put it on."] },
      { id: "shelves", title: "Shelf map", href: "/staff/shelves",
        body: ["Where each ready order sits. Red means it has waited over 2 days. Tell the office so they can call the customer."] },
    ],
  },
  {
    id: "cleaning-office", title: "Cleaning: office", roles: ["scheduler", "secretary", "cashier", "inspector", "admin", "super_admin"],
    summary: "Requests, inspections, quotes, the board, plans, problems, bills and settings.",
    steps: [
      { id: "requests", title: "Cleaning requests", href: "/staff/cleaning",
        body: ["Every cleaning request from the website, phone and walk-ins."],
        points: ["Call each new request within the hour, then mark it as called.", "New request (phone or walk-in) adds one for a caller."] },
      { id: "request", title: "Working a request", href: "/staff/cleaning", always: true,
        body: ["Open a request and work down the page."],
        points: [
          "Link the customer account and pin the exact address on the map.",
          "Book an inspection visit (₦3,000 to ₦7,000 by distance, or skip the fee with a reason), or quote from photos.",
          "After the visit, record water, power, access and photos.",
          "Build the quote: rooms, add-ons, condition, one-off or monthly plan. The price updates as you go.",
          "Save and send. A changed price goes to admin for approval first.",
        ],
        tip: "The customer picks a day and pays online, or pays you at the desk." },
      { id: "board", title: "Cleaning board", href: "/staff/cleaning/board",
        body: ["The week's visits and inspections, with how full each day is."],
        points: ["Every paid visit needs a crew lead by the day before.", "Set a start time to tell the customer when to expect the crew.", "Move or cancel a visit only after agreeing with the customer."] },
      { id: "plans", title: "Cleaning plans", href: "/staff/cleaning/plans",
        body: ["Every monthly cleaning plan: next visit, visits used and renewal status. Renewal bills go out 3 days before a plan ends."] },
      { id: "issues", title: "Cleaning issues", href: "/staff/cleaning/issues",
        body: ["Complaints and damage reports. Call the customer the same day and compare before and after photos.", "Book a free re-clean, pay compensation, or close it with what was agreed."] },
      { id: "bills", title: "Cleaning bills", href: "/staff/cleaning/invoices",
        body: ["Unpaid cleaning bills. Record a desk payment only when the money is in our account or cash is in hand."],
        tip: "A booking bill holds the day for 30 minutes. If that has passed, check the board before confirming." },
      { id: "settings", title: "Cleaning settings", href: "/staff/cleaning/settings",
        body: ["Crew working days, best days per area, the rate card, plans and booking rules."],
        points: ["Set every cleaner's working days: they decide which days customers can book."] },
    ],
  },
  {
    id: "cleaning-crew", title: "Cleaning: crew", roles: ["cleaning_lead", "cleaner"],
    summary: "Your cleaning jobs from arrival to sign-off.",
    steps: [
      { id: "jobs", title: "My cleaning jobs", href: "/staff/cleaning/jobs",
        body: ["Today's and tomorrow's jobs, with the address, directions, water and access notes, and the crew."] },
      { id: "start", title: "Starting a job", href: "/staff/cleaning/jobs", always: true,
        body: ["The crew lead runs the job on their phone."],
        points: ["Tap We are on the way when you leave.", "At the door, ask the customer for their arrival code and enter it to start.", "If there is an unpaid balance, do not start. Ask them to pay in the app."] },
      { id: "work", title: "During the job", href: "/staff/cleaning/jobs", always: true,
        body: ["Take before photos, tick the checklist as you go, then take after photos."],
        points: ["Found extra work? Send it to the customer to approve. Do not start it until they approve.", "Something broken or unsafe? Report a problem straight away."] },
      { id: "finish", title: "Finishing", href: "/staff/cleaning/jobs", always: true,
        body: ["Walk round with the customer. If they are happy, ask for their completion code and finish. If they are not home, finish without a code; they sign off in the app."],
        tip: "Never ask a customer for cash." },
    ],
  },
  {
    id: "admin", title: "Admin tools", roles: ["admin", "super_admin"],
    summary: "Speed, free transport, reports, guide progress and the super admin area.",
    steps: [
      { id: "speed", title: "Speed analytics", href: "/staff/speed",
        body: ["How fast agents reach customers against the target, and how long clothes take to come back, instant versus standard."] },
      { id: "transport", title: "Free transport", href: "/staff/transport",
        body: ["Make laundry pickup and delivery free for everyone, an area, a plan or one customer, for a set time. You can also waive transport on a single unpaid order."] },
      { id: "cleaning-report", title: "Cleaning report", href: "/staff/cleaning/report",
        body: ["Cleaning money, quotes won, ratings and crew pay for any period."] },
      { id: "progress", title: "Guide progress", href: "/staff/guide/progress",
        body: ["See which staff have finished the guide chapters for their job."] },
      { id: "superadmin", title: "Super admin area", href: "/admin",
        body: ["Money, needs attention, staff and roles, prices, zones, payments and settings."] },
    ],
  },
];

export function chaptersFor(roles: string[]): GuideChapter[] {
  return STAFF_CHAPTERS.filter((c) => c.roles === "all" || c.roles.some((r) => roles.includes(r)));
}

// Steps this person can use: menu pages they can open, plus steps marked always.
export function visibleSteps(steps: GuideStep[], hrefs: string[]): GuideStep[] {
  const set = new Set(hrefs);
  return steps.filter((s) => s.always || !s.href || set.has(s.href) || (s.alt ?? []).some((a) => set.has(a)));
}

export type StepProgress = { status?: "in_progress" | "done" | "dismissed"; step?: number; seen?: string[]; skipped?: string[] };
export type StaffProgress = { chapters?: Record<string, StepProgress>; welcomed?: boolean };
