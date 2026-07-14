'use client';

import {useState} from 'react';
import Link from 'next/link';
import {ArrowLeft, CheckCircle2} from 'lucide-react';

type Screen = 'landing' | 'flow';
type Step = 1 | 2 | 3 | 4;

const steps = [
  {id: 1, label: 'Business'},
  {id: 2, label: 'Verify'},
  {id: 3, label: 'Delivery'},
  {id: 4, label: 'Menu'},
];

const feeOptions = [
  {amount: 2000, label: 'Starter'},
  {amount: 5000, label: 'Faster growth'},
];

const deliveryZones = [
  'Select specific streets',
  'Awka only',
  'All of Anambra',
];

export default function RestaurantPortalPage() {
  const [screen, setScreen] = useState<Screen>('landing');
  const [step, setStep] = useState<Step>(1);
  const [selectedFee, setSelectedFee] = useState(5000);
  const [deliveryChoice, setDeliveryChoice] = useState<'bigfoods' | 'own'>('bigfoods');
  const [selectedZone, setSelectedZone] = useState('Select specific streets');

  const showWideZoneWarning = selectedZone === 'All of Anambra';

  return (
    <div
      className="min-h-screen flex justify-center px-4 py-8 pb-16"
      style={{background: 'var(--white)'}}
    >
      <div className="w-full max-w-[380px]">
        {/* Brand */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Link href="/" className="mr-1" style={{color: 'var(--gray)'}}>
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="w-5 h-5 rounded-md flex-shrink-0" style={{background: 'var(--orange)'}} />
            <span
              className="font-semibold text-[15px] tracking-tight"
              style={{fontFamily: "'Space Grotesk', sans-serif"}}
            >
              BigFoods
            </span>
          </div>
          <span className="text-[11px]" style={{color: 'var(--gray)'}}>Restaurant Portal</span>
        </div>

        {/* ──────── LANDING ──────── */}
        {screen === 'landing' && (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-wide mb-2.5" style={{color: 'var(--orange)'}}>
              For restaurants & home kitchens
            </p>
            <h1
              className="text-[27px] font-bold leading-tight tracking-tight mb-3"
              style={{fontFamily: "'Space Grotesk', sans-serif", color: 'var(--ink)'}}
            >
              Cook. We handle pickup, delivery, and getting you customers.
            </h1>
            <p className="text-[13px] mb-6 max-w-xs" style={{color: 'var(--gray)'}}>
              Join BigFoods and put your kitchen in front of hungry customers across Anambra — no delivery staff required.
            </p>

            {/* Hero visual */}
            <div
              className="rounded-2xl h-[150px] mb-6 flex items-end overflow-hidden"
              style={{background: 'var(--peach)'}}
            >
              <div
                className="m-3.5 bg-white rounded-xl px-3 py-2.5 text-[11.5px]"
                style={{boxShadow: '0 4px 14px rgba(32,28,26,0.06)'}}
              >
                <b
                  className="block text-[13px] mb-0.5"
                  style={{fontFamily: "'Space Grotesk', sans-serif"}}
                >
                  Order #A192 ready
                </b>
                Dispatch rider arriving in 4 min
              </div>
            </div>

            {/* Feature list */}
            <div className="mb-6 divide-y" style={{borderColor: 'var(--line)'}}>
              {[
                {icon: '✓', title: 'Free dispatch, always', desc: 'A rider comes to collect and deliver every order — no setup cost, ever.'},
                {icon: '₦', title: 'Get your onboard fee back', desc: 'It returns to you as customer discounts. BigFoods covers the cost.'},
                {icon: '↗', title: 'Grow with promotions', desc: 'Boosted visibility to reach more customers in your zone.'},
              ].map((f) => (
                <div key={f.title} className="flex gap-3 items-start py-3">
                  <div
                    className="w-[26px] h-[26px] rounded-lg flex items-center justify-center text-[13px] flex-shrink-0"
                    style={{background: 'var(--peach)', color: 'var(--orange)'}}
                  >
                    {f.icon}
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold mb-0.5" style={{color: 'var(--ink)'}}>{f.title}</p>
                    <p className="text-[11.5px]" style={{color: 'var(--gray)'}}>{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setScreen('flow')}
              className="w-full py-3.5 rounded-[10px] text-[13.5px] font-semibold text-white transition-colors"
              style={{background: 'var(--orange)'}}
            >
              Register your restaurant
            </button>
            <p className="text-center text-[12px] mt-3.5" style={{color: 'var(--gray)'}}>
              Already registered?{' '}
              <a href="#" className="font-semibold" style={{color: 'var(--orange)'}}>Log in</a>
            </p>
          </>
        )}

        {/* ──────── FLOW ──────── */}
        {screen === 'flow' && (
          <>
            {/* Ticket progress */}
            <div
              className="rounded-t-[10px] px-4 pt-4 pb-3 relative"
              style={{background: 'var(--white)', border: '1px solid var(--line)', borderBottom: 'none'}}
            >
              <div className="flex">
                {steps.map((s) => (
                  <div key={s.id} className="flex-1 flex flex-col items-center gap-1.5">
                    <div
                      className="w-2 h-2 rounded-full transition-all"
                      style={{
                        background:
                          s.id < step
                            ? 'var(--orange)'
                            : s.id === step
                            ? 'var(--white)'
                            : 'var(--line)',
                        border:
                          s.id < step
                            ? '1px solid var(--orange)'
                            : s.id === step
                            ? '2px solid var(--orange)'
                            : '1px solid var(--line)',
                        width: s.id === step ? '9px' : '8px',
                        height: s.id === step ? '9px' : '8px',
                      }}
                    />
                    <span
                      className="text-[10px] uppercase tracking-wide"
                      style={{
                        color: s.id <= step ? 'var(--ink)' : 'var(--gray)',
                        fontWeight: s.id <= step ? 500 : 400,
                      }}
                    >
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>
              {/* Dashed tear */}
              <div
                className="mt-3.5 relative"
                style={{height: 0, borderBottom: '2px dashed var(--line)'}}
              >
                <span
                  className="absolute w-4 h-4 rounded-full"
                  style={{top: -8, left: -27, background: 'var(--white)'}}
                />
                <span
                  className="absolute w-4 h-4 rounded-full"
                  style={{top: -8, right: -27, background: 'var(--white)'}}
                />
              </div>
            </div>

            {/* Card */}
            <div
              className="px-5 pt-6 pb-5 rounded-b-2xl"
              style={{border: '1px solid var(--line)', borderTop: 'none'}}
            >
              {/* ── Step 1 ── */}
              {step === 1 && (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{color: 'var(--orange)'}}>Step 1 of 4</p>
                  <h2
                    className="text-[20px] font-semibold mb-1.5"
                    style={{fontFamily: "'Space Grotesk', sans-serif"}}
                  >Tell us about your kitchen</h2>
                  <p className="text-[12.5px] mb-5" style={{color: 'var(--gray)'}}>Takes about 2 minutes. You can edit this later.</p>

                  {[
                    {label: 'Restaurant or seller name', placeholder: "e.g. Mama Ngozi's Kitchen", type: 'text'},
                    {label: 'Phone number', placeholder: '080 000 0000', type: 'tel'},
                    {label: 'Pickup address', placeholder: 'e.g. 14 Zik Avenue, Awka', type: 'text'},
                  ].map((f) => (
                    <div key={f.label} className="mb-3.5">
                      <label className="block text-[12px] font-medium mb-1.5" style={{color: 'var(--ink)'}}>
                        {f.label}
                      </label>
                      <input
                        type={f.type}
                        placeholder={f.placeholder}
                        className="w-full px-3 py-2.5 rounded-[9px] text-[13px] outline-none transition-all"
                        style={{
                          border: '1px solid var(--line)',
                          color: 'var(--ink)',
                          background: 'var(--white)',
                        }}
                        onFocus={(e) => (e.target.style.borderColor = 'var(--orange)')}
                        onBlur={(e) => (e.target.style.borderColor = 'var(--line)')}
                      />
                    </div>
                  ))}

                  <div className="mb-5">
                    <label className="block text-[12px] font-medium mb-1.5" style={{color: 'var(--ink)'}}>Category</label>
                    <select
                      className="w-full px-3 py-2.5 rounded-[9px] text-[13px] outline-none"
                      style={{border: '1px solid var(--line)', color: 'var(--ink)', background: 'var(--white)'}}
                    >
                      {['Local & Native dishes', 'Fast food', 'Drinks & snacks', 'Home food business'].map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={() => setStep(2)}
                    className="w-full py-3.5 rounded-[10px] text-[13.5px] font-semibold text-white"
                    style={{background: 'var(--orange)'}}
                  >
                    Continue
                  </button>
                </>
              )}

              {/* ── Step 2 ── */}
              {step === 2 && (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{color: 'var(--orange)'}}>Step 2 of 4</p>
                  <h2
                    className="text-[20px] font-semibold mb-1.5"
                    style={{fontFamily: "'Space Grotesk', sans-serif"}}
                  >Choose your onboard fee</h2>
                  <p className="text-[12.5px] mb-4" style={{color: 'var(--gray)'}}>
                    A one-time fee — you get it all back as discount credit for your customers.
                  </p>

                  <div className="flex gap-2.5 mb-3.5">
                    {feeOptions.map((f) => (
                      <button
                        key={f.amount}
                        onClick={() => setSelectedFee(f.amount)}
                        className="flex-1 rounded-[10px] px-3 py-3.5 text-center transition-all"
                        style={{
                          border: selectedFee === f.amount ? '1px solid var(--orange)' : '1px solid var(--line)',
                          background: selectedFee === f.amount ? 'var(--peach)' : 'var(--white)',
                        }}
                      >
                        <div
                          className="text-[19px] font-bold mb-0.5"
                          style={{fontFamily: "'Space Grotesk', sans-serif"}}
                        >
                          ₦{f.amount.toLocaleString()}
                        </div>
                        <div className="text-[10.5px]" style={{color: 'var(--gray)'}}>{f.label}</div>
                      </button>
                    ))}
                  </div>

                  <div className="rounded-[10px] p-3.5 mb-4" style={{background: 'var(--peach)'}}>
                    <div
                      className="text-[12px] font-semibold mb-1.5 flex items-center gap-1.5"
                      style={{color: 'var(--ink)'}}
                    >
                      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{background: 'var(--orange)'}} />
                      Where this money goes
                    </div>
                    <p className="text-[11.5px] mb-1.5" style={{color: '#6E5A46', lineHeight: 1.6}}>
                      Your fee becomes discount credit that customers redeem when they order from you — BigFoods covers the value, not you. You get the full amount back in the value it brings.
                    </p>
                    <p className="text-[11.5px]" style={{color: '#6E5A46', lineHeight: 1.6}}>
                      A higher amount builds a bigger discount pool, which means more promotional reach for your restaurant and faster growth for BigFoods overall.
                    </p>
                  </div>

                  <button
                    onClick={() => setStep(3)}
                    className="w-full py-3.5 rounded-[10px] text-[13.5px] font-semibold text-white mb-2.5"
                    style={{background: 'var(--orange)'}}
                  >
                    Continue with ₦{selectedFee.toLocaleString()}
                  </button>
                  <button
                    onClick={() => setStep(1)}
                    className="w-full py-2.5 text-[12.5px]"
                    style={{color: 'var(--gray)', background: 'none', border: 'none'}}
                  >
                    Back
                  </button>
                </>
              )}

              {/* ── Step 3 ── */}
              {step === 3 && (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{color: 'var(--orange)'}}>Step 3 of 4</p>
                  <h2
                    className="text-[20px] font-semibold mb-1.5"
                    style={{fontFamily: "'Space Grotesk', sans-serif"}}
                  >Set up delivery</h2>
                  <p className="text-[12.5px] mb-4" style={{color: 'var(--gray)'}}>
                    Dispatch is free — here's exactly how it works.
                  </p>

                  <div className="flex gap-2.5 mb-1.5">
                    {[
                      {key: 'bigfoods', title: 'BigFoods dispatch', desc: 'A rider is sent to collect and deliver each order.', free: true},
                      {key: 'own', title: 'Own riders', desc: 'Use your own delivery staff instead.', free: false},
                    ].map((c) => (
                      <button
                        key={c.key}
                        onClick={() => setDeliveryChoice(c.key as 'bigfoods' | 'own')}
                        className="flex-1 rounded-[10px] px-3 py-3 text-left relative transition-all"
                        style={{
                          border: deliveryChoice === c.key ? '1px solid var(--orange)' : '1px solid var(--line)',
                          background: deliveryChoice === c.key ? 'var(--peach)' : 'var(--white)',
                        }}
                      >
                        {c.free && (
                          <span
                            className="absolute top-2.5 right-2.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{
                              color: 'var(--orange)',
                              background: 'var(--white)',
                              border: '1px solid var(--orange)',
                            }}
                          >
                            FREE
                          </span>
                        )}
                        <p className="text-[12.5px] font-semibold mb-0.5" style={{color: 'var(--ink)'}}>{c.title}</p>
                        <p className="text-[11px]" style={{color: 'var(--gray)'}}>{c.desc}</p>
                      </button>
                    ))}
                  </div>

                  <div className="my-4">
                    {[
                      {n: 1, text: 'You mark the order', bold: 'ready for pickup', rest: 'on your dashboard.'},
                      {n: 2, text: 'The', bold: 'nearest dispatch rider', rest: 'is notified and comes to your kitchen.'},
                      {n: 3, text: 'The rider collects the order and', bold: 'delivers it to the customer', rest: '— no cost to you.'},
                    ].map((s) => (
                      <div key={s.n} className="flex gap-2.5 py-2.5">
                        <div
                          className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5"
                          style={{background: 'var(--peach)', color: 'var(--orange)'}}
                        >
                          {s.n}
                        </div>
                        <p className="text-[12px]" style={{color: 'var(--ink)'}}>
                          {s.text} <b>{s.bold}</b> {s.rest}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="mb-3.5">
                    <label className="block text-[12px] font-medium mb-1.5" style={{color: 'var(--ink)'}}>
                      Delivery zone
                    </label>
                    <select
                      value={selectedZone}
                      onChange={(e) => setSelectedZone(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-[9px] text-[13px] outline-none"
                      style={{border: '1px solid var(--line)', color: 'var(--ink)', background: 'var(--white)'}}
                    >
                      {deliveryZones.map((z) => <option key={z}>{z}</option>)}
                    </select>
                  </div>

                  {showWideZoneWarning && (
                    <div
                      className="flex gap-2 rounded-[9px] px-3 py-2.5 text-[11.5px] mb-3.5"
                      style={{background: 'var(--peach)', color: '#8A5A20'}}
                    >
                      <span>⚠</span>
                      <span>Wide zones mean longer trips — food may arrive cooler. Consider a tighter radius for the best reviews.</span>
                    </div>
                  )}

                  <button
                    onClick={() => setStep(4)}
                    className="w-full py-3.5 rounded-[10px] text-[13.5px] font-semibold text-white mb-2.5"
                    style={{background: 'var(--orange)'}}
                  >
                    Finish setup
                  </button>
                  <button
                    onClick={() => setStep(2)}
                    className="w-full py-2.5 text-[12.5px]"
                    style={{color: 'var(--gray)', background: 'none', border: 'none'}}
                  >
                    Back
                  </button>
                </>
              )}

              {/* ── Step 4 ── */}
              {step === 4 && (
                <div className="text-center py-3">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-white text-xl font-semibold mx-auto mb-4"
                    style={{background: 'var(--orange)'}}
                  >
                    ✓
                  </div>
                  <h2
                    className="text-[20px] font-semibold mb-2.5"
                    style={{fontFamily: "'Space Grotesk', sans-serif"}}
                  >
                    You're live on BigFoods
                  </h2>
                  <p className="text-[12.5px] mb-5" style={{color: 'var(--gray)'}}>
                    Next, add your menu so customers can start ordering.
                  </p>
                  <button
                    onClick={() => { setStep(1); setScreen('landing'); }}
                    className="w-full py-3.5 rounded-[10px] text-[13.5px] font-semibold text-white"
                    style={{background: 'var(--orange)'}}
                  >
                    Add my menu
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
