import React, { useState, useRef, useEffect, useCallback } from 'react';

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  /** Fired only when the user picks a suggestion from the list. Gives the
   *  resolved country code (ISO alpha-2, lowercase) so the caller can tell
   *  Italian from foreign addresses (drives the resident/non-resident cauzione). */
  onSelect?: (details: { value: string; countryCode?: string; postcode?: string }) => void;
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

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 3) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    try {
      // No country lock: foreign customers must be able to find their own
      // address (a hardcoded countrycodes=it hid every non-Italian result).
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?` +
        `q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5`,
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter' && highlightIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[highlightIndex]);
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
        onFocus={() => { if (suggestions.length > 0) setIsOpen(true); }}
        placeholder={placeholder}
        className={className}
        required={required}
        autoComplete="off"
      />
      {isOpen && suggestions.length > 0 && (
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
