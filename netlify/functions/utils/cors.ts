/**
 * Shared CORS utility for Netlify Functions.
 * Supports both www and non-www origins to prevent cross-origin redirect issues.
 */

const ALLOWED_ORIGINS = [
  // Migrazione dominio completata (giugno 2026): vecchio dominio dismesso.
  // Domini correnti: dr7.app (sito) e platform.dr7.app (admin).
  'https://dr7.app',
  'https://www.dr7.app',
  'https://platform.dr7.app',
  'https://platform.dr7ai.com',
  'https://dr7ai.com',
  'https://www.dr7ai.com',
];

export function getCorsOrigin(requestOrigin: string | undefined): string {
  const origin = requestOrigin || '';
  const envOrigin = process.env.ALLOWED_ORIGIN;

  if (envOrigin && origin === envOrigin) return origin;
  if (ALLOWED_ORIGINS.includes(origin)) return origin;

  return envOrigin || ALLOWED_ORIGINS[0];
}
