'use client';

import 'leaflet/dist/leaflet.css';
import {useEffect, useRef, useState} from 'react';

interface Zone {
  name: string;
  lat: number;
  lng: number;
  restaurants: number;
  riders: number;
}

const zones: Zone[] = [
  {name: 'Awka', lat: 6.212, lng: 7.074, restaurants: 64, riders: 88},
  {name: 'Onitsha', lat: 6.145, lng: 6.7898, restaurants: 71, riders: 96},
  {name: 'Nnewi', lat: 6.0169, lng: 6.916, restaurants: 48, riders: 61},
  {name: 'Ekwulobia', lat: 6.0538, lng: 7.0621, restaurants: 22, riders: 30},
  {name: 'Ihiala', lat: 5.8583, lng: 6.8578, restaurants: 17, riders: 21},
];

type Layer = 'restaurants' | 'riders' | 'both';

export default function ZoneMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const [activeLayer, setActiveLayer] = useState<Layer>('restaurants');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const restLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const riderLayerRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Dynamically import Leaflet to avoid SSR issues
    import('leaflet').then((L) => {
      // Fix default marker icon paths
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(mapRef.current!, {scrollWheelZoom: false}).setView([6.15, 6.95], 9);
      mapInstanceRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 16,
      }).addTo(map);

      const restLayer = L.layerGroup();
      const riderLayer = L.layerGroup();
      restLayerRef.current = restLayer;
      riderLayerRef.current = riderLayer;

      zones.forEach((z) => {
        L.circle([z.lat, z.lng], {
          radius: z.restaurants * 90,
          color: '#FF6A00',
          fillColor: '#FF6A00',
          fillOpacity: 0.25,
          weight: 1.5,
        })
          .addTo(restLayer)
          .bindTooltip(`${z.name} · ${z.restaurants} restaurants`);

        L.circle([z.lat, z.lng], {
          radius: z.riders * 90,
          color: '#2F6B66',
          fillColor: '#2F6B66',
          fillOpacity: 0.22,
          weight: 1.5,
        })
          .addTo(riderLayer)
          .bindTooltip(`${z.name} · ${z.riders} riders online`);
      });

      restLayer.addTo(map);
    });

    return () => {
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !restLayerRef.current || !riderLayerRef.current) return;

    map.removeLayer(restLayerRef.current);
    map.removeLayer(riderLayerRef.current);

    if (activeLayer === 'restaurants' || activeLayer === 'both') {
      restLayerRef.current.addTo(map);
    }
    if (activeLayer === 'riders' || activeLayer === 'both') {
      riderLayerRef.current.addTo(map);
    }
  }, [activeLayer]);

  return (
    <div>
      {/* Layer toggle */}
      <div className="flex gap-2 mb-3">
        {(['restaurants', 'riders', 'both'] as Layer[]).map((l) => (
          <button
            key={l}
            onClick={() => setActiveLayer(l)}
            className="flex-1 text-center py-2 rounded-lg border text-[11.5px] font-semibold transition-colors capitalize"
            style={{
              background: activeLayer === l ? 'var(--peach)' : 'white',
              borderColor: activeLayer === l ? 'var(--orange)' : 'var(--line)',
              color: activeLayer === l ? 'var(--orange-dark)' : 'var(--gray)',
            }}
          >
            {l === 'both' ? 'Both' : l === 'restaurants' ? 'Restaurants' : 'Riders online'}
          </button>
        ))}
      </div>
      <div ref={mapRef} style={{height: 460, borderRadius: 9, zIndex: 0}} />
    </div>
  );
}
