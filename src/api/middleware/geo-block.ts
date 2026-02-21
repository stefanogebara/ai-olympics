import { Request, Response, NextFunction } from 'express';

/**
 * Countries blocked for legal compliance:
 * - AU: Interactive Gambling Act — prediction markets classified as illegal gambling
 * - SG: Remote Gambling Act — GRA restrictions on prediction markets
 * - FR: Regulatory restrictions on online prediction markets
 */
const BLOCKED_COUNTRIES = new Set(['AU', 'SG', 'FR']);

/**
 * Extract country code from CDN-injected headers.
 * Vercel injects x-vercel-ip-country automatically.
 * Cloudflare injects CF-IPCountry automatically.
 * Returns null if no CDN header is present (e.g., direct dev connections — no blocking applied).
 */
function getCountryCode(req: Request): string | null {
  const vercelCountry = req.headers['x-vercel-ip-country'];
  const cfCountry = req.headers['cf-ipcountry'];
  const genericCountry = req.headers['x-country-code'];

  const raw = vercelCountry ?? cfCountry ?? genericCountry;
  if (!raw || Array.isArray(raw)) return null;
  return raw.toUpperCase();
}

/**
 * Middleware to block requests from geo-restricted countries.
 * Relies on CDN-injected country headers (Vercel/Cloudflare).
 * If no CDN header is present, requests are allowed through (safe default for local dev).
 *
 * Returns HTTP 451 Unavailable For Legal Reasons for blocked countries.
 */
export function geoBlock(req: Request, res: Response, next: NextFunction): void {
  const country = getCountryCode(req);

  if (country && BLOCKED_COUNTRIES.has(country)) {
    res.status(451).json({
      error: 'Service unavailable in your region',
      reason:
        'AI Olympics is not available in your country due to local regulations regarding prediction markets.',
    });
    return;
  }

  next();
}
