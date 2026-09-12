import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../hooks/useAuth';
import {
  CHIAVE_CARRELLO_LOCALE,
  SCADENZA_CARRELLO_MS,
  totaleCarrelloCents,
  type ArticoloCarrello,
  type NuovoArticolo,
} from '../utils/carrello';

/**
 * Il carrello del sito.
 *
 * Chi ha fatto l'accesso lo tiene sull'account (tabella `carrello_articoli`):
 * lo riempie dal computer e lo ritrova dal telefono. Chi non l'ha ancora
 * fatto lo tiene nel browser, e appena entra il carrello locale viene versato
 * sull'account — nessuno perde quello che aveva scelto per colpa del login.
 */

interface CarrelloContextType {
  articoli: ArticoloCarrello[];
  numero: number;
  totaleCents: number;
  /** Articoli con la spunta: sono quelli che vanno al pagamento. */
  articoliSelezionati: ArticoloCarrello[];
  totaleSelezionatiCents: number;
  selezionato: (id: string) => boolean;
  commutaSelezione: (id: string) => void;
  selezionaTutti: (spunta: boolean) => void;
  /** Spunta solo questo articolo: e' "Prenota ora", che paga una cosa sola. */
  selezionaSolo: (id: string) => void;
  caricamento: boolean;
  aperto: boolean;
  apri: () => void;
  chiudi: () => void;
  /**
   * Mette un articolo nel carrello e ne restituisce l'id.
   *
   * `apri` (vero di default) apre il carrello: "Prenota ora" lo passa falso,
   * perche' va dritto al checkout. `sostituisce` e' l'id dell'articolo che
   * questo rimpiazza: serve a "Modifica", che riapre la configurazione e
   * deve aggiornare la riga invece di aggiungerne una seconda.
   */
  aggiungi: (articolo: NuovoArticolo, opzioni?: OpzioniAggiunta) => Promise<string>;
  rimuovi: (id: string) => Promise<void>;
  svuota: () => Promise<void>;
  ricarica: () => Promise<void>;
}

export interface OpzioniAggiunta {
  /** Aprire il carrello dopo l'aggiunta. Vero di default. */
  apri?: boolean;
  /** Id dell'articolo che questo rimpiazza (Modifica). */
  sostituisce?: string;
}

export const CarrelloContext = createContext<CarrelloContextType | undefined>(undefined);

interface RigaDb {
  id: string;
  tipo: ArticoloCarrello['tipo'];
  titolo: string;
  sottotitolo: string | null;
  immagine: string | null;
  prezzo_cents: number;
  dati: Record<string, unknown> | null;
  creato_il: string;
}

function daRiga(r: RigaDb): ArticoloCarrello {
  return {
    id: r.id,
    tipo: r.tipo,
    titolo: r.titolo,
    sottotitolo: r.sottotitolo || undefined,
    immagine: r.immagine || undefined,
    prezzoCents: Number(r.prezzo_cents) || 0,
    dati: (r.dati || {}) as Record<string, unknown>,
    creatoIl: r.creato_il,
  };
}

function leggiLocale(): ArticoloCarrello[] {
  try {
    const grezzo = localStorage.getItem(CHIAVE_CARRELLO_LOCALE);
    if (!grezzo) return [];
    const salvato = JSON.parse(grezzo) as { salvatoIl?: number; articoli?: ArticoloCarrello[] };
    if (!salvato?.salvatoIl || Date.now() - salvato.salvatoIl > SCADENZA_CARRELLO_MS) {
      localStorage.removeItem(CHIAVE_CARRELLO_LOCALE);
      return [];
    }
    return Array.isArray(salvato.articoli) ? salvato.articoli : [];
  } catch {
    return [];
  }
}

function scriviLocale(articoli: ArticoloCarrello[]) {
  try {
    if (articoli.length === 0) {
      localStorage.removeItem(CHIAVE_CARRELLO_LOCALE);
      return;
    }
    localStorage.setItem(CHIAVE_CARRELLO_LOCALE, JSON.stringify({ salvatoIl: Date.now(), articoli }));
  } catch {
    /* browser senza memoria locale: il carrello vive solo in questa pagina */
  }
}

export const CarrelloProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [articoli, setArticoli] = useState<ArticoloCarrello[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [aperto, setAperto] = useState(false);
  /**
   * Si tengono i DEselezionati, non i selezionati: un articolo appena messo
   * nel carrello parte con la spunta senza che nessuno debba ricordarsi di
   * aggiungerlo. Chi toglie la spunta lascia l'articolo li' per un'altra
   * volta — il pagamento porta via solo quelli spuntati.
   */
  const [deselezionati, setDeselezionati] = useState<Set<string>>(new Set());
  const versamentoFatto = useRef<string | null>(null);

  const userId = user?.id || null;

  const caricaDaDb = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from('carrello_articoli')
      .select('*')
      .eq('user_id', uid)
      .order('creato_il', { ascending: true });
    if (error) {
      console.error('[carrello] lettura fallita:', error);
      return [];
    }
    return (data as RigaDb[] || []).map(daRiga);
  }, []);

  /**
   * Versa sull'account il carrello riempito prima dell'accesso. Gira una
   * sola volta per utente: `versamentoFatto` evita che un secondo render
   * duplichi le righe.
   */
  const versaLocale = useCallback(async (uid: string) => {
    const locali = leggiLocale();
    if (locali.length === 0) return;
    const righe = locali.map(a => ({
      user_id: uid,
      tipo: a.tipo,
      titolo: a.titolo,
      sottotitolo: a.sottotitolo || null,
      immagine: a.immagine || null,
      prezzo_cents: a.prezzoCents,
      dati: a.dati,
    }));
    const { error } = await supabase.from('carrello_articoli').insert(righe);
    if (error) {
      console.error('[carrello] versamento carrello locale fallito:', error);
      return;
    }
    scriviLocale([]);
  }, []);

  const ricarica = useCallback(async () => {
    setCaricamento(true);
    try {
      if (userId) {
        if (versamentoFatto.current !== userId) {
          versamentoFatto.current = userId;
          await versaLocale(userId);
        }
        setArticoli(await caricaDaDb(userId));
      } else {
        versamentoFatto.current = null;
        setArticoli(leggiLocale());
      }
    } finally {
      setCaricamento(false);
    }
  }, [userId, caricaDaDb, versaLocale]);

  useEffect(() => { void ricarica(); }, [ricarica]);

  const rimuoviRiga = useCallback(async (id: string) => {
    setArticoli(prec => {
      const dopo = prec.filter(a => a.id !== id);
      if (!userId) scriviLocale(dopo);
      return dopo;
    });
    if (userId) {
      const { error } = await supabase.from('carrello_articoli').delete().eq('id', id).eq('user_id', userId);
      if (error) console.error('[carrello] rimozione fallita:', error);
    }
  }, [userId]);

  const rimuovi = rimuoviRiga;

  const aggiungi = useCallback(async (articolo: NuovoArticolo, opzioni?: OpzioniAggiunta) => {
    let idNuovo = '';
    if (userId) {
      const { data, error } = await supabase
        .from('carrello_articoli')
        .insert({
          user_id: userId,
          tipo: articolo.tipo,
          titolo: articolo.titolo,
          sottotitolo: articolo.sottotitolo || null,
          immagine: articolo.immagine || null,
          prezzo_cents: Math.round(articolo.prezzoCents),
          dati: articolo.dati,
        })
        .select()
        .single();
      if (error) {
        console.error('[carrello] inserimento fallito:', error);
        throw new Error(error.message);
      }
      idNuovo = (data as RigaDb).id;
      setArticoli(prec => [...prec, daRiga(data as RigaDb)]);
    } else {
      const nuovo: ArticoloCarrello = {
        ...articolo,
        prezzoCents: Math.round(articolo.prezzoCents),
        id: `loc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        creatoIl: new Date().toISOString(),
      };
      idNuovo = nuovo.id;
      setArticoli(prec => {
        const dopo = [...prec, nuovo];
        scriviLocale(dopo);
        return dopo;
      });
    }
    // Modifica: la riga vecchia se ne va solo ORA, a nuova riga scritta, cosi'
    // un errore a meta' strada non lascia il cliente senza ne' l'una ne'
    // l'altra.
    if (opzioni?.sostituisce && opzioni.sostituisce !== idNuovo) {
      await rimuoviRiga(opzioni.sostituisce);
    }
    if (opzioni?.apri !== false) setAperto(true);
    return idNuovo;
  }, [userId, rimuoviRiga]);

  const svuota = useCallback(async () => {
    setArticoli([]);
    scriviLocale([]);
    if (userId) {
      const { error } = await supabase.from('carrello_articoli').delete().eq('user_id', userId);
      if (error) console.error('[carrello] svuotamento fallito:', error);
    }
  }, [userId]);

  const selezionato = useCallback((id: string) => !deselezionati.has(id), [deselezionati]);

  const commutaSelezione = useCallback((id: string) => {
    setDeselezionati(prec => {
      const dopo = new Set(prec);
      if (dopo.has(id)) dopo.delete(id); else dopo.add(id);
      return dopo;
    });
  }, []);

  const selezionaTutti = useCallback((spunta: boolean) => {
    setDeselezionati(spunta ? new Set() : new Set(articoli.map(a => a.id)));
  }, [articoli]);

  const selezionaSolo = useCallback((id: string) => {
    setDeselezionati(new Set(articoli.filter(a => a.id !== id).map(a => a.id)));
  }, [articoli]);

  const articoliSelezionati = useMemo(
    () => articoli.filter(a => !deselezionati.has(a.id)),
    [articoli, deselezionati],
  );

  const valore = useMemo<CarrelloContextType>(() => ({
    articoli,
    numero: articoli.length,
    totaleCents: totaleCarrelloCents(articoli),
    articoliSelezionati,
    totaleSelezionatiCents: totaleCarrelloCents(articoliSelezionati),
    selezionato,
    commutaSelezione,
    selezionaTutti,
    selezionaSolo,
    caricamento,
    aperto,
    apri: () => setAperto(true),
    chiudi: () => setAperto(false),
    aggiungi,
    rimuovi,
    svuota,
    ricarica,
  }), [articoli, articoliSelezionati, selezionato, commutaSelezione, selezionaTutti, selezionaSolo, caricamento, aperto, aggiungi, rimuovi, svuota, ricarica]);

  return <CarrelloContext.Provider value={valore}>{children}</CarrelloContext.Provider>;
};
