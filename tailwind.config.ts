import type { Config } from 'tailwindcss'

/**
 * CHAO OS design tokens.
 *
 * The `g` scale is a neutral, very slightly warm grayscale where a HIGHER
 * number is DARKER (g95 = app background, g05 = near white). It mirrors the
 * CSS custom properties in app/globals.css — keep both in sync.
 *
 * IMPORTANT: status colours (green / yellow / red / blue / amber …) are NOT
 * overridden here. A previous version set `green: '#4ade80'` as a single
 * value, which silently wiped out the whole Tailwind scale — every
 * `text-green-400`, `bg-red-900/20`, `bg-yellow-400` in the app generated no
 * CSS at all. Use the stock Tailwind scales for status colours.
 */
const g = {
  g05: '#f4f4f2',
  g10: '#e6e6e3',
  g15: '#d5d5d1',
  g20: '#c3c3be', // body text
  g25: '#afafaa',
  g30: '#9b9b96', // secondary text
  g35: '#8c8c87',
  g40: '#82827d', // labels / meta
  g45: '#6e6e69',
  g50: '#5f5f5b', // placeholders / disabled
  g55: '#4d4d4a',
  g60: '#3f3f3c',
  g65: '#353532',
  g70: '#2d2d2b', // strong borders / inputs
  g75: '#272725',
  g80: '#212120', // hairlines / hover fill
  g85: '#181817', // cards
  g90: '#121211', // chrome (sidebar, topbar, drawers)
  g95: '#0b0b0a', // app background
}

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ...g,
        black: '#000000',
        white: '#ffffff',
        accent: {
          DEFAULT: '#d6c7a1', // warm "trace paper" accent for focus / highlights
          muted: '#d6c7a11f',
        },
      },
      borderColor: {
        DEFAULT: g.g80,
      },
      fontFamily: {
        display: ['DM Serif Display', 'Georgia', 'serif'],
        mono: ['DM Mono', 'ui-monospace', 'monospace'],
        ui: ['Syne', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        panel: '0 0 0 1px rgba(255,255,255,0.03), 0 24px 48px -12px rgba(0,0,0,0.6)',
      },
      keyframes: {
        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'pop-in': {
          from: { opacity: '0', transform: 'translateY(6px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        'slide-in-right': 'slide-in-right 220ms cubic-bezier(0.22, 1, 0.36, 1)',
        'fade-in': 'fade-in 160ms ease-out',
        'pop-in': 'pop-in 180ms cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
}

export default config
