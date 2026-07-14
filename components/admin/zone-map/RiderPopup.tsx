'use client';

import React from 'react';

export default function RiderPopup({ rider, onAssign, onCall }: any) {
  return (
    <div style={{ minWidth: 180 }}>
      <div style={{ fontWeight: 700 }}>{rider?.name ?? 'Rider'}</div>
      <div style={{ color: '#666', fontSize: 13 }}>{rider?.status ?? ''}</div>
      {rider?.last_seen && (
        <div style={{ color: '#888', fontSize: 12, marginTop: 6 }}>Last seen: {new Date(rider.last_seen).toLocaleString()}</div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          onClick={() => onAssign && onAssign(rider)}
          style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--line)', background: 'white' }}
        >
          Assign
        </button>
        <button
          onClick={() => onCall && onCall(rider)}
          style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: 'none', background: 'var(--orange)', color: 'white' }}
        >
          Call
        </button>
      </div>
    </div>
  );
}
