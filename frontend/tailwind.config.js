/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    // Dynamic neon color classes used in games and components
    { pattern: /bg-neon-(cyan|magenta|green|blue)\/20/ },
    { pattern: /text-neon-(cyan|magenta|green|blue)/ },
    // Additional dynamic color patterns used across the app
    'bg-neon-cyan/20', 'bg-neon-magenta/20', 'bg-neon-green/20', 'bg-neon-blue/20',
    'text-neon-cyan', 'text-neon-magenta', 'text-neon-green', 'text-neon-blue',
    // Game-specific colors (yellow, purple used as neon- variants)
    'bg-yellow-500/20', 'text-yellow-500', 'bg-purple-500/20', 'text-purple-500',
  ],
  theme: {
    extend: {
      colors: {
        // Cyberpunk dark backgrounds
        'cyber-dark': '#0A0A0F',
        'cyber-navy': '#12121A',
        'cyber-elevated': '#1A1A2E',

        // Neon accent colors
        'neon-cyan': '#00F5FF',
        'neon-magenta': '#FF00FF',
        'neon-blue': '#0066FF',
        'neon-green': '#00FF88',

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
      animation: {
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'slide-in': 'slide-in 0.3s ease-out',
        'score-pop': 'score-pop 0.5s ease-out',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(0, 245, 255, 0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(0, 245, 255, 0.6)' },
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
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};
