/** Centralized API configuration */
export const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3003' : 'https://ai-olympics-api.fly.dev');
