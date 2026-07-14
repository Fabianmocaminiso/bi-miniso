/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        miniso: {
          red:   "#C8102E",
          black: "#1A1A1A",
          dark:  "#0D0D0D",
        }
      }
    }
  },
  plugins: [],
}
