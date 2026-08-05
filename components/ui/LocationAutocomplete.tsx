import React, { useState, useRef, useEffect, useCallback } from 'react';
import { searchLocations, type SardegnaLocation } from '../../data/sardegnaLocations';
import { useTranslation } from '../../hooks/useTranslation';

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
  };
  lat: string;
  lon: string;
}

interface LocationAutocompleteProps {
  value: string;
  onChange: (location: SardegnaLocation) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}

const TYPE_ICONS: Record<string, string> = {
  airport: '✈',
  port: '⚓',
  city: '●',
  town: '○',
  resort: '◆',
  address: '○',
};

function formatNominatimAddress(result: NominatimResult): string {
  const a = result.address;
  if (!a) return result.display_name;
  const parts: string[] = [];
  if (a.road) parts.push(a.house_number ? `${a.road} ${a.house_number}` : a.road);
  const city = a.city || a.town || a.village || a.municipality || '';
  if (a.postcode && city) parts.push(`${a.postcode} ${city}`);
  else if (city) parts.push(city);
  return parts.length > 0 ? parts.join(', ') : result.display_name;
}

function nominatimToSardegnaLocation(result: NominatimResult): SardegnaLocation {
  const formatted = formatNominatimAddress(result);
  return {
    id: `nominatim-${result.place_id}`,
    name: formatted,
    type: result.address?.road ? 'town' : 'city',
    province: result.address?.state || '',
    label: formatted,
    aliases: [],
    lat: parseFloat(result.lat),
    lon: parseFloat(result.lon),
  };
}

type DisplayItem = {
  source: 'local' | 'nominatim';
  local?: SardegnaLocation;
  nominatim?: NominatimResult;
  label: string;
  sublabel: string;
  icon: string;
};

const LocationAutocomplete: React.FC<LocationAutocompleteProps> = ({
  value,
  onChange,
  placeholder,
  label,
  className = '',
}) => {
  const { t } = useTranslation();
  const ph = placeholder ?? t({ it: 'Cerca località o indirizzo...', en: 'Search location or address...' });
  const [query, setQuery] = useState(value);
  const [localResults, setLocalResults] = useState<SardegnaLocation[]>([]);
  const [nominatimResults, setNominatimResults] = useState<NominatimResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFocusedRef = useRef(false);

  useEffect(() => { setQuery(value); }, [value]);

  const fetchNominatim = useCallback(async (text: string) => {
    if (text.length < 3) { setNominatimResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(text)}&format=json&addressdetails=1&limit=5&countrycodes=it`,
        { headers: { 'Accept-Language': 'it' } }
      );
      if (res.ok) {
        const data: NominatimResult[] = await res.json();
        setNominatimResults(data);
        // Only re-open dropdown if input is still focused
        if (data.length > 0 && isFocusedRef.current) {
          setIsOpen(true);
        }
      }
    } catch (e) {
      console.error('[LocationAutocomplete] Nominatim error:', e);
    }
    setLoading(false);
  }, []);

  const handleSearch = useCallback((text: string) => {
    setQuery(text);
    const matches = searchLocations(text);
    setLocalResults(matches);
    setIsOpen(true);
    setHighlightedIndex(-1);

    // Also fetch Nominatim with debounce
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchNominatim(text), 300);
  }, [fetchNominatim]);

  // Build combined display items: local first, then nominatim (deduped)
  const displayItems: DisplayItem[] = (() => {
    const items: DisplayItem[] = [];
    const seenLabels = new Set<string>();

    for (const loc of localResults.slice(0, 5)) {
      seenLabels.add(loc.label.toLowerCase());
      items.push({
        source: 'local',
        local: loc,
        label: loc.label,
        sublabel: loc.province,
        icon: TYPE_ICONS[loc.type] || '○',
      });
    }

    for (const nom of nominatimResults) {
      const formatted = formatNominatimAddress(nom);
      if (seenLabels.has(formatted.toLowerCase())) continue;
      seenLabels.add(formatted.toLowerCase());
      items.push({
        source: 'nominatim',
        nominatim: nom,
        label: formatted,
        sublabel: nom.address?.state || '',
        icon: '○',
      });
    }

    return items;
  })();

  const handleSelect = useCallback((item: DisplayItem) => {
    if (item.source === 'local' && item.local) {
      setQuery(item.local.label);
      onChange(item.local);
    } else if (item.source === 'nominatim' && item.nominatim) {
      const loc = nominatimToSardegnaLocation(item.nominatim);
      setQuery(loc.label);
      onChange(loc);
    }
    setIsOpen(false);
    setHighlightedIndex(-1);
  }, [onChange]);

  const handleFocus = useCallback(() => {
    const matches = searchLocations(query);
    setLocalResults(matches);
    setIsOpen(true);
  }, [query]);

  // Close on click outside (more reliable than blur for mobile)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const container = inputRef.current?.parentElement;
      if (container && !container.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => Math.min(prev + 1, displayItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && highlightedIndex >= 0) {
      e.preventDefault();
      handleSelect(displayItems[highlightedIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  }, [isOpen, displayItems, highlightedIndex, handleSelect]);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  return (
    <div className={`relative ${className}`}>
      {label && (
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
          {label}
        </label>
      )}
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        onFocus={() => { isFocusedRef.current = true; handleFocus(); }}
        onBlur={() => { isFocusedRef.current = false; setTimeout(() => setIsOpen(false), 200); }}
        onKeyDown={handleKeyDown}
        placeholder={ph}
        className="w-full bg-[#2c2c2e] border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-white/30 transition-colors text-sm"
        autoComplete="off"
        role="combobox"
        aria-expanded={isOpen}
      />

      {isOpen && (displayItems.length > 0 || loading) && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-1 bg-[#1c1c1e] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-20 max-h-64 overflow-y-auto"
          role="listbox"
        >
          {/* Local results header */}
          {localResults.length > 0 && (
            <div className="px-3 py-1.5 text-[10px] font-bold text-white/20 uppercase tracking-widest bg-white/[0.02]">
              Località DR7
            </div>
          )}
          {displayItems.filter(d => d.source === 'local').map((item, i) => {
            const globalIdx = displayItems.indexOf(item);
            return (
              <button
                key={`local-${i}`}
                type="button"
                role="option"
                aria-selected={globalIdx === highlightedIndex}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setHighlightedIndex(globalIdx)}
                className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors text-sm ${
                  globalIdx === highlightedIndex ? 'bg-white/10 text-white' : 'text-gray-300 hover:bg-white/5'
                }`}
              >
                <span className="flex-1 truncate">{item.label}</span>
                <span className="text-gray-600 text-xs flex-shrink-0">{item.sublabel}</span>
              </button>
            );
          })}

          {/* Nominatim results */}
          {displayItems.some(d => d.source === 'nominatim') && (
            <div className="px-3 py-1.5 text-[10px] font-bold text-white/20 uppercase tracking-widest bg-white/[0.02] border-t border-white/5">
              Indirizzi
            </div>
          )}
          {displayItems.filter(d => d.source === 'nominatim').map((item, i) => {
            const globalIdx = displayItems.indexOf(item);
            return (
              <button
                key={`nom-${i}`}
                type="button"
                role="option"
                aria-selected={globalIdx === highlightedIndex}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setHighlightedIndex(globalIdx)}
                className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors text-sm ${
                  globalIdx === highlightedIndex ? 'bg-white/10 text-white' : 'text-gray-300 hover:bg-white/5'
                }`}
              >
                <span className="flex-1 truncate">{item.label}</span>
                <span className="text-gray-600 text-xs flex-shrink-0">{item.sublabel}</span>
              </button>
            );
          })}

          {loading && (
            <div className="px-4 py-2.5 text-xs text-white/30 text-center">{t({ it: "Ricerca indirizzi...", en: "Searching addresses..." })}</div>
          )}
        </div>
      )}
    </div>
  );
};

export default LocationAutocomplete;
