import React from 'react';
import Sidebar from '@/components/admin/layout/Sidebar';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Admin',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen" style={{fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--ink)', background: '#F7F4F0'}}>
      <Sidebar />
      <main className="flex-1 px-7 py-6 max-w-[1180px] overflow-auto">{children}</main>
    </div>
  );
}
