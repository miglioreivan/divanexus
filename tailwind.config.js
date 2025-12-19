/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bgApp: '#09090b',    /* Zinc-950 */
        cardDark: '#18181b', /* Zinc-900 */
        accent: 'var(--color-accent)',
        accentHover: 'var(--color-accent-hover)',
        textMain: '#f4f4f5', /* Zinc-100 */
        textMuted: '#a1a1aa', /* Zinc-400 */
        danger: '#ef4444',
        success: '#10b981'
      },
      fontFamily: { sans: ['Inter', 'sans-serif'] }
    },
  },
  plugins: [],
}
