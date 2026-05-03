import type { Config } from 'tailwindcss'

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
        // CHAO OS grayscale palette
        g05: '#f4f4f4',
        g10: '#e8e8e8',
        g15: '#dcdcdc',
        g20: '#cfcfcf',
        g25: '#c3c3c3',
        g30: '#b7b7b7',
        g35: '#ababab',
        g40: '#9f9f9f',
        g45: '#939393',
        g50: '#878787',
        g55: '#7b7b7b',
        g60: '#6f6f6f',
        g65: '#636363',
        g70: '#575757',
        g75: '#4b4b4b',
        g80: '#3f3f3f',
        g85: '#333333',
        g90: '#272727',
        g95: '#1a1a1a',
        // Base colors
        black: '#000000',
        white: '#ffffff',
        // Status colors
        green: '#4ade80',
        yellow: '#facc15',
        red: '#f87171',
        blue: '#60a5fa',
      },
      fontFamily: {
        display: ['DM Serif Display', 'serif'],
        mono: ['DM Mono', 'monospace'],
        ui: ['Syne', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
