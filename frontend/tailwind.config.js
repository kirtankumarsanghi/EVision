/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /* Warm editorial neutrals — replaces the default blue-grey slate */
        slate: {
          50: '#faf8f5',
          100: '#f3efe9',
          200: '#e6dfd6',
          300: '#d2c8bb',
          400: '#a99d8f',
          500: '#7f7468',
          600: '#615850',
          700: '#4b443d',
          800: '#332e29',
          900: '#1c1917',
          950: '#12100e',
        },
        /* Burnt copper accent */
        brand: {
          50: '#fdf6ef',
          100: '#fae9d8',
          200: '#f3d0ae',
          300: '#e8ae7c',
          400: '#dc8849',
          500: '#cf6c2a',
          600: '#b85420',
          700: '#963f1d',
          800: '#7a341d',
          900: '#642c1b',
          950: '#37150b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Archivo', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      /* Squared, editorial geometry instead of pill-like cards */
      borderRadius: {
        lg: '6px',
        xl: '7px',
        '2xl': '9px',
        '3xl': '11px',
      },
    },
  },
  plugins: [],
};
