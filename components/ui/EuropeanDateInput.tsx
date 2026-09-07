import React, { useState, useEffect } from 'react';
import { useTranslation } from '../../hooks/useTranslation';

interface EuropeanDateInputProps {
  value: string; // ISO format (YYYY-MM-DD)
  onChange: (value: string) => void; // ISO format (YYYY-MM-DD)
  min?: string; // ISO format (YYYY-MM-DD)
  max?: string; // ISO format (YYYY-MM-DD)
  required?: boolean;
  className?: string;
  name?: string;
  error?: boolean;
}

const EuropeanDateInput: React.FC<EuropeanDateInputProps> = ({
  value,
  onChange,
  min,
  max,
  required = false,
  className = '',
  name,
  error = false
}) => {
  const { t } = useTranslation();
  const [displayValue, setDisplayValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  // Convert ISO date (YYYY-MM-DD) to European format (DD/MM/YYYY)
  const isoToEuropean = (isoDate: string): string => {
    if (!isoDate) return '';
    const [year, month, day] = isoDate.split('-');
    return `${day}/${month}/${year}`;
  };

  // Convert European format (DD/MM/YYYY) to ISO (YYYY-MM-DD)
  const europeanToIso = (euroDate: string): string => {
    if (!euroDate) return '';
    const parts = euroDate.split('/');
    if (parts.length !== 3) return '';

    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const year = parts[2];

    // Validate
    if (day.length !== 2 || month.length !== 2 || year.length !== 4) return '';

    return `${year}-${month}-${day}`;
  };

  // Update display value when ISO value changes
  useEffect(() => {
    if (value && !isFocused) {
      setDisplayValue(isoToEuropean(value));
    }
  }, [value, isFocused]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    setDisplayValue(input);

    // Auto-add slashes while typing
    let formatted = input.replace(/\D/g, ''); // Remove non-digits

    if (formatted.length >= 2) {
      formatted = formatted.slice(0, 2) + '/' + formatted.slice(2);
    }
    if (formatted.length >= 5) {
      formatted = formatted.slice(0, 5) + '/' + formatted.slice(5);
    }
    if (formatted.length > 10) {
      formatted = formatted.slice(0, 10);
    }

    setDisplayValue(formatted);

    // Try to convert to ISO format
    if (formatted.length === 10) {
      const isoDate = europeanToIso(formatted);
      if (isoDate) {
        // Validate min/max
        if (min && isoDate < min) return;
        if (max && isoDate > max) return;

        onChange(isoDate);
      }
    } else if (formatted === '') {
      onChange('');
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
    if (!displayValue && value) {
      setDisplayValue(isoToEuropean(value));
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    // If incomplete date, clear it
    if (displayValue.length > 0 && displayValue.length < 10) {
      setDisplayValue('');
      onChange('');
    } else if (value) {
      setDisplayValue(isoToEuropean(value));
    }
  };

  return (
    <input
      type="text"
      name={name}
      value={displayValue}
      onChange={handleInputChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={t({ it: 'GG/MM/AAAA', en: 'DD/MM/YYYY' })}
      required={required}
      maxLength={10}
      inputMode="numeric"
      className={className}
      style={{
        colorScheme: 'dark',
        cursor: 'pointer'
      }}
    />
  );
};

export default EuropeanDateInput;
