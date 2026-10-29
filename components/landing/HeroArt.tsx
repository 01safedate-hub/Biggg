import type { CSSProperties } from "react";

/** Hero illustration: a washing machine with a duvet tumbling inside, a suit on a rail, folded blankets and a sneaker. */
const bub = (t: string, d: string) => ({ "--t": t, "--d": d }) as CSSProperties;

export function HeroArt() {
  return (
    <svg id="hero-art" className="h-full w-full" viewBox="-10 100 540 412" role="img" aria-labelledby="hero-art-title">
              <title id="hero-art-title">A washing machine with a duvet tumbling inside, a suit and trousers on a clothes rail, a stack of folded blankets and a sneaker on top.</title>
              <defs>
                <clipPath id="hero-mbody"><rect x="170" y="122" width="232" height="318" rx="30"/></clipPath>
                <clipPath id="hero-adire"><rect x="394" y="294" width="110" height="40" rx="13"/></clipPath>
                <path id="hero-sp" d="M0 -9 C1 -3 3 -1 9 0 C3 1 1 3 0 9 C-1 3 -3 1 -9 0 C-3 -1 -1 -3 0 -9Z"/>
              </defs>
    
              {/* backdrop */}
              <rect x="-10" y="100" width="540" height="412" rx="16" fill="#FCEBDD"/>
              <circle cx="260" cy="306" r="196" fill="#FEF5EC"/>
              <circle cx="478" cy="150" r="26" fill="#FEF5EC"/>
              <circle cx="44" cy="468" r="18" fill="#FEF5EC"/>
    
              <g transform="translate(0 40)">
                <ellipse cx="262" cy="452" rx="232" ry="15" fill="#F2D2BB"/>
    
                {/* clothes rail */}
                <g fill="#8B94A7">
                  <rect x="14" y="94" width="138" height="6" rx="3"/>
                  <rect x="22" y="94" width="6" height="354" rx="3"/>
                  <rect x="138" y="94" width="6" height="354" rx="3"/>
                  <rect x="10" y="440" width="34" height="7" rx="3.5"/>
                  <rect x="122" y="440" width="34" height="7" rx="3.5"/>
                </g>
                <circle cx="25" cy="448" r="6" fill="#0C101F"/>
                <circle cx="141" cy="448" r="6" fill="#0C101F"/>
    
                {/* suit */}
                <g>
                  <circle cx="84" cy="97" r="7" fill="none" stroke="#0C101F" strokeWidth="3"/>
                  <path d="M84 104 V124" stroke="#0C101F" strokeWidth="3" strokeLinecap="round"/>
                  <path d="M56 262 H112 L113 394 H87 L84 304 L81 394 H55Z" fill="#151B2D"/>
                  <path d="M68 290 V394 M100 290 V394" stroke="#3A4565" strokeWidth="1.5" strokeOpacity=".7"/>
                  <path d="M55 387 H81 M87 387 H113" stroke="#0A0E1A" strokeWidth="2"/>
                  <path d="M48 134 C42 138 39 146 38 158 L35 236 L50 239 L53 166 C53 152 51 142 48 134Z" fill="#151B2D"/>
                  <path d="M120 134 C126 138 129 146 130 158 L133 236 L118 239 L115 166 C115 152 117 142 120 134Z" fill="#151B2D"/>
                  <path d="M73 121 C62 123 54 128 48 135 C51 145 53 156 53 168 L51 284 H117 L115 168 C115 156 117 145 120 135 C114 128 106 123 95 121Z" fill="#1E2740"/>
                  <path d="M73 121 L84 200 L95 121Z" fill="#fff"/>
                  <path d="M73 121 L58 148 L70 160 L79 196 L84 200Z" fill="#34415F"/>
                  <path d="M95 121 L110 148 L98 160 L89 196 L84 200Z" fill="#34415F"/>
                  <path d="M80 126 H88 L87 135 H81Z" fill="#DA612A"/>
                  <path d="M81 135 H87 L90 182 L84 194 L78 182Z" fill="#DA612A"/>
                  <circle cx="84" cy="222" r="3" fill="#8E9AB5"/>
                  <circle cx="84" cy="248" r="3" fill="#8E9AB5"/>
                  <path d="M60 192 H72" stroke="#34415F" strokeWidth="3" strokeLinecap="round"/>
                  <path d="M62 192 L63 184 L67 188 L70 183 L71 192Z" fill="#F5B27E"/>
                  <g transform="translate(43 240) rotate(8)">
                    <path d="M0 0 V8" stroke="#9AA4BA" strokeWidth="1.5"/>
                    <rect x="-8" y="8" width="16" height="22" rx="3.5" fill="#fff" stroke="#9AA4BA" strokeWidth="1.5"/>
                    <circle cx="0" cy="14" r="2" fill="#9AA4BA"/>
                    <path d="M-4 21H4M-4 25H4" stroke="#D5DAE5" strokeWidth="1.8" strokeLinecap="round"/>
                  </g>
                </g>
    
                {/* washing machine */}
                <rect x="170" y="122" width="232" height="318" rx="30" fill="#fff"/>
                <g clipPath="url(#hero-mbody)">
                  <rect x="362" y="122" width="40" height="318" fill="#ECEEF4"/>
                  <rect x="170" y="122" width="232" height="62" fill="#F4F5F9"/>
                  <rect x="170" y="183" width="232" height="3" fill="#E3E6EE"/>
                </g>
                <rect x="190" y="140" width="86" height="26" rx="9" fill="#E6E9F0"/>
                <rect x="200" y="150" width="38" height="6" rx="3" fill="#C5CBD9"/>
                <circle cx="300" cy="153" r="4.5" fill="#3FAF7F"/>
                <circle cx="314" cy="153" r="4.5" fill="#DA612A"/>
                <circle cx="354" cy="153" r="19" fill="#0C101F"/>
                <circle cx="354" cy="153" r="11" fill="#28324D"/>
                <path d="M354 153 V141" stroke="#DA612A" strokeWidth="3.5" strokeLinecap="round" transform="rotate(35 354 153)"/>
    
                <rect x="376" y="296" width="14" height="34" rx="7" fill="#F0C9AE"/>
                <circle cx="286" cy="312" r="96" fill="#DA612A"/>
                <circle cx="286" cy="312" r="84" fill="#FFEEE3"/>
                <g transform="translate(286 312)">
                  <clipPath id="hero-glass"><circle r="72"/></clipPath>
                  <g clipPath="url(#hero-glass)">
                    <circle r="72" fill="#8FCDE0"/>
                    <path d="M-76 8 C-52 -2 -34 16 -10 8 S32 -2 54 8 S72 12 76 8 V80 H-76Z" fill="#62B2CD"/>
                    <g>
                      <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="11s" repeatCount="indefinite"/>
                      <rect x="-58" y="-14" width="70" height="26" rx="13" transform="rotate(-28)" fill="#F5A05A"/>
                      <path d="M-38 6 C-42 -26 -14 -44 14 -40 C44 -36 60 -10 52 20 C44 46 12 56 -14 48 C-32 42 -37 26 -38 6Z" fill="#fff"/>
                      <path d="M-20 -2 C-2 -20 24 -14 40 6" fill="none" stroke="#C9D6E4" strokeWidth="3" strokeLinecap="round"/>
                      <path d="M-22 24 C-4 36 20 36 36 22" fill="none" stroke="#DCE5EF" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="4 6"/>
                    </g>
                    <g fill="#fff" fillOpacity=".3" stroke="#fff" strokeWidth="2">
                      <circle className="hero-bub" style={bub("5s", "0s")} cx="-46" cy="-30" r="6"/>
                      <circle className="hero-bub" style={bub("6s", "1.2s")} cx="38" cy="-50" r="4.5"/>
                      <circle className="hero-bub" style={bub("7s", "2.2s")} cx="54" cy="16" r="7"/>
                      <circle className="hero-bub" style={bub("5.5s", ".6s")} cx="-24" cy="48" r="5"/>
                    </g>
                    <path d="M-60 -30 A66 66 0 0 1 -26 -58" fill="none" stroke="#fff" strokeOpacity=".6" strokeWidth="7" strokeLinecap="round"/>
                  </g>
                </g>
                <rect x="192" y="440" width="34" height="10" rx="4" fill="#B5BCCB"/>
                <rect x="346" y="440" width="34" height="10" rx="4" fill="#B5BCCB"/>
    
                {/* stack of folded blankets */}
                <g>
                  <rect x="386" y="410" width="124" height="40" rx="13" fill="#DA612A"/>
                  <rect x="404" y="410" width="5" height="40" fill="#fff" fillOpacity=".5"/>
                  <rect x="413" y="410" width="2.5" height="40" fill="#fff" fillOpacity=".5"/>
    
                  <rect x="388" y="370" width="122" height="42" rx="15" fill="#fff"/>
                  <g fill="none" stroke="#D5DAE6" strokeWidth="2" strokeLinecap="round" strokeDasharray="5 6">
                    <path d="M402 391 H496"/>
                    <path d="M426 378 V404 M449 378 V404 M472 378 V404"/>
                  </g>
    
                  <rect x="392" y="332" width="114" height="40" rx="13" fill="#F5B27E"/>
                  <rect x="478" y="332" width="5" height="40" fill="#1E2740" fillOpacity=".85"/>
                  <rect x="487" y="332" width="2.5" height="40" fill="#1E2740" fillOpacity=".85"/>
    
                  <rect x="394" y="294" width="110" height="40" rx="13" fill="#1E2740"/>
                  <g clipPath="url(#hero-adire)" fill="none" stroke="#fff" strokeOpacity=".85" strokeWidth="2">
                    <circle cx="418" cy="314" r="8"/><circle cx="418" cy="314" r="3.5"/>
                    <circle cx="449" cy="314" r="8"/><circle cx="449" cy="314" r="3.5"/>
                    <circle cx="480" cy="314" r="8"/><circle cx="480" cy="314" r="3.5"/>
                    <g fill="#fff" fillOpacity=".85" stroke="none">
                      <circle cx="433" cy="302" r="2"/><circle cx="464" cy="302" r="2"/>
                      <circle cx="433" cy="326" r="2"/><circle cx="464" cy="326" r="2"/>
                    </g>
                  </g>
                </g>
    
                {/* sneaker (drawn with its sole bottom at y=0, toe to the right) */}
                <ellipse cx="448" cy="452" rx="66" ry="5" fill="#E5C3AB"/>
                <g transform="translate(396 295) scale(.94)">
                  <path d="M4 -14 C2 -26 2 -42 6 -54 C14 -58 24 -58 32 -54 L36 -66 C40 -70 48 -68 50 -62 C62 -54 78 -46 92 -38 C106 -35 119 -28 122 -14Z" fill="#DA612A"/>
                  <path d="M92 -38 C106 -35 119 -28 122 -14 H98 C100 -24 98 -32 92 -38Z" fill="#fff"/>
                  <path d="M4 -14 C2 -24 2 -34 4 -42 L20 -42 C18 -34 18 -22 20 -14Z" fill="#B64A1B"/>
                  <path d="M30 -54 L36 -66 C40 -70 48 -68 50 -62 L46 -54Z" fill="#fff"/>
                  <path d="M52 -57 l-5 10 M61 -52 l-5 10 M70 -48 l-5 10 M79 -44 l-5 10" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"/>
                  <path d="M6 -54 C3 -60 5 -64 10 -66 L15 -55Z" fill="#F5B27E"/>
                  <path d="M24 -21 H90" fill="none" stroke="#fff" strokeOpacity=".9" strokeWidth="2.2" strokeLinecap="round" strokeDasharray="4 5"/>
                  <rect x="0" y="-14" width="123" height="14" rx="7" fill="#fff"/>
                  <rect x="6" y="-6" width="111" height="2.5" rx="1.25" fill="#D5DAE6"/>
                </g>
    
                {/* sparkles and loose bubbles */}
                <use href="#hero-sp" transform="translate(506 244) scale(.9)" fill="#DA612A"/>
                <use href="#hero-sp" transform="translate(386 232) scale(.6)" fill="#fff"/>
                <use href="#hero-sp" transform="translate(176 92) scale(.8)" fill="#DA612A"/>
                <use href="#hero-sp" transform="translate(40 86) scale(.55)" fill="#fff"/>
                <g fill="#fff" fillOpacity=".6" stroke="#fff" strokeWidth="2">
                  <circle className="hero-bub" style={bub("7s", "0s")} cx="206" cy="100" r="8"/>
                  <circle className="hero-bub" style={bub("8s", "2s")} cx="236" cy="82" r="5"/>
                  <circle className="hero-bub" style={bub("6.5s", "3.4s")} cx="112" cy="84" r="6"/>
                </g>
              </g>
            </svg>
  );
}
