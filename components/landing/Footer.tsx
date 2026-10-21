import { MapPin, MessageCircle, Phone } from "lucide-react";

export function Footer({ name, mapsUrl, whatsapp, phone }: { name: string; mapsUrl: string | null; whatsapp: string | null; phone: string | null }) {
  const wa = whatsapp ? `https://wa.me/${whatsapp.replace(/\D/g, "")}` : null;
  return (
    <footer className="border-t border-line bg-ink text-slate-300">
      <div className="container-page flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-lg font-bold text-white">{name}</p>
          <p className="mt-1 text-sm">Laundry pickup, cleaning and delivery.</p>
        </div>
        <div className="flex flex-wrap gap-5 text-sm">
          {phone && (
            <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-2 hover:text-white">
              <Phone className="h-4 w-4" aria-hidden />Call {phone}
            </a>
          )}
          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 hover:text-white">
              <MapPin className="h-4 w-4" aria-hidden />Visit us on Google Maps
            </a>
          )}
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 hover:text-white">
              <MessageCircle className="h-4 w-4" aria-hidden />Chat on WhatsApp
            </a>
          )}
        </div>
      </div>
      <div className="border-t border-slate-700 py-4 text-center text-xs text-slate-400">
        &copy; {new Date().getFullYear()} {name}. All rights reserved.
      </div>
    </footer>
  );
}
