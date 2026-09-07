import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../translations';
import type { Language, Translations } from '../types';
import { useCallback, useSyncExternalStore } from 'react';
// Ogni testo che passa di qui puo' essere riscritto dall'onglet Sito del
// gestionale: e' cosi' che le pagine senza editor dedicato (account,
// partner, login, conferme) restano comunque modificabili senza deploy.
import {
  chiaveDizionario,
  chiaveTesto,
  iscrivitiTesti,
  testoOverride,
  versioneTesti,
} from '../utils/testiSito';

type Translatable = keyof Translations | { en: string; it: string };

export const useTranslation = () => {
  const { language, setLanguage } = useLanguage();
  // I testi del gestionale arrivano dopo il primo render (una fetch): questo
  // aggancio fa ridisegnare la pagina quando arrivano, invece di lasciare a
  // schermo il testo del codice fino al cambio di pagina.
  const versione = useSyncExternalStore(iscrivitiTesti, versioneTesti, versioneTesti);

  const t = useCallback((field: Translatable): string => {
    if (typeof field === 'string') {
      const key = field as keyof Translations;
      const riscritto = testoOverride(chiaveDizionario(String(key)), language);
      if (riscritto) return riscritto;
      return translations[key]?.[language] || key.toString().replace(/_/g, ' ');
    }
    if (typeof field === 'object' && field !== null && 'en' in field && 'it' in field) {
      const riscritto = testoOverride(chiaveTesto(field.it), language);
      if (riscritto) return riscritto;
      return field[language];
    }
    return '';
  }, [language, versione]);

  const getTranslated = useCallback(<T extends string | { en: string; it: string }>(field: T): string => {
      if (typeof field === 'string') {
          return field;
      }
      return field[language];
  }, [language]);

  return { t, language, setLanguage, lang: language, getTranslated };
};
