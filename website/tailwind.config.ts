import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#F8F5EE',
        surface: '#FFFDF8',
        muted: '#F0EBDF',
        ink: '#15251F',
        'ink-soft': '#46544E',
        'ink-faint': '#5F6B65',
        forest: '#173D32',
        'forest-deep': '#0E2C24',
        sage: '#DFE9DD',
        accent: '#E8A15D',
        'accent-soft': '#F8E7D1',
        line: '#DED7C9',
        'line-strong': '#BBB2A0',
        danger: '#A83F36',
        'danger-soft': '#F8E7E3',
        success: '#2F6B52',
        'success-soft': '#E1ECDD',
      },
      fontFamily: {
        sans: [
          'Inter Variable',
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'sans-serif',
        ],
      },
      maxWidth: {
        shell: '78rem',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        'scan-line': {
          '0%': { transform: 'translateY(-10%)', opacity: '0' },
          '12%': { opacity: '1' },
          '88%': { opacity: '1' },
          '100%': { transform: 'translateY(460%)', opacity: '0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'pulse-dot': {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.9' },
          '50%': { transform: 'scale(1.35)', opacity: '0.5' },
        },
      },
      animation: {
        'scan-line': 'scan-line 4.5s cubic-bezier(0.45, 0, 0.55, 1) infinite',
        float: 'float 7s ease-in-out infinite',
        'pulse-dot': 'pulse-dot 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
