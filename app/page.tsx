'use client';

import Link from 'next/link';
import {useEffect, useMemo, useRef, useState} from 'react';
import {
  ShoppingBag,
  Store,
  Bike,
  LayoutGrid,
  ArrowRight,
  Pizza,
  Sandwich,
  Soup,
  IceCream2,
  Beef,
  Salad,
  Cookie,
  Coffee,
  Fish,
  UtensilsCrossed,
} from 'lucide-react';

const portals = [
  {
    href: '/order',
    icon: ShoppingBag,
    title: 'Order Food',
    badge: 'CUSTOMER APP',
    description: 'Browse restaurants, search dishes, track your delivery.',
  },
  {
    href: '/restaurant-portal',
    icon: Store,
    title: 'Restaurant Portal',
    badge: 'FOR SELLERS',
    description: 'Register your kitchen and get on BigFoods.',
  },
  {
    href: '/rider-portal',
    icon: Bike,
    title: 'Rider Portal',
    badge: 'FOR DISPATCH',
    description: 'Apply to ride and earn on your own schedule.',
  },
  {
    href: '/admin',
    icon: LayoutGrid,
    title: 'Admin Console',
    badge: 'INTERNAL',
    description: 'Platform dashboard, zone map, and restaurant management.',
  },
];

const LOGO_URL =
  'https://dpioixansygkjdbphfdj.supabase.co/storage/v1/object/public/product-images/0.4927238865897102.webp';

const FOOD_ICONS = [Pizza, Sandwich, Soup, IceCream2, Beef, Salad, Cookie, Coffee, Fish, UtensilsCrossed];

const FOOD_ITEMS = FOOD_ICONS.map((Icon, i) => {
  const count = FOOD_ICONS.length;
  const angle = (i / count) * Math.PI * 2;
  const dist = 120 + (i % 3) * 26;
  const x = Math.cos(angle) * dist;
  const y = Math.sin(angle) * dist;
  const rot = ((i * 47) % 70) - 35;
  return {
    Icon,
    x: Math.round(x),
    y: Math.round(y),
    rot,
    outDelay: i * 0.035,
    inDelay: (count - i) * 0.02,
  };
});

type Stage = 'place' | 'bike' | 'explode' | 'implode' | 'logo' | 'shrink' | 'hide' | 'done';

export default function PortalHome() {
  const [stage, setStage] = useState<Stage>('place');
  const realLogoRef = useRef<HTMLDivElement>(null);
  const splashLogoRef = useRef<HTMLDivElement>(null);
  const [logoTransform, setLogoTransform] = useState({tx: 0, ty: 0, ts: 0.3});

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    timers.push(setTimeout(() => setStage('bike'), 1500));
    timers.push(setTimeout(() => setStage('explode'), 3400));
    timers.push(setTimeout(() => setStage('implode'), 4300));
    timers.push(setTimeout(() => setStage('logo'), 4950));
    timers.push(
      setTimeout(() => {
        const target = realLogoRef.current?.getBoundingClientRect();
        const splash = splashLogoRef.current?.getBoundingClientRect();
        if (target && splash) {
          const targetCenterX = target.left + target.width / 2;
          const targetCenterY = target.top + target.height / 2;
          const splashCenterX = splash.left + splash.width / 2;
          const splashCenterY = splash.top + splash.height / 2;
          setLogoTransform({
            tx: targetCenterX - splashCenterX,
            ty: targetCenterY - splashCenterY,
            ts: target.width / splash.width,
          });
        }
        setStage('shrink');
      }, 5700)
    );
    timers.push(setTimeout(() => setStage('hide'), 6450));
    timers.push(setTimeout(() => setStage('done'), 7100));

    return () => timers.forEach(clearTimeout);
  }, []);

  const overlayStyle = useMemo<React.CSSProperties>(
    () => ({
      '--tx': `${logoTransform.tx}px`,
      '--ty': `${logoTransform.ty}px`,
      '--ts': `${logoTransform.ts}`,
    } as React.CSSProperties),
    [logoTransform]
  );

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-5 py-12"
      style={{background: 'var(--white)'}}
    >
      <div className="w-full max-w-[360px]">
        {/* Brand */}
        <div className="flex flex-col items-center mb-10">
          <div
            ref={realLogoRef}
            className="w-12 h-12 rounded-xl mb-3 flex items-center justify-center overflow-hidden"
            style={{background: 'var(--orange)'}}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_URL} alt="BigFoods" className="w-full h-full object-cover" />
          </div>
          <h1
            className="text-[26px] font-bold tracking-tight mb-1"
            style={{fontFamily: "'Space Grotesk', sans-serif", color: 'var(--ink)'}}
          >
            BigFoods
          </h1>
          <p style={{color: 'var(--gray)', fontSize: '13px'}}>
            Awka, Anambra — choose a portal
          </p>
        </div>

        {/* Portal cards */}
        <div className="flex flex-col gap-3">
          {portals.map(({href, icon: Icon, title, badge, description}) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-4 bg-white rounded-2xl px-4 py-4 transition-all hover:shadow-card active:scale-[0.98]"
              style={{border: '1px solid var(--line)'}}
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{background: 'var(--peach)'}}
              >
                <Icon className="w-5 h-5" style={{color: 'var(--orange)'}} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span
                    className="font-semibold text-[15px]"
                    style={{fontFamily: "'Space Grotesk', sans-serif", color: 'var(--ink)'}}
                  >
                    {title}
                  </span>
                  <span
                    className="text-[9.5px] font-bold px-2 py-0.5 rounded-full"
                    style={{background: 'var(--peach)', color: 'var(--orange-dark)'}}
                  >
                    {badge}
                  </span>
                </div>
                <p style={{color: 'var(--gray)', fontSize: '12px', lineHeight: '1.4'}}>
                  {description}
                </p>
              </div>

              <ArrowRight className="w-4 h-4 flex-shrink-0" style={{color: 'var(--gray)'}} />
            </Link>
          ))}
        </div>
      </div>

      {/* ============ SPLASH INTRO ============ */}
      {stage !== 'done' && (
        <div
          id="bf-splash"
          data-stage={stage}
          style={overlayStyle}
          className={stage === 'hide' ? 'bf-splash bf-splash-out' : 'bf-splash'}
        >
          <div className="bf-stage bf-s-place">
            <span className="bf-eyebrow">For the people of</span>
            <h2 className="bf-title">Anambra</h2>
          </div>

          <div className="bf-stage bf-s-bike">
            <div className="bf-road-text">Your order&apos;s on the way</div>
            <div className="bf-dust" />
            <div className="bf-bike">
              <Bike size={48} color="#fff" strokeWidth={2} />
            </div>
          </div>

          <div className="bf-stage bf-s-food">
            <div className="bf-food-center">
              {FOOD_ITEMS.map(({Icon, x, y, rot, outDelay, inDelay}, i) => (
                <div
                  key={i}
                  className="bf-food-item"
                  style={
                    {
                      '--x': `${x}px`,
                      '--y': `${y}px`,
                      '--r': `${rot}deg`,
                      '--d': `${outDelay}s`,
                      '--di': `${inDelay}s`,
                    } as React.CSSProperties
                  }
                >
                  <Icon size={34} color="#fff" strokeWidth={1.75} />
                </div>
              ))}
            </div>
          </div>

          <div className="bf-stage bf-s-logo">
            <div ref={splashLogoRef} className="bf-splash-logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={LOGO_URL} alt="" />
            </div>
          </div>
        </div>
      )}

      <style>{`
        .bf-splash{
          position:fixed;inset:0;z-index:999;
          background:radial-gradient(120% 120% at 50% 30%, #FF7A2E 0%, var(--orange) 45%, var(--orange-dark) 100%);
          display:flex;align-items:center;justify-content:center;
          overflow:hidden;
        }
        .bf-splash-out{ animation:bfSplashOut .6s ease forwards; pointer-events:none; }
        @keyframes bfSplashOut{ to{opacity:0;} }

        .bf-stage{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
          opacity:0;pointer-events:none;}

        .bf-s-place{flex-direction:column;}
        .bf-eyebrow{
          color:rgba(255,255,255,.75);font-size:12px;letter-spacing:.28em;
          text-transform:uppercase;font-weight:600;margin-bottom:10px;
          opacity:0;transform:translateY(8px);
        }
        .bf-title{
          font-family:'Space Grotesk',sans-serif;color:#fff;font-size:34px;font-weight:700;
          margin:0;text-align:center;letter-spacing:-0.01em;
          opacity:0;transform:translateY(14px);
        }
        #bf-splash[data-stage="place"] .bf-s-place{opacity:1;pointer-events:auto;}
        #bf-splash[data-stage="place"] .bf-eyebrow{animation:bfRiseIn .5s .1s ease forwards;}
        #bf-splash[data-stage="place"] .bf-title{animation:bfRiseIn .6s .28s ease forwards;}
        @keyframes bfRiseIn{to{opacity:1;transform:translateY(0);}}

        .bf-s-bike{overflow:hidden;}
        .bf-road-text{
          position:absolute;top:38%;left:0;right:0;text-align:center;
          font-family:'Space Grotesk',sans-serif;color:#fff;font-size:22px;font-weight:600;
          opacity:0;
        }
        .bf-bike{
          position:absolute;top:52%;left:-15%;transform:translateY(-50%) scaleX(-1);
          filter:drop-shadow(0 8px 14px rgba(0,0,0,.25));
        }
        .bf-dust{
          position:absolute;top:63%;left:-20%;width:120px;height:3px;
          border-radius:99px;background:rgba(255,255,255,.5);opacity:0;
        }
        #bf-splash[data-stage="bike"] .bf-s-bike{opacity:1;pointer-events:auto;}
        #bf-splash[data-stage="bike"] .bf-road-text{animation:bfFadeHold 2.2s ease forwards;}
        #bf-splash[data-stage="bike"] .bf-bike{animation:bfRideAcross 1.7s .15s cubic-bezier(.35,.02,.4,1) forwards;}
        #bf-splash[data-stage="bike"] .bf-dust{animation:bfRideAcross 1.7s .15s cubic-bezier(.35,.02,.4,1) forwards, bfDustFade 1.7s .15s ease forwards;}
        @keyframes bfRideAcross{0%{left:-15%;}100%{left:108%;}}
        @keyframes bfDustFade{0%,80%{opacity:.6;}100%{opacity:0;}}
        @keyframes bfFadeHold{0%{opacity:0;transform:translateY(10px);}20%{opacity:1;transform:translateY(0);}85%{opacity:1;}100%{opacity:0;}}

        .bf-food-center{position:relative;width:10px;height:10px;}
        .bf-food-item{
          position:absolute;top:0;left:0;
          display:flex;align-items:center;justify-content:center;
          transform:translate(-50%,-50%) scale(0);
          opacity:0;
        }
        #bf-splash[data-stage="explode"] .bf-s-food{opacity:1;pointer-events:auto;}
        #bf-splash[data-stage="explode"] .bf-food-item{
          animation:bfFoodOut .65s cubic-bezier(.2,.75,.3,1.15) forwards;
          animation-delay:var(--d,0s);
        }
        #bf-splash[data-stage="implode"] .bf-s-food{opacity:1;pointer-events:auto;}
        #bf-splash[data-stage="implode"] .bf-food-item{
          transform:translate(calc(-50% + var(--x)), calc(-50% + var(--y))) scale(1) rotate(var(--r));
          opacity:1;
          animation:bfFoodIn .55s cubic-bezier(.5,0,.75,0) forwards;
          animation-delay:var(--di,0s);
        }
        @keyframes bfFoodOut{
          0%{transform:translate(-50%,-50%) scale(0) rotate(0deg);opacity:0;}
          60%{opacity:1;}
          100%{transform:translate(calc(-50% + var(--x)), calc(-50% + var(--y))) scale(1) rotate(var(--r));opacity:1;}
        }
        @keyframes bfFoodIn{
          0%{transform:translate(calc(-50% + var(--x)), calc(-50% + var(--y))) scale(1) rotate(var(--r));opacity:1;}
          100%{transform:translate(-50%,-50%) scale(0) rotate(0deg);opacity:0;}
        }

        .bf-splash-logo{
          width:120px;height:120px;border-radius:30px;overflow:hidden;
          box-shadow:0 20px 50px -12px rgba(0,0,0,.35);
          transform:scale(0);opacity:0;
          background:var(--orange);
        }
        .bf-splash-logo img{width:100%;height:100%;object-fit:cover;display:block;}
        #bf-splash[data-stage="logo"] .bf-s-logo{opacity:1;pointer-events:auto;}
        #bf-splash[data-stage="logo"] .bf-splash-logo{animation:bfLogoPop .5s cubic-bezier(.2,.8,.3,1.3) forwards;}
        @keyframes bfLogoPop{
          0%{transform:scale(0);opacity:0;}
          70%{transform:scale(1.08);opacity:1;}
          100%{transform:scale(1);opacity:1;}
        }
        #bf-splash[data-stage="shrink"] .bf-s-logo{opacity:1;pointer-events:auto;}
        #bf-splash[data-stage="shrink"] .bf-splash-logo{
          transform:translate(var(--tx,0px),var(--ty,0px)) scale(var(--ts,0.3));
          border-radius:12px;
          transition:transform .7s cubic-bezier(.6,0,.2,1), border-radius .7s ease;
        }
        #bf-splash[data-stage="hide"] .bf-s-logo{opacity:1;pointer-events:auto;}
        #bf-splash[data-stage="hide"] .bf-splash-logo{
          transform:translate(var(--tx,0px),var(--ty,0px)) scale(var(--ts,0.3));
          border-radius:12px;
        }
      `}</style>
    </div>
  );
}
