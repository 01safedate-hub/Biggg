'use client';

import L from 'leaflet';

export function createRiderDivIcon(status: string, label: string | null = null) {
  const color = status === 'available' ? '#38b000' : status === 'busy' ? '#ff8a65' : '#9e9e9e';
  const text = label ? `<div style="font-size:10px;line-height:10px">${label}</div>` : '';
  const html = `
    <div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:${color};box-shadow:0 1px 3px rgba(0,0,0,0.15);color:white;font-size:12px;font-weight:600">${text || '•'}</div>
  `;
  return L.divIcon({ html, className: 'rider-icon', iconSize: [28, 28], iconAnchor: [14, 14] });
}
