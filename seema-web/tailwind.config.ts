import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'seema-sidebar-bg': '#1b2a4a',
        'seema-sidebar-hover': '#243556',
        'seema-sidebar-active': '#2d4470',
        'seema-page-bg': '#f5f6fa',
        'seema-primary': '#2563eb',
        'seema-primary-hover': '#1d4ed8',
        'seema-text-primary': '#1a2233',
        'seema-text-secondary': '#5a6478',
        'seema-text-muted': '#8c95a6',
        'seema-status-success': '#059669',
        'seema-status-warning': '#d97706',
        'seema-status-error': '#dc2626',
        'seema-accent': '#7c3aed',
        'seema-surface': '#ffffff',
        'seema-border': '#e2e5ed',
        'seema-chart-1': '#2563eb',
        'seema-chart-2': '#7c3aed',
        'seema-chart-3': '#059669',
        'seema-chart-4': '#d97706',
        'seema-chart-5': '#dc2626',
        'seema-chart-6': '#0891b2',
      },
      fontFamily: {
        'sans': ['Inter', 'system-ui', 'sans-serif'],
      },
      spacing: {
        'sidebar-width': '280px',
        'sidebar-collapsed': '80px',
      },
      boxShadow: {
        'card-hover': '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        'glow-blue': '0 0 20px rgba(37, 99, 235, 0.3)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'pulse-subtle': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.8' },
        },
        countUp: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.3s ease-in-out',
        slideUp: 'slideUp 0.3s ease-out',
        slideDown: 'slideDown 0.3s ease-out',
        'pulse-subtle': 'pulse-subtle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        countUp: 'countUp 0.6s ease-out',
        shimmer: 'shimmer 2s infinite',
      },
    },
  },
  plugins: [],
};

export default config;
