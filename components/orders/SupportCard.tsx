export function SupportCard({ whatsapp, phone, orderNo }: { whatsapp?: string | null; phone?: string | null; orderNo: number }) {
  const wa = whatsapp ? whatsapp.replace(/\D/g, "").replace(/^0/, "234") : null;
  if (!wa && !phone) return null;
  return (
    <section className="card flex flex-wrap items-center justify-between gap-3 p-4 text-sm print:hidden" aria-label="Need help">
      <p className="text-ink-soft">Need help with this order?</p>
      <div className="flex gap-2">
        {wa && <a className="btn-secondary !px-3 !py-1.5" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hello, I need help with order #${orderNo}.`)}`}>WhatsApp us</a>}
        {phone && <a className="btn-secondary !px-3 !py-1.5" href={`tel:${phone}`}>Call us</a>}
      </div>
    </section>
  );
}
