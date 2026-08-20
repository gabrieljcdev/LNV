/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'pastel-blue':      '#c8daf0',
        'pastel-blue-mid':  '#a8c4e8',
        'pastel-blue-dark': '#7aa8d8',
        'charcoal':         '#3a3d42',
        'gunmetal':         '#2a2d32',
        'gunmetal-dark':    '#1e2126',
        'off-white':        '#f4f6f9',
        'grey-light':       '#e8ecf0',
        'grey-mid':         '#b0b8c4',
        'grey-text':        '#6a7480',
        'lnv-orange':       '#e85d04',
        'lnv-orange-dark':  '#c44d00',
      },
      fontFamily: {
        terminal: ['VT323', 'monospace'],
        sans:     ['Barlow', 'sans-serif'],
      },
    },
  },
  plugins: [],
}