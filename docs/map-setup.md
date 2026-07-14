Leaflet + Marker Cluster setup

Install packages

- npm
  npm install react-leaflet leaflet react-leaflet-markercluster leaflet.markercluster

- yarn
  yarn add react-leaflet leaflet react-leaflet-markercluster leaflet.markercluster

What to import in your component

In the map component (example: components/admin/zone-map/ZoneMap.tsx) import the CSS files:

import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

If you're using Next.js / a bundler that relocates assets, ensure you fix Leaflet's default icon paths (example already present in ZoneMap.tsx):

// Fix default icon paths for Leaflet when bundled
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).toString(),
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).toString(),
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).toString(),
});

Notes about SSR / Next.js

- Map components should be client-only. Use dynamic import with ssr: false for the component that renders MapContainer.
- Example already used in components/admin/zone-map/ZoneMapView.tsx:
  const ZoneMap = dynamic(() => import('./ZoneMap'), { ssr: false });

Realtime subscriptions (Supabase)

- If you plan to subscribe to the riders table from the browser, ensure Row Level Security (RLS) policies allow the realtime subscription or use a server-side subscription.
- The repo includes a hook (hooks/useRiderFeed.ts) as a starting point. If subscriptions fail, check Supabase project's realtime/replication settings and client keys.

Testing locally

1. Install the packages above
2. npm run dev (or yarn dev)
3. Visit /admin/zone-map and /admin/restaurants

If anything fails, open the browser console to see missing assets or Supabase subscription errors and I can help debug them.
