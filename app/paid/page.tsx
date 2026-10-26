import Link from "next/link";

export const metadata = { title: "Payment received", robots: { index: false } };

// Where Paystack or Flutterwave send a customer after paying a link made by the desk.
// The real confirmation comes from the provider's webhook, so this page only says thanks.
export default function Paid() {
  return (
    <main id="main" className="container-page grid min-h-[60vh] max-w-md place-items-center py-16">
      <div className="card w-full space-y-4 p-6 text-center">
        <h1 className="text-2xl font-bold">Thank you</h1>
        <p className="text-sm text-ink-soft">If your payment went through, we are already arranging your delivery. You will get a message when a rider is on the way.</p>
        <Link href="/" className="btn-primary block">Go to LaundryPoint</Link>
      </div>
    </main>
  );
}
