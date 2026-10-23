/**
 * Validation utilities for Italian tax codes and other client data
 */

/**
 * Validates Italian Codice Fiscale (Tax Code)
 * Format: 16 alphanumeric characters for individuals, or 11 digits for companies
 */
export const validateItalianCodiceFiscale = (cf: string): boolean => {
  if (!cf) return false;

  // Remove spaces and convert to uppercase
  const cleanCF = cf.replace(/\s/g, '').toUpperCase();

  // Check if it's 16 characters (person) or 11 digits (company)
  if (cleanCF.length === 16) {
    // Person format: 16 alphanumeric characters
    const cfRegex = /^[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]$/;
    return cfRegex.test(cleanCF);
  } else if (cleanCF.length === 11) {
    // Company format: 11 digits (same as Partita IVA)
    const cfRegex = /^[0-9]{11}$/;
    return cfRegex.test(cleanCF);
  }

  return false;
};

/**
 * Validates Italian Partita IVA (VAT Number)
 * Format: 11 digits
 */
export const validatePartitaIVA = (piva: string): boolean => {
  if (!piva) return false;

  // Remove spaces
  const cleanPIVA = piva.replace(/\s/g, '');

  // Must be exactly 11 digits
  if (!/^[0-9]{11}$/.test(cleanPIVA)) {
    return false;
  }

  // Luhn algorithm check for Partita IVA
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    let digit = parseInt(cleanPIVA[i]);

    if (i % 2 === 0) {
      // Even position (0-indexed)
      sum += digit;
    } else {
      // Odd position (0-indexed)
      let doubled = digit * 2;
      if (doubled > 9) {
        doubled -= 9;
      }
      sum += doubled;
    }
  }

  return sum % 10 === 0;
};

/**
 * Validates email format
 */
export const validateEmail = (email: string): boolean => {
  if (!email) return false;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validates Italian phone number format
 * Accepts formats like: +39 123 456 7890, +39 1234567890, 3331234567, etc.
 */
export const validateItalianPhone = (phone: string): boolean => {
  if (!phone) return false;

  // Remove spaces, dashes, and parentheses
  const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');

  // Check various Italian phone formats
  // 23/10/2026: il campo telefono ha la bandiera e manda "+<prefisso><numero>":
  // un numero estero (+33, +41...) e' valido quanto uno italiano.
  const phoneRegex = /^\+?[0-9]{6,15}$/;

  return phoneRegex.test(cleanPhone);
};

/**
 * Validates Italian Codice Univoco (Public Administration code)
 * Format: 6 alphanumeric characters
 */
export const validateCodiceUnivoco = (codice: string): boolean => {
  if (!codice) return false;

  const cleanCodice = codice.replace(/\s/g, '').toUpperCase();

  // Must be exactly 6 alphanumeric characters
  const codiceRegex = /^[A-Z0-9]{6}$/;
  return codiceRegex.test(cleanCodice);
};

/**
 * Validates Italian Codice Destinatario (SDI code for electronic invoicing)
 * Format: 7 alphanumeric characters or "0000000" for PEC delivery
 */
export const validateCodiceDestinatario = (codice: string): boolean => {
  if (!codice) return true; // Optional field

  const cleanCodice = codice.replace(/\s/g, '').toUpperCase();

  // Must be exactly 7 alphanumeric characters
  const codiceRegex = /^[A-Z0-9]{7}$/;
  return codiceRegex.test(cleanCodice);
};

/**
 * Formats Codice Fiscale to uppercase without spaces
 */
export const formatCodiceFiscale = (cf: string): string => {
  return cf.replace(/\s/g, '').toUpperCase();
};

/**
 * Formats Partita IVA to remove spaces
 */
export const formatPartitaIVA = (piva: string): string => {
  return piva.replace(/\s/g, '');
};

/**
 * Formats Italian phone number to international format
 */
export const formatItalianPhone = (phone: string): string => {
  const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');

  // If it doesn't start with +, add +39
  if (!cleanPhone.startsWith('+')) {
    // If it starts with 39, add +
    if (cleanPhone.startsWith('39')) {
      return `+${cleanPhone}`;
    }
    // Otherwise add +39
    return `+39${cleanPhone}`;
  }

  return cleanPhone;
};
