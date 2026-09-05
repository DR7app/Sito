import React, { useState, useRef, useEffect, useCallback } from 'react';
import { cercaLuoghiSito, dettaglioLuogoSito, type LuogoSito } from '../../utils/ricercaLuoghi';

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  /** Fired only when the user picks a suggestion from the list. Gives the
   *  resolved country code (ISO alpha-2, lowercase) so the caller can tell
   *  Italian from foreign addresses (drives the resident/non-resident cauzione). */
  onSelect?: (details: {
    value: string;
    countryCode?: string;
    postcode?: string;
    /** Pezzi separati dell'indirizzo: ci sono solo quando il posto viene da Google. */
    parti?: { via: string; civico: string; cap: string; comune: string; provincia: string; paese?: string };
    lat?: number;
    lon?: number;
  }) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  name?: string;
  required?: boolean;
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  address?: {
    road?: string;
    house_number?: string;
    postcode?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    state?: string;
    country?: string;
    country_code?: string;
  };
}

const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({
  value,
  onChange,
  onSelect,
  placeholder = 'Via, Numero Civico, CAP, Città',
  className = '',
  id,
  name,
  required,
}) => {
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const skipFetchRef = useRef(false);
  /**
   * 03/09/2026 — si cerca il POSTO, non solo la via.
   *
   * Nominatim trova le strade ma quasi nessuna attivita': un cliente che
   * scriveva il nome del proprio hotel non trovava niente. Ora si chiede
   * prima a Google (che le attivita' le conosce); quando non risponde
   * resta identico il percorso Nominatim di prima.
   */
  const [luoghi, setLuoghi] = useState<LuogoSito[]>([]);
  // Le battute dentro una sessione non si pagano: si paga solo il dettaglio
  // del posto scelto. Nuova sessione dopo ogni scelta.
  const sessioneRef = useRef<string>(
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Math.random())
  );

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 3) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    // Prima i posti (Google). Se risponde, la tendina mostra quelli.
    const daGoogle = await cercaLuoghiSito(query, sessioneRef.current);
    if (daGoogle && daGoogle.length > 0) {
      setLuoghi(daGoogle);
      setSuggestions([]);
      setIsOpen(true);
      setHighlightIndex(-1);
      return;
    }
    setLuoghi([]);

    try {
      // No country lock: foreign customers must be able to find their own
      // address (a hardcoded countrycodes=it hid every non-Italian result).
      //
      // 2026-08-14: `viewbox` sulla Sardegna. Nominatim ordina per rilevanza
      // generale, quindi sui nomi comuni vinceva sempre la penisola: cercando
      // "Marina Piccola" uscivano Ardea, Sorrento, Capri, Arenzano e Bari, e
      // quella di Cagliari non entrava nei primi 5. Il cliente concludeva che
      // non esistesse.
      //
      // Senza `bounded=1` resta una PREFERENZA, non un filtro: i risultati
      // sardi salgono in cima e un indirizzo estero si trova ancora — che e'
      // il motivo per cui qui non c'e' il lock sul paese.
      const VIEWBOX_SARDEGNA = '8.10,41.30,9.90,38.80';
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?` +
        `q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&viewbox=${VIEWBOX_SARDEGNA}`,
        { headers: { 'Accept-Language': 'it' } }
      );
      if (!res.ok) return;
      const data: NominatimResult[] = await res.json();
      setSuggestions(data);
      setIsOpen(data.length > 0);
      setHighlightIndex(-1);
    } catch {
      // Silently fail — user can still type manually
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);
    skipFetchRef.current = false;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!skipFetchRef.current) fetchSuggestions(val);
    }, 300);
  };

  const formatAddress = (result: NominatimResult): string => {
    const a = result.address;
    if (!a) return result.display_name;

    const parts: string[] = [];
    if (a.road) {
      parts.push(a.house_number ? `${a.road} ${a.house_number}` : a.road);
    }
    const city = a.city || a.town || a.village || a.municipality || '';
    if (a.postcode && city) {
      parts.push(`${a.postcode} ${city}`);
    } else if (city) {
      parts.push(city);
    }
    if (a.state) parts.push(a.state);

    return parts.length > 0 ? parts.join(', ') : result.display_name;
  };

  const handleSelect = (result: NominatimResult) => {
    skipFetchRef.current = true;
    const formatted = formatAddress(result);
    onChange(formatted);
    onSelect?.({
      value: formatted,
      countryCode: result.address?.country_code,
      postcode: result.address?.postcode,
    });
    setSuggestions([]);
    setIsOpen(false);
  };

  /**
   * Scelta di un posto Google. Il dettaglio (l'unica chiamata a pagamento)
   * parte qui, sul posto davvero scelto, e porta coordinate e pezzi
   * dell'indirizzo.
   *
   * `countryCode` e `postcode` restano quelli che il chiamante si aspetta:
   * decidono residente / non residente, e quindi la cauzione. Se il
   * dettaglio non arriva non si inventa un paese — si lascia indefinito,
   * come quando il cliente scrive l'indirizzo a mano.
   */
  const handleSelectLuogo = async (l: LuogoSito) => {
    skipFetchRef.current = true;
    setIsOpen(false);
    setLuoghi([]);
    const completo = (await dettaglioLuogoSito(l, sessioneRef.current)) || l;
    sessioneRef.current =
      typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Math.random());

    const p = completo.parti;
    const via = p?.via ? (p.civico ? `${p.via} ${p.civico}` : p.via) : '';
    const formatted = via
      ? [via, [p?.cap, p?.comune].filter(Boolean).join(' '), p?.provincia].filter(Boolean).join(', ')
      : (completo.indirizzoCompleto
        || (completo.indirizzo ? `${completo.nome}, ${completo.indirizzo}` : completo.nome));

    onChange(formatted);
    onSelect?.({
      value: formatted,
      countryCode: p?.paese || undefined,
      postcode: p?.cap || undefined,
      parti: p,
      lat: completo.lat ?? undefined,
      lon: completo.lon ?? undefined,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // La tendina mostra o i posti o i risultati Nominatim.
    const quanti = luoghi.length > 0 ? luoghi.length : suggestions.length;
    if (!isOpen || quanti === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(prev => (prev < quanti - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(prev => (prev > 0 ? prev - 1 : quanti - 1));
    } else if (e.key === 'Enter' && highlightIndex >= 0) {
      e.preventDefault();
      if (luoghi.length > 0) void handleSelectLuogo(luoghi[highlightIndex]);
      else handleSelect(suggestions[highlightIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        id={id}
        name={name}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (suggestions.length > 0 || luoghi.length > 0) setIsOpen(true); }}
        placeholder={placeholder}
        className={className}
        required={required}
        autoComplete="off"
      />
      {/* La tendina dei posti: nome dell'attivita' sopra, indirizzo sotto. */}
      {isOpen && luoghi.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-72 overflow-y-auto">
          {luoghi.map((l, i) => (
            <li
              key={l.id}
              onClick={() => void handleSelectLuogo(l)}
              onMouseEnter={() => setHighlightIndex(i)}
              className={`px-3 py-2.5 text-sm cursor-pointer transition-colors ${
                i === highlightIndex ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-700/50'
              }`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium leading-tight">{l.nome}</span>
                {l.categoria && (
                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-gray-700 text-gray-300">
                    {l.categoria}
                  </span>
                )}
              </div>
              {l.indirizzo && <div className="text-xs text-gray-400 mt-0.5">{l.indirizzo}</div>}
            </li>
          ))}
        </ul>
      )}
      {isOpen && luoghi.length === 0 && suggestions.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-60 overflow-y-auto">
          {suggestions.map((result, i) => (
            <li
              key={result.place_id}
              onClick={() => handleSelect(result)}
              onMouseEnter={() => setHighlightIndex(i)}
              className={`px-3 py-2.5 text-sm cursor-pointer transition-colors ${
                i === highlightIndex
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-300 hover:bg-gray-700/50'
              }`}
            >
              <span className="leading-tight">{formatAddress(result)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AddressAutocomplete;
