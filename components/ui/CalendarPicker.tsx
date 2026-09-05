import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CalendarPickerProps {
  value: string; // ISO format (YYYY-MM-DD)
  onChange: (value: string) => void;
  min?: string; // ISO format (YYYY-MM-DD)
  max?: string; // ISO format (YYYY-MM-DD)
  required?: boolean;
  className?: string;
  name?: string;
  error?: boolean;
}

const CalendarPicker: React.FC<CalendarPickerProps> = ({
  value,
  onChange,
  min,
  max,
  required = false,
  className = '',
  name,
  error = false
}) => {
  const [displayValue, setDisplayValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const containerRef = useRef<HTMLDivElement>(null);

  const MONTHS = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  const DAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

  // Convert ISO date to European format
  const isoToEuropean = (isoDate: string): string => {
    if (!isoDate) return '';
    const [year, month, day] = isoDate.split('-');
    return `${day}/${month}/${year}`;
  };

  // Convert European format to ISO
  const europeanToIso = (euroDate: string): string => {
    if (!euroDate) return '';
    const parts = euroDate.split('/');
    if (parts.length !== 3) return '';
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const year = parts[2];
    if (day.length !== 2 || month.length !== 2 || year.length !== 4) return '';
    return `${year}-${month}-${day}`;
  };

  useEffect(() => {
    if (value) {
      setDisplayValue(isoToEuropean(value));
      if (value) {
        setCurrentMonth(new Date(value));
      }
    }
  }, [value]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();

    // Get day of week (0 = Sunday, 1 = Monday, etc.)
    // Convert to Monday = 0, Sunday = 6
    let startDay = firstDay.getDay() - 1;
    if (startDay === -1) startDay = 6;

    const days: (number | null)[] = [];

    // Add empty cells for days before month starts
    for (let i = 0; i < startDay; i++) {
      days.push(null);
    }

    // Add days of month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }

    return days;
  };

  const handleDateClick = (day: number) => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // Check min/max
    if (min && dateStr < min) return;
    if (max && dateStr > max) return;

    onChange(dateStr);
    setDisplayValue(isoToEuropean(dateStr));
    setIsOpen(false);
  };

  const changeMonth = (delta: number) => {
    setCurrentMonth(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() + delta);
      return newDate;
    });
  };

  const isDateDisabled = (day: number): boolean => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    if (min && dateStr < min) return true;
    if (max && dateStr > max) return true;
    // Block Sundays — DR7 is closed
    const date = new Date(year, month, day);
    if (date.getDay() === 0) return true;
    return false;
  };

  const isToday = (day: number): boolean => {
    const today = new Date();
    return day === today.getDate() &&
      currentMonth.getMonth() === today.getMonth() &&
      currentMonth.getFullYear() === today.getFullYear();
  };

  const isSelected = (day: number): boolean => {
    if (!value) return false;
    const [year, month, selectedDay] = value.split('-');
    return day === parseInt(selectedDay) &&
      currentMonth.getMonth() === parseInt(month) - 1 &&
      currentMonth.getFullYear() === parseInt(year);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    let formatted = input.replace(/\D/g, '');

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

    if (formatted.length === 10) {
      const isoDate = europeanToIso(formatted);
      if (isoDate) {
        if (min && isoDate < min) return;
        if (max && isoDate > max) return;
        onChange(isoDate);
      }
    } else if (formatted === '') {
      onChange('');
    }
  };

  const days = getDaysInMonth(currentMonth);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          name={name}
          value={displayValue}
          onChange={handleInputChange}
          onClick={() => setIsOpen(!isOpen)}
          placeholder="GG/MM/AAAA"
          required={required}
          maxLength={10}
          inputMode="numeric"
          className={className}
          autoComplete="off"
        />
        <div
          className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400"
          onClick={() => setIsOpen(!isOpen)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute z-50 mt-2 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-4 w-80"
          >
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={() => changeMonth(-1)}
                className="p-2 hover:bg-gray-800 transition-colors text-white"
              >
                ‹
              </button>
              <div className="text-white font-semibold">
                {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
              </div>
              <button
                type="button"
                onClick={() => changeMonth(1)}
                className="p-2 hover:bg-gray-800 transition-colors text-white"
              >
                ›
              </button>
            </div>

            {/* Day labels */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {DAYS.map(day => (
                <div key={day} className="text-center text-xs text-gray-400 font-semibold py-1">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {days.map((day, index) => {
                if (day === null) {
                  return <div key={`empty-${index}`} className="aspect-square" />;
                }

                const disabled = isDateDisabled(day);
                const today = isToday(day);
                const selected = isSelected(day);

                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => !disabled && handleDateClick(day)}
                    disabled={disabled}
                    className={`
                      aspect-square text-sm font-medium transition-all
                      ${disabled ? 'text-gray-600 cursor-not-allowed' : 'text-white hover:bg-gray-800 cursor-pointer'}
                      ${today && !selected ? 'ring-2 ring-blue-500' : ''}
                      ${selected ? 'bg-blue-500 text-black font-bold' : ''}
                    `}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div className="mt-4 flex justify-between items-center text-xs">
              <button
                type="button"
                onClick={() => {
                  const today = new Date().toISOString().split('T')[0];
                  if (!min || today >= min) {
                    onChange(today);
                    setDisplayValue(isoToEuropean(today));
                    setIsOpen(false);
                  }
                }}
                className="text-blue-400 hover:text-blue-300 font-semibold"
              >
                Oggi
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                Chiudi
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CalendarPicker;
