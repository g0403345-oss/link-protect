import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        discord: {
          bg: '#111214',
          surface: '#1e1f22',
          surface2: '#2b2d31',
          surface3: '#35373c',
          blurple: '#5865f2',
          'blurple-dark': '#4752c4',
          green: '#3ba55d',
          red: '#ed4245',
          yellow: '#faa81a',
          text: '#f2f3f5',
          muted: '#b5bac1',
          dim: '#6d6f78',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
      animation: {
        'blob1': 'blob1 20s ease-in-out infinite',
        'blob2': 'blob2 25s ease-in-out infinite',
        'blob3': 'blob3 18s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'chat-appear': 'chatAppear 0.4s ease forwards',
        'typing': 'typing 1.5s steps(3, end) infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'spin-slow': 'spin 8s linear infinite',
      },
      keyframes: {
        blob1: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(80px, -60px) scale(1.15)' },
          '66%': { transform: 'translate(-40px, 40px) scale(0.9)' },
        },
        blob2: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(-80px, 60px) scale(0.9)' },
          '66%': { transform: 'translate(60px, -80px) scale(1.1)' },
        },
        blob3: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '50%': { transform: 'translate(60px, 80px) scale(1.2)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        chatAppear: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        typing: {
          '0%': { content: '""' },
          '33%': { content: '"."' },
          '66%': { content: '".."' },
          '100%': { content: '"..."' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        'blurple': '0 0 30px rgba(88, 101, 242, 0.3)',
        'blurple-lg': '0 0 60px rgba(88, 101, 242, 0.4)',
        'glow-green': '0 0 20px rgba(59, 165, 93, 0.4)',
        'glow-red': '0 0 20px rgba(237, 66, 69, 0.4)',
        'card': '0 4px 24px rgba(0, 0, 0, 0.4)',
      },
    },
  },
  plugins: [],
};

export default config;
