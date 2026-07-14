'use client';

import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Polygon, Marker, Popup } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import 'leaflet/dist/leaflet.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css';
import './zone-map.css';

import { createRiderDivIcon } from './mapIcons';
import RiderPopup from './RiderPopup';

export default function ZoneMap({ zones = [], riders = [] }: any) {
  const defaultCenter: [number, number] = [6.2146, 6.7898];
  const center: [number, number] =
    (zones && zones.length > 0 && zones[0].center && Array.isArray(zones[0].center)) ? zones[0].center : defaultCenter;

  const riderMarkers = useMemo(() => {
    return (riders || []).map((r: any) => {
      const lat = r.lat ?? r.latitude ?? r.location?.lat;
      const lng = r.lng ?? r.longitude ?? r.location?.lng;
      if (typeof lat !== 'number' || typeof lng !== 'number') return null;
      const icon = createRiderDivIcon(r.status ?? 'offline', r.initials ?? null);
      return { id: r.id ?? `${lat}-${lng}-${r.name}`, position: [lat, lng] as [number, number], r, icon };
    }).filter(Boolean);
  }, [riders]);

  function handleAssign(rider: any) {
    // placeholder action — wire-up as needed
    console.log('Assign rider', rider?.id);
    alert(`Assign rider ${rider?.name ?? rider?.id}`);
  }
  function handleCall(rider: any) {
    console.log('Call rider', rider?.id);
    alert(`Call rider ${rider?.name ?? rider?.id}`);
  }

  return (
    <div className="w-full admin-zone-map" style={{ height: 460 }}>
      <MapContainer center={center} zoom={11} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {(zones || []).map((z: any, i: number) => {
          const coords = z.polygon ?? (z.geojson && z.geojson.coordinates ? z.geojson.coordinates[0].map((c: any) => [c[1], c[0]]) : null);
          const polygonCoords = Array.isArray(coords) ? coords : null;
          return polygonCoords ? (
            <Polygon
              key={z.id ?? i}
              positions={polygonCoords}
              pathOptions={{ color: '#ff8a65', weight: 2, fillOpacity: 0.08 }}
            />
          ) : null;
        })}

        <MarkerClusterGroup chunkedLoading showCoverageOnHover>
          {riderMarkers.map((m: any) => (
            <Marker key={m.id} position={m.position} icon={m.icon}>
              <Popup>
                <RiderPopup rider={m.r} onAssign={handleAssign} onCall={handleCall} />
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  );
}
