import type {Config} from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        orange: {
          DEFAULT: '#FF6A00',
          dark: '#E85D00',
        },
        ink: '#201C1A',
        gray: '#8C8681',
        white: '#FFFDFB',
        peach: '#FFF1E6',
        line: '#F0E1D2',
        green: '#1E9E5A',
        teal: '#2F6B66',
        red: '#C1453A',
        background: 'var(--white)',
        foreground: 'var(--ink)',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Space Grotesk', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '14px',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontSize: {
        'xxs': '9px',
        'xxs-base': ['10.5px', {lineHeight: '1.5'}],
      },
      boxShadow: {
        tray: '0 10px 30px rgba(32,28,26,0.25)',
        card: '0 4px 14px rgba(32,28,26,0.06)',
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        pulse: 'pulse 1.6s infinite',
      },
      keyframes: {
        'accordion-down': {
          from: {height: '0'},
          to: {height: 'var(--radix-accordion-content-height)'},
        },
        'accordion-up': {
          from: {height: 'var(--radix-accordion-content-height)'},
          to: {height: '0'},
        },
        pulse: {
          '0%': {boxShadow: '0 0 0 0 rgba(30,158,90,0.4)'},
          '70%': {boxShadow: '0 0 0 6px rgba(30,158,90,0)'},
          '100%': {boxShadow: '0 0 0 0 rgba(30,158,90,0)'},
        },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
export default config;
