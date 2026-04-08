/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        'ios-blue': '#0A84FF',
        'ios-green': '#30D158',
        'ios-orange': '#FF9F0A',
        'ios-red': '#FF453A',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
