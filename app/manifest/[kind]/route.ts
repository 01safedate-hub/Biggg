const COMMON = { display: "standalone", orientation: "portrait", background_color: "#ffffff", lang: "en-NG" };

type Kind = { name: string; short_name: string; description: string; id: string; start_url: string; scope: string; theme_color: string; shortcuts: { name: string; url: string }[] };

const KINDS: Record<string, Kind> = {
  customer: { name: "LaundryPoint", short_name: "LaundryPoint", description: "Book laundry pickups, pay on your phone and track your orders.", id: "/pwa/customer", start_url: "/orders", scope: "/", theme_color: "#ea580c",
    shortcuts: [{ name: "Book a pickup", url: "/request" }, { name: "My orders", url: "/orders" }] },
  agent: { name: "LaundryPoint Agent", short_name: "Agent", description: "Your pickup jobs: arrive, count, bill, leave.", id: "/pwa/agent", start_url: "/staff/jobs", scope: "/staff/", theme_color: "#0f172a",
    shortcuts: [{ name: "Pickup jobs", url: "/staff/jobs" }] },
  desk: { name: "LaundryPoint Desk", short_name: "Desk", description: "Dispatch agents, receive clothes and record expenses.", id: "/pwa/desk", start_url: "/staff/dispatch", scope: "/staff/", theme_color: "#0f172a",
    shortcuts: [{ name: "Dispatch", url: "/staff/dispatch" }, { name: "Receiving", url: "/staff/receiving" }, { name: "Record expense", url: "/staff/expenses" }] },
  cashier: { name: "LaundryPoint Cashier", short_name: "Cashier", description: "Count money and see your pay progress.", id: "/pwa/cashier", start_url: "/staff/count", scope: "/staff/", theme_color: "#0f172a",
    shortcuts: [{ name: "Count money", url: "/staff/count" }, { name: "Home", url: "/staff" }] },
  admin: { name: "LaundryPoint Admin", short_name: "Admin", description: "Run the business: money, staff, orders and settings.", id: "/pwa/admin", start_url: "/admin", scope: "/admin/", theme_color: "#0f172a",
    shortcuts: [{ name: "Overview", url: "/admin" }, { name: "Orders", url: "/admin/orders" }, { name: "Daily money", url: "/admin/money" }] },
};

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const k = KINDS[kind];
  if (!k) return new Response("not found", { status: 404 });
  const body = {
    ...COMMON, ...k,
    icons: [
      { src: "/brand/icon/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: k.shortcuts.map((s) => ({ ...s, icons: [{ src: "/brand/icon/192.png", sizes: "192x192", type: "image/png" }] })),
  };
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } });
}
