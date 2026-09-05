import React, { useState, useRef, useEffect } from 'react';
import { PHONE_COUNTRIES, type PhoneCountry } from '../../utils/phoneCountries';
import { useTranslation } from '../../hooks/useTranslation';

interface PhoneInputProps {
  value: string;
  onChange: (fullNumber: string) => void;
  className?: string;
  required?: boolean;
  placeholder?: string;
}

const PhoneInput: React.FC<PhoneInputProps> = ({ value, onChange, className = '', required, placeholder }) => {
  const { t } = useTranslation();
  // Parse initial value to extract country code
  const getInitialCountry = (): PhoneCountry => {
    if (!value) return PHONE_COUNTRIES[0]; // Italia
    const clean = value.replace(/\s/g, '');
    // Try to match longest dial code first
    const sorted = [...PHONE_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
    for (const c of sorted) {
      const dialClean = c.dial.replace('-', '');
      if (clean.startsWith(dialClean)) return c;
    }
    return PHONE_COUNTRIES[0];
  };

  const getInitialNumber = (): string => {
    if (!value) return '';
    const clean = value.replace(/\s/g, '');
    const country = getInitialCountry();
    const dialClean = country.dial.replace('-', '');
    if (clean.startsWith(dialClean)) return clean.slice(dialClean.length);
    if (clean.startsWith('+')) return clean.slice(country.dial.replace('-', '').length);
    return clean;
  };

  const [selectedCountry, setSelectedCountry] = useState<PhoneCountry>(getInitialCountry);
  const [phoneNumber, setPhoneNumber] = useState(getInitialNumber);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Focus search when dropdown opens
  useEffect(() => {
    if (isDropdownOpen && searchRef.current) {
      searchRef.current.focus();
    }
  }, [isDropdownOpen]);

  const handleCountrySelect = (country: PhoneCountry) => {
    setSelectedCountry(country);
    setIsDropdownOpen(false);
    setSearch('');
    const full = `${country.dial.replace('-', '')}${phoneNumber}`;
    onChange(full);
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const num = e.target.value.replace(/[^0-9]/g, '');
    setPhoneNumber(num);
    const full = `${selectedCountry.dial.replace('-', '')}${num}`;
    onChange(full);
  };

  const filteredCountries = search
    ? PHONE_COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.dial.includes(search) ||
        c.code.toLowerCase().includes(search.toLowerCase())
      )
    : PHONE_COUNTRIES;

  return (
    <div ref={containerRef} className="relative">
      <div className={`flex ${className}`}>
        {/* Country selector button */}
        <button
          type="button"
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="flex items-center gap-1.5 bg-gray-800 border border-gray-700 border-r-0 px-3 py-3 text-white hover:bg-gray-700 transition-colors flex-shrink-0"
        >
          <span className="text-lg leading-none">{selectedCountry.flag}</span>
          <span className="text-sm text-gray-400">{selectedCountry.dial}</span>
          <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Phone number input */}
        <input
          type="tel"
          value={phoneNumber}
          onChange={handleNumberChange}
          placeholder={placeholder || '320 1234567'}
          required={required}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-r-md p-3 text-white min-w-0"
        />
      </div>

      {/* Country dropdown */}
      {isDropdownOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl z-50 max-h-64 overflow-hidden flex flex-col">
          {/* Search */}
          <div className="p-2 border-b border-gray-700">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t({ it: "Cerca paese...", en: "Search country..." })}
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm placeholder-gray-500 outline-none"
            />
          </div>

          {/* Country list */}
          <div className="overflow-y-auto">
            {filteredCountries.map((country) => (
              <button
                key={country.code}
                type="button"
                onClick={() => handleCountrySelect(country)}
                className={`w-full text-left px-3 py-2.5 flex items-center gap-3 text-sm transition-colors ${
                  country.code === selectedCountry.code
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-300 hover:bg-gray-700/50'
                }`}
              >
                <span className="text-lg leading-none">{country.flag}</span>
                <span className="flex-1 truncate">{country.name}</span>
                <span className="text-gray-500 text-xs">{country.dial}</span>
              </button>
            ))}
            {filteredCountries.length === 0 && (
              <p className="text-center text-gray-500 text-sm py-4">{t({ it: "Nessun risultato", en: "No results" })}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PhoneInput;
