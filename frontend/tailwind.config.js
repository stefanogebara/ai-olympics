/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    // Dynamic neon color classes used in games and components
    { pattern: /bg-neon-(cyan|magenta|green|blue|gold)\/(10|20)/ },
    { pattern: /text-neon-(cyan|magenta|green|blue|gold)/ },
    { pattern: /border-neon-(cyan|magenta|green|blue|gold)\/(20|30|50)/ },
    // Additional dynamic color patterns used across the app
    'bg-neon-cyan/20', 'bg-neon-magenta/20', 'bg-neon-green/20', 'bg-neon-blue/20', 'bg-neon-gold/10',
    'text-neon-cyan', 'text-neon-magenta', 'text-neon-green', 'text-neon-blue', 'text-neon-gold',
    'border-neon-gold', 'border-neon-gold/20',
    // Game-specific colors
    'bg-yellow-500/20', 'text-yellow-500', 'bg-purple-500/20', 'text-purple-500',
    'bg-orange-500/20', 'text-orange-500', 'bg-emerald-500/20', 'text-emerald-500',
    'bg-rose-500/20', 'text-rose-500',
  ],
  theme: {
    extend: {
      colors: {
        // Cyberpunk dark backgrounds
        'cyber-dark': '#08080D',
        'cyber-navy': '#101019',
        'cyber-elevated': '#17172A',
        'cyber-surface': '#12121F',
        'cyber-line': 'rgba(255,255,255,0.08)',

        // Neon accent colors
        'neon-cyan': '#00F5FF',
        'neon-magenta': '#FF00FF',
        'neon-blue': '#0066FF',
        'neon-green': '#00FF88',
        'neon-gold': '#FFD700',

        // Agent-specific colors
        'agent-claude': '#D97706',
        'agent-gpt': '#10B981',
        'agent-gemini': '#4285F4',
        'agent-llama': '#7C3AED',
      },
      fontFamily: {
        display: ['Orbitron', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        body: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        // Glass elevation — inner top highlight + soft ambient drop
        'glass': '0 1px 0 0 rgba(255,255,255,0.05) inset, 0 8px 24px -12px rgba(0,0,0,0.65)',
        'glass-lg': '0 1px 0 0 rgba(255,255,255,0.06) inset, 0 24px 56px -20px rgba(0,0,0,0.75)',
        // Neon glows for hover/active accents
        'glow-cyan': '0 0 28px -6px rgba(0,245,255,0.40)',
        'glow-magenta': '0 0 28px -6px rgba(255,0,255,0.35)',
        'glow-green': '0 0 28px -6px rgba(0,255,136,0.35)',
      },
      animation: {
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'slide-in': 'slide-in 0.3s ease-out',
        'score-pop': 'score-pop 0.5s ease-out',
        'bracket-advance': 'bracket-advance 0.6s ease-out',
        'fade-up': 'fade-up 0.5s ease-out both',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(0, 245, 255, 0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(0, 245, 255, 0.6)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-14px)' },
        },
        'slide-in': {
          '0%': { transform: 'translateX(-100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'score-pop': {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.2)' },
          '100%': { transform: 'scale(1)' },
        },
        'bracket-advance': {
          '0%': { transform: 'translateX(-20px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};
