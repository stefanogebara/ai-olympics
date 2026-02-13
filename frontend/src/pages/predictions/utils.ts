/**
 * Extract short outcome names from a group of related questions.
 * e.g., ["Will Trump nominate Kevin Warsh as...?", "Will Trump nominate Judy Shelton as...?"]
 * -> ["Kevin Warsh", "Judy Shelton"]
 */
export function extractOutcomeNames(questions: string[]): string[] {
  if (questions.length <= 1) return questions;

  // Find longest common prefix
  let prefix = questions[0];
  for (const q of questions) {
    while (prefix && !q.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
  }

  // Find longest common suffix
  let suffix = questions[0];
  for (const q of questions) {
    while (suffix && !q.endsWith(suffix)) {
      suffix = suffix.slice(1);
    }
  }

  const prefixLen = prefix.length;
  const suffixLen = suffix.length;

  return questions.map(q => {
    const name = q.slice(prefixLen, q.length - suffixLen).trim();
    // Clean up leftover punctuation
    return name.replace(/^['"]|['"]$/g, '').trim() || q;
  });
}

export function getEventSlug(eventUrl: string): string {
  // Extract slug from URL like "https://polymarket.com/event/democratic-presidential-nominee-2028"
  // or Kalshi URLs like "https://kalshi.com/markets/..."
  const match = eventUrl.match(/\/event\/([^/?#]+)/) || eventUrl.match(/\/markets\/([^/?#]+)/);
  if (match) return match[1];
  // Fallback: use last path segment
  const parts = eventUrl.replace(/[/?#].*$/, '').split('/');
  return parts[parts.length - 1] || eventUrl;
}

export function formatVolume(volume: number): string {
  const prefix = '$';
  if (volume >= 1000000) return `${prefix}${(volume / 1000000).toFixed(1)}M`;
  if (volume >= 1000) return `${prefix}${(volume / 1000).toFixed(1)}K`;
  return `${prefix}${volume.toFixed(0)}`;
}

export function formatCloseDate(closeTime?: number): string {
  if (!closeTime) return 'No close date';
  const date = new Date(closeTime);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days < 0) return 'Closed';
  if (days === 0) return 'Closes today';
  if (days === 1) return 'Closes tomorrow';
  if (days < 7) return `Closes in ${days} days`;
  return date.toLocaleDateString();
}
