// Nomi sicuri per le chiavi dello storage Supabase.
//
// 26/09/2026 — INCIDENTE: il documento DR7 Trust "Contestazione Danni
// Lamborghini Huracán tecnica " non si poteva firmare dopo l'OTP. Il nome,
// con accento e spazio finale, finiva tale e quale nel percorso del PDF e lo
// storage rifiutava la chiave ("Invalid key"). Ogni percorso passato a
// `.upload(` deve passare da qui: il test utils/nomeFileSicuro.test.ts
// fallisce se un file carica nello storage senza importare questo modulo.
//
// Solo il percorso cambia: il nome mostrato alle persone resta quello vero.

/** Rende un segmento di percorso sicuro: solo lettere ASCII, cifre, . _ - */
export function nomeFileSicuro(nome: unknown, max = 80): string {
  const pulito = String(nome ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.]+|[_.]+$/g, '')
  if (!pulito) return 'file'
  if (pulito.length <= max) return pulito
  // Troppo lungo: si taglia il nome e si tiene l'estensione.
  const punto = pulito.lastIndexOf('.')
  const ext = punto > 0 && pulito.length - punto <= 10 ? pulito.slice(punto) : ''
  const base = pulito.slice(0, Math.max(1, max - ext.length)).replace(/[_.]+$/g, '')
  return `${base || 'file'}${ext}`
}

/** Unisce segmenti ripuliti uno a uno con '/': mai '..' ne' '/' da un nome. */
export function percorsoStorage(...parti: unknown[]): string {
  return parti
    .map(p => nomeFileSicuro(p, 120))
    .join('/')
}
