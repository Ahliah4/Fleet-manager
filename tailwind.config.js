/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Source palette: #F2F2F2 · #DAD9D4 · #9D9C98 · #E63D3A · #131313
        // The scale only adds siblings needed for text/state contrast; #e63d3a
        // stays the identity accent at 500.
        brand: {
          50: "#fff1f0",
          100: "#ffe0de",
          200: "#ffc2be",
          300: "#ff9690",
          400: "#f56660", // 5.7:1 on dark surfaces (auth cards)
          500: "#e63d3a", // ACCENT — borders, rings, icons, large display text
          600: "#cf2929", // 5.25:1 on white — smallest fill that keeps AA
          700: "#ad2023", // 6.99:1 — hover / pressed
          800: "#8f1a1e",
          900: "#771d23",
          950: "#410b10",
        },
        canvas: "#f2f2f2",
        stone: { DEFAULT: "#dad9d4", dark: "#9d9c98" },
        ink: "#131313",
      },
    },
  },
  plugins: [],
};
