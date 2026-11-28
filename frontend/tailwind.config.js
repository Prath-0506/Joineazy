export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: { ink: '#1b2a41', paper: '#f6f5f1', pine: '#0f6b5c', amber: { 600: '#b45309' }, line: '#d9d6cc' },
      fontFamily: { sans: ['"Instrument Sans"', 'system-ui', 'sans-serif'], display: ['"Fraunces"', 'Georgia', 'serif'] },
    },
  },
  plugins: [],
};
