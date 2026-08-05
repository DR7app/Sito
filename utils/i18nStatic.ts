/**
 * Non-hook translation helper.
 *
 * For code that runs outside a React component body (context callbacks,
 * module-level helpers) where `useTranslation()` cannot be called. Reads the
 * same localStorage key that LanguageContext persists, so it always agrees
 * with the language the user picked in the header toggle.
 */
const STORAGE_KEY = 'dr7_site_language';

export function currentLanguage(): 'it' | 'en' {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en') return 'en';
  } catch { /* localStorage may be blocked */ }
  return 'it';
}

export function translate(field: { it: string; en: string }): string {
  return field[currentLanguage()];
}
