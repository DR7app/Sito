import React from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from '../../hooks/useTranslation';

interface AppleStyleSelectProps {
    label: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    options: string[];
    name?: string;
    required?: boolean;
    className?: string;
    error?: string;
}

export const AppleStyleSelect: React.FC<AppleStyleSelectProps> = ({
    label,
    value,
    onChange,
    options,
    name,
    required = false,
    className = '',
    error
}) => {
    const { t } = useTranslation();
    return (
        <div className={`relative ${className}`}>
            <div className={`
        relative w-full rounded-xl border bg-gray-800/50
        ${error ? 'border-red-500' : 'border-gray-600 hover:border-gray-500'}
        transition-colors duration-200 backdrop-blur-sm
      `}>
                <div className="absolute top-2 left-4 text-xs text-gray-400 z-10 pointer-events-none">
                    {label}
                </div>

                <select
                    name={name}
                    value={value}
                    onChange={onChange}
                    required={required}
                    className="
            w-full bg-transparent appearance-none
            pt-6 pb-2 px-4
            text-base text-white font-normal
            rounded-xl border-none focus:ring-0 focus:outline-none
            cursor-pointer
          "
                >
                    <option value="" disabled hidden className="text-gray-500 bg-gray-800">{t({ it: "Seleziona...", en: "Select..." })}</option>
                    {options.map((option) => (
                        <option key={option} value={option} className="bg-gray-800 text-white">
                            {option}
                        </option>
                    ))}
                </select>

                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                    <ChevronDown size={20} className="opacity-70" />
                </div>
            </div>
            {error && <p className="text-xs text-red-500 mt-1 ml-1">{error}</p>}
        </div>
    );
};
