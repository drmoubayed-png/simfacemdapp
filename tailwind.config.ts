import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        bg: '#000000',
        surface: '#0D0D0D',
        'surface-2': '#141414',
        gold: '#C9A84C',
        'gold-hover': '#DFC06A',
        star: '#F5A623',
        success: '#5DB075',
        error: '#E05252'
      },
      fontFamily: {
        display: ['var(--font-cormorant)', 'Cormorant Garamond', 'serif'],
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
};

export default config;
