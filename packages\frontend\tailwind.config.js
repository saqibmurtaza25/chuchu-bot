/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        athena: {
          bg: '#0B0E14',
          card: '#121824',
          panel: '#1A2333',
          border: '#243047',
          cyan: '#00F0FF',
          green: '#00E676',
          red: '#FF1744',
          purple: '#7C4DFF',
          yellow: '#FFC400',
          text: '#E2E8F0',
          muted: '#64748B'
        }
      },
      fontFamily: {
        mono: ['IBM Plex Mono', 'JetBrains Mono', 'Fira Code', 'Courier New', 'monospace'],
        sans: ['IBM Plex Sans', 'Inter', 'system-ui', 'sans-serif']
      }
    },
  },
  plugins: [],
}
