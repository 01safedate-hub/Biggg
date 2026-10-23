import Link from "next/link";
import { redirect } from "next/navigation";
import { unsubscribe } from "./actions";

export const metadata = { title: "Unsubscribe", robots: { index: false } };

// The button is a POST so that email security scanners that open links cannot unsubscribe someone by accident.
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ t?: string; done?: string }> }) {
  const { t, done } = await searchParams;
  async function go(formData: FormData) {
    "use server";
    const r = await unsubscribe(formData);
    redirect(`/unsubscribe?done=${r.ok ? "1" : "0"}`);
  }
  return (
    <main id="main" className="container-page grid min-h-[60vh] max-w-md place-items-center py-16">
      <div className="card w-full space-y-4 p-6 text-center">
        {done === "1" ? (<><h1 className="text-2xl font-bold">You are unsubscribed</h1><p className="text-sm text-ink-soft">We will not send you offers any more. You will still get updates about your orders.</p></>)
          : done === "0" || !t ? (<><h1 className="text-2xl font-bold">This link is not valid</h1><p className="text-sm text-ink-soft">You can switch offers off any time from your account page.</p></>)
          : (<><h1 className="text-2xl font-bold">Stop receiving offers?</h1><p className="text-sm text-ink-soft">You will still get updates about your orders.</p>
            <form action={go}><input type="hidden" name="t" value={t} /><button className="btn-primary w-full">Yes, unsubscribe me</button></form></>)}
        <Link href="/" className="block text-sm font-medium text-ink-soft hover:text-ink">Go to LaundryPoint</Link>
      </div>
    </main>
  );
}
