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

// Generate a deterministic avatar SVG data URI from agent ID + name
// Creates a unique geometric pattern for each agent
export function generateAgentAvatar(id: string, name: string, size = 64): string {
  // Simple hash function for deterministic randomness
  let hash = 0;
  const seed = id + name;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const h = (offset: number) => Math.abs((hash * (offset + 1) * 2654435761) | 0);

  // Generate two colors for gradient
  const hue1 = h(1) % 360;
  const hue2 = (hue1 + 40 + (h(2) % 120)) % 360;
  const c1 = `hsl(${hue1}, 70%, 55%)`;
  const c2 = `hsl(${hue2}, 70%, 45%)`;

  // Gradient angle
  const angle = h(3) % 360;

  // Shape pattern: 0=circles, 1=diamonds, 2=lines
  const pattern = h(4) % 3;
  let shapes = '';
  const s = size;

  if (pattern === 0) {
    // Two offset circles
    const cx1 = s * 0.35 + (h(5) % (s * 0.3));
    const cy1 = s * 0.35 + (h(6) % (s * 0.3));
    const r1 = s * 0.15 + (h(7) % (s * 0.15));
    shapes = `<circle cx="${cx1}" cy="${cy1}" r="${r1}" fill="white" opacity="0.15"/>`;
    const cx2 = s - cx1;
    const cy2 = s - cy1;
    shapes += `<circle cx="${cx2}" cy="${cy2}" r="${r1 * 0.8}" fill="white" opacity="0.1"/>`;
  } else if (pattern === 1) {
    // Diamond shape
    const mid = s / 2;
    const d = s * 0.2 + (h(5) % (s * 0.15));
    shapes = `<polygon points="${mid},${mid - d} ${mid + d},${mid} ${mid},${mid + d} ${mid - d},${mid}" fill="white" opacity="0.12"/>`;
  } else {
    // Diagonal stripes
    const w = s * 0.08;
    for (let i = 0; i < 3; i++) {
      const offset = s * 0.25 * (i + 1);
      shapes += `<line x1="${offset}" y1="0" x2="${offset + s * 0.3}" y2="${s}" stroke="white" stroke-width="${w}" opacity="0.1"/>`;
    }
  }

  const initial = name.charAt(0).toUpperCase();
  const fontSize = size * 0.45;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
    <defs><linearGradient id="g" gradientTransform="rotate(${angle}, 0.5, 0.5)" gradientUnits="objectBoundingBox"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs>
    <rect width="${s}" height="${s}" rx="${s * 0.22}" fill="url(#g)"/>
    ${shapes}
    <text x="${s / 2}" y="${s / 2 + fontSize * 0.35}" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="700" font-size="${fontSize}" fill="white" opacity="0.9">${initial}</text>
  </svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
