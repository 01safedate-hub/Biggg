'use client';

import {useState} from 'react';
import Link from 'next/link';
import {ArrowLeft} from 'lucide-react';

type Screen = 'landing' | 'flow';
type Step = 1 | 2 | 3 | 4;

const steps = [
  {id: 1, label: 'Details'},
  {id: 2, label: 'Location'},
  {id: 3, label: 'Verify'},
  {id: 4, label: 'Ride'},
];

export default function RiderPortalPage() {
  const [screen, setScreen] = useState<Screen>('landing');
  const [step, setStep] = useState<Step>(1);
  const [locationOn, setLocationOn] = useState(true);
  const [isOnline, setIsOnline] = useState(false);

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
          <span className="text-[11px]" style={{color: 'var(--gray)'}}>Rider Portal</span>
        </div>

        {/* ──────── LANDING ──────── */}
        {screen === 'landing' && (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-wide mb-2.5" style={{color: 'var(--orange)'}}>
              For dispatch riders
            </p>
            <h1
              className="text-[27px] font-bold leading-tight tracking-tight mb-3"
              style={{fontFamily: "'Space Grotesk', sans-serif", color: 'var(--ink)'}}
            >
              Your bike. Your hours. Steady pay.
            </h1>
            <p className="text-[13px] mb-5 max-w-xs" style={{color: 'var(--gray)'}}>
              Go online whenever you're ready to ride, pick up nearby orders, and get paid straight to your wallet.
            </p>

            {/* Earnings card */}
            <div
              className="rounded-2xl p-4 mb-6 relative overflow-hidden"
              style={{background: 'var(--ink)', color: 'var(--white)'}}
            >
              <span
                className="absolute top-4 right-4 text-[9.5px] font-bold px-2 py-0.5 rounded-full"
                style={{background: 'var(--orange)'}}
              >
                Today
              </span>
              <p className="text-[10.5px] uppercase tracking-wide mb-1" style={{color: '#B8B0A8'}}>Balance</p>
              <p
                className="text-[26px] font-bold mb-2.5"
                style={{fontFamily: "'Space Grotesk', sans-serif"}}
              >
                ₦4,200
              </p>
              <div className="flex gap-4">
                {[
                  {value: '6', label: 'Deliveries'},
                  {value: '100%', label: 'Tips kept'},
                  {value: '₦50k', label: 'Payout mark'},
                ].map((s) => (
                  <div key={s.label} className="text-[11px]" style={{color: '#B8B0A8'}}>
                    <b className="block text-[13px] font-semibold" style={{color: 'white'}}>{s.value}</b>
                    {s.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Feature list */}
            <div className="mb-6 divide-y" style={{borderColor: 'var(--line)'}}>
              {[
                {icon: '⏱', title: 'Go online, go offline — anytime', desc: 'No shifts. Ride when it works for you.'},
                {icon: '₦', title: 'Keep 100% of your tips', desc: 'Plus your share of every delivery fee.'},
                {icon: '📍', title: 'Orders near you, automatically', desc: 'We match you to the closest pickups.'},
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
              className="w-full py-3.5 rounded-[10px] text-[13.5px] font-semibold text-white"
              style={{background: 'var(--orange)'}}
            >
              Apply to ride
            </button>
            <p className="text-center text-[12px] mt-3.5" style={{color: 'var(--gray)'}}>
              Already riding?{' '}
              <a href="#" className="font-semibold" style={{color: 'var(--orange)'}}>Log in</a>
            </p>
          </>
        )}

        {/* ──────── FLOW ──────── */}
        {screen === 'flow' && (
          <>
            {/* Route progress */}
            <div className="relative px-1.5 py-5 pb-6">
              <div
                className="absolute left-7 right-7 top-[34px] h-0"
                style={{borderTop: '2px dashed var(--line)'}}
              />
              <div className="flex justify-between relative z-10">
                {steps.map((s) => (
                  <div key={s.id} className="flex flex-col items-center gap-1.5 flex-1">
                    <div
                      className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-[11px] font-bold transition-all"
                      style={{
                        background:
                          s.id < step ? 'var(--orange)' : 'var(--white)',
                        border:
                          s.id < step
                            ? '2px solid var(--orange)'
                            : s.id === step
                            ? '2px solid var(--orange)'
                            : '2px solid var(--line)',
                        color:
                          s.id < step ? 'white' : s.id === step ? 'var(--orange)' : 'var(--gray)',
                      }}
                    >
                      {s.id < step ? '✓' : s.id}
                    </div>
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
            </div>

            {/* Card */}
            <div
              className="px-5 pt-6 pb-5 rounded-2xl"
              style={{border: '1px solid var(--line)'}}
            >
              {/* ── Step 1: Details ── */}
              {step === 1 && (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{color: 'var(--orange)'}}>Step 1 of 4</p>
                  <h2
                    className="text-[20px] font-semibold mb-1.5"
                    style={{fontFamily: "'Space Grotesk', sans-serif"}}
                  >Your details</h2>
                  <p className="text-[12.5px] mb-5" style={{color: 'var(--gray)'}}>
                    We use this to verify you and pay you correctly.
                  </p>

                  {[
                    {label: 'Full name', placeholder: 'e.g. Chidi Okafor', type: 'text'},
                    {label: 'Phone number', placeholder: '080 000 0000', type: 'tel'},
                  ].map((f) => (
                    <div key={f.label} className="mb-3.5">
                      <label className="block text-[12px] font-medium mb-1.5" style={{color: 'var(--ink)'}}>
                        {f.label}
                      </label>
                      <input
                        type={f.type}
                        placeholder={f.placeholder}
                        className="w-full px-3 py-2.5 rounded-[9px] text-[13px] outline-none"
                        style={{border: '1px solid var(--line)', color: 'var(--ink)', background: 'var(--white)'}}
                        onFocus={(e) => (e.target.style.borderColor = 'var(--orange)')}
                        onBlur={(e) => (e.target.style.borderColor = 'var(--line)')}
                      />
                    </div>
                  ))}

                  <div className="flex gap-2.5 mb-5">
                    <div className="flex-1">
                      <label className="block text-[12px] font-medium mb-1.5" style={{color: 'var(--ink)'}}>Vehicle type</label>
                      <select
                        className="w-full px-3 py-2.5 rounded-[9px] text-[13px] outline-none"
                        style={{border: '1px solid var(--line)', color: 'var(--ink)', background: 'var(--white)'}}
                      >
                        {['Okada', 'Keke', 'Car', 'Bicycle'].map((v) => <option key={v}>{v}</option>)}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-[12px] font-medium mb-1.5" style={{color: 'var(--ink)'}}>Plate number</label>
                      <input
                        type="text"
                        placeholder="AAA 123 XY"
                        className="w-full px-3 py-2.5 rounded-[9px] text-[13px] outline-none"
                        style={{border: '1px solid var(--line)', color: 'var(--ink)', background: 'var(--white)'}}
                        onFocus={(e) => (e.target.style.borderColor = 'var(--orange)')}
                        onBlur={(e) => (e.target.style.borderColor = 'var(--line)')}
                      />
                    </div>
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

              {/* ── Step 2: Location ── */}
              {step === 2 && (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{color: 'var(--orange)'}}>Step 2 of 4</p>
                  <h2
                    className="text-[20px] font-semibold mb-1.5"
                    style={{fontFamily: "'Space Grotesk', sans-serif"}}
                  >Turn on your location</h2>
                  <p className="text-[12.5px] mb-4" style={{color: 'var(--gray)'}}>
                    This is how we find orders near you.
                  </p>

                  <div
                    className="flex items-center justify-between rounded-[10px] px-3.5 py-3 mb-3.5"
                    style={{border: '1px solid var(--line)'}}
                  >
                    <div>
                      <p className="text-[12.5px] font-semibold" style={{color: 'var(--ink)'}}>Location access</p>
                      <p className="text-[11px]" style={{color: 'var(--gray)'}}>Checked every 5 minutes while online</p>
                    </div>
                    <button
                      onClick={() => setLocationOn((v) => !v)}
                      className="w-[42px] h-6 rounded-full relative transition-colors flex-shrink-0"
                      style={{background: locationOn ? 'var(--orange)' : 'var(--line)'}}
                    >
                      <span
                        className="absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white transition-all"
                        style={{
                          left: locationOn ? '21px' : '3px',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                        }}
                      />
                    </button>
                  </div>

                  <div className="rounded-[10px] p-3.5 mb-5" style={{background: 'var(--peach)'}}>
                    <div className="text-[12px] font-semibold mb-1.5 flex items-center gap-1.5" style={{color: 'var(--ink)'}}>
                      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{background: 'var(--orange)'}} />
                      You're in control
                    </div>
                    <p className="text-[11.5px]" style={{color: '#6E5A46', lineHeight: 1.6}}>
                      Location is only used to match you with nearby orders. You can change or turn this off anytime from your settings.
                    </p>
                  </div>

                  <button
                    onClick={() => setStep(3)}
                    className="w-full py-3.5 rounded-[10px] text-[13.5px] font-semibold text-white mb-2.5"
                    style={{background: 'var(--orange)'}}
                  >
                    Continue
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

              {/* ── Step 3: Verify ── */}
              {step === 3 && (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{color: 'var(--orange)'}}>Step 3 of 4</p>
                  <h2
                    className="text-[20px] font-semibold mb-1.5"
                    style={{fontFamily: "'Space Grotesk', sans-serif"}}
                  >Verify your account</h2>
                  <p className="text-[12.5px] mb-4" style={{color: 'var(--gray)'}}>
                    A small one-time fee to confirm you're serious about riding.
                  </p>

                  <div className="rounded-[10px] p-3.5 mb-4" style={{background: 'var(--peach)'}}>
                    <div className="flex justify-between items-baseline mb-1.5">
                      <span
                        className="text-[22px] font-semibold"
                        style={{fontFamily: "'Space Grotesk', sans-serif"}}
                      >
                        ₦1,500
                      </span>
                      <span className="text-[11px]" style={{color: 'var(--gray)'}}>one-time</span>
                    </div>
                    <p className="text-[11.5px]" style={{color: 'var(--gray)', lineHeight: 1.5}}>
                      This keeps the platform for genuine riders only, so real orders reach real riders — not empty accounts.
                    </p>
                  </div>

                  <button
                    onClick={() => setStep(4)}
                    className="w-full py-3.5 rounded-[10px] text-[13.5px] font-semibold text-white mb-2.5"
                    style={{background: 'var(--orange)'}}
                  >
                    Pay & verify
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

              {/* ── Step 4: Go online ── */}
              {step === 4 && (
                <div className="text-center py-1.5">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-white text-xl font-semibold mx-auto mb-4"
                    style={{background: 'var(--orange)'}}
                  >
                    ✓
                  </div>
                  <h2
                    className="text-[20px] font-semibold mb-1.5"
                    style={{fontFamily: "'Space Grotesk', sans-serif"}}
                  >
                    You're verified
                  </h2>
                  <p className="text-[12.5px] mb-1" style={{color: 'var(--gray)'}}>
                    Tap in whenever you're ready to earn.
                  </p>

                  <button
                    onClick={() => setIsOnline((v) => !v)}
                    className="w-full py-3.5 rounded-[10px] text-[13.5px] font-semibold text-white mt-5 mb-4"
                    style={{background: 'var(--orange)'}}
                  >
                    {isOnline ? "End today's hustle" : "Start the day's hustle"}
                  </button>

                  <div
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11.5px] font-semibold"
                    style={{
                      background: isOnline ? '#E4F5EB' : 'var(--peach)',
                      color: isOnline ? '#1E9E5A' : 'var(--orange)',
                    }}
                  >
                    <span
                      className="w-[7px] h-[7px] rounded-full"
                      style={{background: isOnline ? '#1E9E5A' : 'var(--orange)'}}
                    />
                    {isOnline ? "You're online — orders incoming" : 'Offline'}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
