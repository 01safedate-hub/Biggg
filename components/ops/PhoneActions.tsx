/** A phone number that opens a small chooser: call, or open WhatsApp (optionally with a ready-made message). */
export function waNumber(phone: string): string {
  const d = phone.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) return d.slice(1);
  if (d.startsWith("00")) return d.slice(2);
  if (d.startsWith("234")) return d;
  if (d.startsWith("0")) return "234" + d.slice(1);
  return d;
}

export function PhoneActions({ phone, message, label }: { phone: string | null | undefined; message?: string; label?: string }) {
  if (!phone) return <span className="text-ink-mute">No phone</span>;
  const tel = phone.replace(/[^\d+]/g, "");
  const wa = `https://wa.me/${waNumber(phone)}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
  return (
    <details className="relative inline-block align-baseline print:hidden">
      <summary className="cursor-pointer list-none font-medium text-brand-dark underline marker:hidden">{label ?? phone}</summary>
      <div className="absolute left-0 z-20 mt-1 w-44 rounded-md border border-line bg-white p-1 text-sm shadow-lg">
        <a href={`tel:${tel}`} className="block rounded px-3 py-2 text-ink hover:bg-canvas">Call {phone}</a>
        <a href={wa} target="_blank" rel="noopener noreferrer" className="block rounded px-3 py-2 text-ink hover:bg-canvas">WhatsApp{message ? " (message ready)" : ""}</a>
      </div>
    </details>
  );
}
