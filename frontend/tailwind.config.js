/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    textColor: {
      black: '#000000',
      white: '#ffffff',
      // Keep other colors accessible but make black the default
      gray: {
        50: '#f9fafb',
        100: '#f3f4f6',
        200: '#e5e7eb',
        300: '#d1d5db',
        400: '#9ca3af',
        500: '#6b7280',
        600: '#4b5563',
        700: '#374151',
        800: '#1f2937',
        900: '#111827',
      },
      red: {
        500: '#ef4444',
        600: '#dc2626',
      },
      green: {
        500: '#10b981',
        600: '#059669',
      },
      blue: {
        500: '#3b82f6',
        600: '#2563eb',
      },
    },
    extend: {
      colors: {
        primary: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },
        secondary: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
          950: '#042f2e',
        }
      },
    },
  },
  plugins: [
    function({ addBase }) {
      addBase({
        'html': { color: '#000000' },
        'body': { color: '#000000' },
        'p, h1, h2, h3, h4, h5, h6, span, div, label, li': { color: '#000000' },
      });
    },
  ],
}
