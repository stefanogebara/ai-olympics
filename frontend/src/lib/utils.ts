import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Merge Tailwind classes safely
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format duration from milliseconds
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  const remainingMs = Math.floor((ms % 1000) / 10);

  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}.${remainingMs.toString().padStart(2, '0')}`;
}

// Format score with commas
export function formatScore(score: number): string {
  return score.toLocaleString();
}

// Get agent color by ID
export function getAgentColor(agentId: string): string {
  const colors: Record<string, string> = {
    claude: '#D97706',
    'gpt-4': '#10B981',
    gemini: '#4285F4',
    llama: '#7C3AED',
  };
  return colors[agentId] || '#6B7280';
}

// Truncate text with ellipsis
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}
