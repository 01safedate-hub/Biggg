'use client';

import Link from 'next/link';
import NavItem from './NavItem';
import { LayoutGrid, MapPin, Utensils, Bike, Settings, ArrowLeft } from 'lucide-react';
import useSession from '@/hooks/useSession';

export default function Sidebar() {
  const { profile } = useSession();

  const navItems = [
    { id: '/admin/dashboard', label: 'Dashboard', icon: <LayoutGrid className="w-4 h-4" /> },
    { id: '/admin/zone-map', label: 'Zone Map', icon: <MapPin className="w-4 h-4" /> },
    { id: '/admin/restaurants', label: 'Restaurants', icon: <Utensils className="w-4 h-4" /> },
    { id: '/admin/riders', label: 'Riders', icon: <Bike className="w-4 h-4" /> },
    { id: '/admin/settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="w-[200px] flex-shrink-0 flex flex-col py-5 px-3.5" style={{background: 'var(--ink)', color: '#D8D2CB'}}>
      <div className="flex items-center gap-2 mb-7 px-1.5">
        <Link href="/" className="mr-0.5 opacity-60 hover:opacity-100 transition-opacity" style={{color: 'white'}}>
          <ArrowLeft className="w-3.5 h-3.5" />
        </Link>
        <div className="w-[18px] h-[18px] rounded-[5px] flex-shrink-0" style={{background: 'var(--orange)'}} />
        <span className="font-semibold text-[14px] text-white tracking-tight" style={{fontFamily: "'Space Grotesk', sans-serif",}}>
          BigFoods
        </span>
      </div>

      <p className="text-[10px] uppercase tracking-widest px-1.5 mb-5 -mt-3" style={{color: '#9C948A'}}>Admin Console</p>

      <nav className="flex flex-col gap-0.5">
        {navItems.map((n) => (
          <NavItem key={n.id} href={n.id} icon={n.icon} label={n.label} />
        ))}
      </nav>

      <div className="mt-auto pt-3 text-[10.5px] px-1.5" style={{color: '#7A736A', borderTop: '1px solid rgba(255,255,255,0.08)'}}>
        {profile ? `Logged in as ${profile.full_name ?? profile.id}` : 'Logged in as Admin'}
      </div>
    </div>
  );
}
