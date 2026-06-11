/**
 * Italian license plate lookup utility.
 * Calls the Netlify proxy function which queries OpenAPI Automotive.
 */

export interface TargaResult {
  plate: string;
  carMake: string;
  carModel: string;
  description: string;
  version?: string;
  bodyType?: string;
  registrationYear: string;
  fuelType: string;
}

export function normalizePlate(input: string): string {
  return input.toUpperCase().replace(/[\s\-]/g, '');
}

export function isValidItalianPlate(input: string): boolean {
  const plate = normalizePlate(input);
  return plate.length >= 5 && plate.length <= 8 && /^[A-Z0-9]+$/.test(plate);
}

export async function lookupTarga(plate: string): Promise<TargaResult> {
  const normalized = normalizePlate(plate);

  const response = await fetch(`/.netlify/functions/lookupTarga?plate=${encodeURIComponent(normalized)}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Errore nella ricerca della targa.');
  }

  return data as TargaResult;
}
