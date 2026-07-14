'use client';

export const dynamic = 'force-dynamic';

import {useState} from 'react';
import nextDynamic from 'next/dynamic';
import Link from 'next/link';
import {LayoutGrid, MapPin, Utensils, Bike, Settings, ArrowLeft} from 'lucide-react';
import {OrdersChart, RevenueChart, ZoneChart, CancelChart} from '@/components/admin/AdminCharts';

// Leaflet must be dynamically imported (browser-only)
const ZoneMap = nextDynamic(() => import('@/components/admin/ZoneMap'), {
  ssr: false,
  loading: () => (
    <div
      className="flex items-center justify-center rounded-[9px] text-[12px]"
      style={{height: 460, background: 'var(--peach)', color: 'var(--gray)'}}
    >
      Loading map…
    </div>
  ),
});

type View = 'dashboard' | 'map' | 'restaurants';

const kpis = [
  {label: 'Active restaurants', value: '284', trend: '↑ 12% vs last month', up: true},
  {label: 'Active riders', value: '417', trend: '↑ 8% vs last month', up: true},
  {label: 'Orders today', value: '912', trend: '↑ 5% vs yesterday', up: true},
  {label: 'Revenue today', value: '₦1.62M', trend: '↑ 9% vs yesterday', up: true},
  {label: 'Avg delivery time', value: '24 min', trend: '↓ 2 min improved', up: false},
];

const topZones = [
  {name: 'Awka', meta: '64 restaurants · 88 riders online', orders: 312},
  {name: 'Onitsha', meta: '71 restaurants · 96 riders online', orders: 288},
  {name: 'Nnewi', meta: '48 restaurants · 61 riders online', orders: 201},
  {name: 'Ekwulobia', meta: '22 restaurants · 30 riders online', orders: 94},
  {name: 'Ihiala', meta: '17 restaurants · 21 riders online', orders: 68},
];

const liveRiders = [
  {name: 'Tunde A.', zone: 'Awka', online: true},
  {name: 'Chinedu O.', zone: 'Onitsha', online: true},
  {name: 'Ifeoma K.', zone: 'Nnewi', online: true},
  {name: 'Emeka N.', zone: 'Offline · 12 min ago', online: false},
  {name: 'Blessing U.', zone: 'Awka', online: true},
];

interface RestaurantRow {
  name: string;
  zone: string;
  openTime: string;
  closeTime: string;
  accepting: boolean;
}

const initialRestaurants: RestaurantRow[] = [
  {name: "Mama Ngozi's Kitchen", zone: 'Awka', openTime: '8:00 AM', closeTime: '9:00 PM', accepting: true},
  {name: 'Suya Republic', zone: 'Awka', openTime: '4:00 PM', closeTime: '1:00 AM', accepting: true},
  {name: 'Chop Point', zone: 'Onitsha', openTime: '9:00 AM', closeTime: '8:00 PM', accepting: false},
  {name: 'Green Bowl Smoothies', zone: 'Nnewi', openTime: '7:00 AM', closeTime: '6:00 PM', accepting: true},
];

export default function AdminPage() {
  const [view, setView] = useState<View>('dashboard');
  const [restaurants, setRestaurants] = useState<RestaurantRow[]>(initialRestaurants);

  const toggleAccepting = (idx: number) => {
    setRestaurants((prev) =>
      prev.map((r, i) => (i === idx ? {...r, accepting: !r.accepting} : r))
    );
  };

  const navItems: {id: View | null; label: string; icon: React.ReactNode}[] = [
    {id: 'dashboard', label: 'Dashboard', icon: <LayoutGrid className="w-4 h-4" />},
    {id: 'map', label: 'Zone Map', icon: <MapPin className="w-4 h-4" />},
    {id: 'restaurants', label: 'Restaurants', icon: <Utensils className="w-4 h-4" />},
    {id: null, label: 'Riders', icon: <Bike className="w-4 h-4" />},
    {id: null, label: 'Settings', icon: <Settings className="w-4 h-4" />},
  ];

  return (
    <div className="flex min-h-screen" style={{fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--ink)', background: '#F7F4F0'}}>
        {/* ── Sidebar ── */}
        <div
          className="w-[200px] flex-shrink-0 flex flex-col py-5 px-3.5"
          style={{background: 'var(--ink)', color: '#D8D2CB'}}
        >
          <div className="flex items-center gap-2 mb-7 px-1.5">
            <Link href="/" className="mr-0.5 opacity-60 hover:opacity-100 transition-opacity" style={{color: 'white'}}>
              <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
            <div className="w-[18px] h-[18px] rounded-[5px] flex-shrink-0" style={{background: 'var(--orange)'}} />
            <span
              className="font-semibold text-[14px] text-white tracking-tight"
              style={{fontFamily: "'Space Grotesk', sans-serif"}}
            >
              BigFoods
            </span>
          </div>

          <p
            className="text-[10px] uppercase tracking-widest px-1.5 mb-5 -mt-3"
            style={{color: '#9C948A'}}
          >
            Admin Console
          </p>

          <nav className="flex flex-col gap-0.5">
            {navItems.map((item) => (
              <button
                key={item.label}
                onClick={() => item.id && setView(item.id)}
                className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-[12.5px] font-medium text-left transition-all"
                style={{
                  background: view === item.id ? 'rgba(255,106,0,0.12)' : 'transparent',
                  color: view === item.id ? 'white' : '#B8B0A8',
                  borderLeft: view === item.id ? '2px solid var(--orange)' : '2px solid transparent',
                }}
              >
                <span>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>

          <div
            className="mt-auto pt-3 text-[10.5px] px-1.5"
            style={{color: '#7A736A', borderTop: '1px solid rgba(255,255,255,0.08)'}}
          >
            Logged in as Admin<br />Awka HQ
          </div>
        </div>

        {/* ── Main ── */}
        <div className="flex-1 px-7 py-6 max-w-[1180px] overflow-auto">

          {/* ── Dashboard ── */}
          {view === 'dashboard' && (
            <>
              <div className="flex justify-between items-start mb-5">
                <div>
                  <h1
                    className="text-[20px] font-semibold"
                    style={{fontFamily: "'Space Grotesk', sans-serif"}}
                  >
                    Dashboard
                  </h1>
                  <p className="text-[11.5px] mt-0.5" style={{color: 'var(--gray)'}}>
                    Platform performance across all zones
                  </p>
                </div>
                <span
                  className="text-[11.5px] font-semibold px-3 py-1.5 rounded-full"
                  style={{background: 'white', border: '1px solid var(--line)'}}
                >
                  Last 30 days
                </span>
              </div>

              {/* KPI grid */}
              <div className="grid grid-cols-5 gap-3 mb-5">
                {kpis.map((k) => (
                  <div
                    key={k.label}
                    className="rounded-xl p-3.5"
                    style={{background: 'white', border: '1px solid var(--line)'}}
                  >
                    <p
                      className="text-[10.5px] uppercase tracking-wide mb-2"
                      style={{color: 'var(--gray)'}}
                    >
                      {k.label}
                    </p>
                    <p
                      className="text-[21px] font-bold mb-1.5"
                      style={{fontFamily: "'Space Grotesk', sans-serif"}}
                    >
                      {k.value}
                    </p>
                    <p
                      className="text-[10.5px] font-semibold"
                      style={{color: k.up ? '#1E9E5A' : '#C1453A'}}
                    >
                      {k.trend}
                    </p>
                  </div>
                ))}
              </div>

              {/* Charts row 1 */}
              <div className="grid gap-3.5 mb-3.5" style={{gridTemplateColumns: '1.4fr 1fr'}}>
                <div
                  className="rounded-xl p-4"
                  style={{background: 'white', border: '1px solid var(--line)'}}
                >
                  <p className="text-[12.5px] font-semibold">Order volume — last 14 days</p>
                  <p className="text-[10.5px] mb-3.5" style={{color: 'var(--gray)'}}>Across all active zones</p>
                  <OrdersChart />
                </div>
                <div
                  className="rounded-xl p-4"
                  style={{background: 'white', border: '1px solid var(--line)'}}
                >
                  <p className="text-[12.5px] font-semibold">Revenue breakdown</p>
                  <p className="text-[10.5px] mb-3.5" style={{color: 'var(--gray)'}}>This month, by stream</p>
                  <RevenueChart />
                </div>
              </div>

              {/* Charts row 2 */}
              <div className="grid grid-cols-2 gap-3.5">
                <div
                  className="rounded-xl p-4"
                  style={{background: 'white', border: '1px solid var(--line)'}}
                >
                  <p className="text-[12.5px] font-semibold">Orders by zone</p>
                  <p className="text-[10.5px] mb-3.5" style={{color: 'var(--gray)'}}>Today</p>
                  <ZoneChart />
                </div>
                <div
                  className="rounded-xl p-4"
                  style={{background: 'white', border: '1px solid var(--line)'}}
                >
                  <p className="text-[12.5px] font-semibold">Rider cancellation rate</p>
                  <p className="text-[10.5px] mb-3.5" style={{color: 'var(--gray)'}}>Last 8 weeks</p>
                  <CancelChart />
                </div>
              </div>
            </>
          )}

          {/* ── Zone Map ── */}
          {view === 'map' && (
            <>
              <div className="flex justify-between items-start mb-5">
                <div>
                  <h1
                    className="text-[20px] font-semibold"
                    style={{fontFamily: "'Space Grotesk', sans-serif"}}
                  >
                    Zone Map
                  </h1>
                  <p className="text-[11.5px] mt-0.5" style={{color: 'var(--gray)'}}>
                    Restaurant and rider density across Anambra State
                  </p>
                </div>
                <span
                  className="text-[11.5px] font-semibold px-3 py-1.5 rounded-full"
                  style={{background: 'white', border: '1px solid var(--line)'}}
                >
                  Live
                </span>
              </div>

              <div className="grid gap-3.5" style={{gridTemplateColumns: '1fr 300px'}}>
                <div
                  className="rounded-xl p-3.5"
                  style={{background: 'white', border: '1px solid var(--line)'}}
                >
                  <ZoneMap />
                </div>

                <div className="flex flex-col gap-3.5">
                  {/* Top zones */}
                  <div
                    className="rounded-xl p-4"
                    style={{background: 'white', border: '1px solid var(--line)'}}
                  >
                    <p className="text-[12px] font-semibold mb-0.5">Top zones</p>
                    <p className="text-[10.5px] mb-3" style={{color: 'var(--gray)'}}>Ranked by activity right now</p>
                    {topZones.map((z) => (
                      <div
                        key={z.name}
                        className="flex justify-between items-center py-2"
                        style={{borderBottom: '1px solid var(--line)'}}
                      >
                        <div>
                          <p className="text-[12px] font-semibold">{z.name}</p>
                          <p className="text-[10.5px]" style={{color: 'var(--gray)'}}>{z.meta}</p>
                        </div>
                        <span
                          className="text-[14px] font-bold"
                          style={{fontFamily: "'Space Grotesk', sans-serif", color: 'var(--orange-dark)'}}
                        >
                          {z.orders}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Live riders */}
                  <div
                    className="rounded-xl p-4"
                    style={{background: 'white', border: '1px solid var(--line)'}}
                  >
                    <p className="text-[12px] font-semibold mb-0.5">Riders checked in</p>
                    <p className="text-[10.5px] mb-3" style={{color: 'var(--gray)'}}>Most recent activity</p>
                    {liveRiders.map((r) => (
                      <div
                        key={r.name}
                        className="flex items-center gap-2 py-2 text-[11.5px]"
                        style={{borderBottom: '1px solid var(--line)'}}
                      >
                        <span
                          className="w-[7px] h-[7px] rounded-full flex-shrink-0"
                          style={{background: r.online ? '#1E9E5A' : 'var(--line)'}}
                        />
                        <span className="font-semibold flex-1">{r.name}</span>
                        <span style={{color: 'var(--gray)', fontSize: '10.5px'}}>{r.zone}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── Restaurants ── */}
          {view === 'restaurants' && (
            <>
              <div className="flex justify-between items-start mb-5">
                <div>
                  <h1
                    className="text-[20px] font-semibold"
                    style={{fontFamily: "'Space Grotesk', sans-serif"}}
                  >
                    Restaurants
                  </h1>
                  <p className="text-[11.5px] mt-0.5" style={{color: 'var(--gray)'}}>
                    Set the hours each restaurant accepts orders
                  </p>
                </div>
                <span
                  className="text-[11.5px] font-semibold px-3 py-1.5 rounded-full"
                  style={{background: 'white', border: '1px solid var(--line)'}}
                >
                  284 total
                </span>
              </div>

              <div
                className="rounded-xl overflow-hidden"
                style={{background: 'white', border: '1px solid var(--line)'}}
              >
                {/* Header */}
                <div
                  className="grid px-4 py-3"
                  style={{
                    gridTemplateColumns: '2fr 1fr 1.4fr 1fr',
                    gap: 10,
                    fontSize: '10.5px',
                    color: 'var(--gray)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.03em',
                    background: '#FAF7F3',
                    borderBottom: '1px solid var(--line)',
                  }}
                >
                  <div>Restaurant</div>
                  <div>Zone</div>
                  <div>Accepting hours</div>
                  <div>Status</div>
                </div>

                {restaurants.map((r, idx) => (
                  <div
                    key={r.name}
                    className="grid px-4 py-3 items-center"
                    style={{
                      gridTemplateColumns: '2fr 1fr 1.4fr 1fr',
                      gap: 10,
                      fontSize: '12.5px',
                      borderBottom: idx < restaurants.length - 1 ? '1px solid var(--line)' : 'none',
                    }}
                  >
                    <div className="font-semibold" style={{color: 'var(--ink)'}}>{r.name}</div>
                    <div style={{color: 'var(--gray)', fontSize: '11px'}}>{r.zone}</div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        defaultValue={r.openTime}
                        className="rounded-[7px] px-2 py-1.5 text-[11.5px] w-[78px] outline-none"
                        style={{border: '1px solid var(--line)', fontFamily: 'Inter, sans-serif'}}
                        onFocus={(e) => (e.target.style.borderColor = 'var(--orange)')}
                        onBlur={(e) => (e.target.style.borderColor = 'var(--line)')}
                      />
                      <span style={{color: 'var(--gray)', fontSize: '11px'}}>–</span>
                      <input
                        type="text"
                        defaultValue={r.closeTime}
                        className="rounded-[7px] px-2 py-1.5 text-[11.5px] w-[78px] outline-none"
                        style={{border: '1px solid var(--line)', fontFamily: 'Inter, sans-serif'}}
                        onFocus={(e) => (e.target.style.borderColor = 'var(--orange)')}
                        onBlur={(e) => (e.target.style.borderColor = 'var(--line)')}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleAccepting(idx)}
                        className="w-9 h-5 rounded-full relative transition-colors"
                        style={{background: r.accepting ? 'var(--orange)' : 'var(--line)'}}
                      >
                        <span
                          className="absolute top-[3px] w-3.5 h-3.5 rounded-full bg-white transition-all"
                          style={{
                            left: r.accepting ? '19px' : '3px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                          }}
                        />
                      </button>
                      <span
                        className="text-[10.5px] font-semibold px-2.5 py-1 rounded-full"
                        style={{
                          background: r.accepting ? '#E4F5EB' : '#FBEAEA',
                          color: r.accepting ? '#1E9E5A' : '#C1453A',
                        }}
                      >
                        {r.accepting ? 'Accepting' : 'Closed'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
  );
}
