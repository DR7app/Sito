/**
 * Locale helper for date/time formatting.
 *
 * The site is bilingual (IT/EN) but the FORMAT stays European in both
 * languages: dd/mm/yyyy and 24-hour clock. `en-GB` is used for English —
 * never `en-US` — so switching language changes month/weekday NAMES only,
 * never the day/month order and never introduces AM/PM.
 */
import type { Language } from '../types';

export const dateLocale = (lang: Language | string): string =>
  lang === 'en' ? 'en-GB' : 'it-IT';
