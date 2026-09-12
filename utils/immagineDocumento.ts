/**
 * Prepara la foto di un documento prima di spedirla.
 *
 * Tre cose rompevano il caricamento e nessuna si vedeva dal sito:
 *  - le foto dell'iPhone sono HEIC e i bucket accettano solo jpeg, png e pdf;
 *  - il webp passava il controllo della funzione ma lo rifiutava il bucket;
 *  - oltre i 5 MB il caricamento moriva con un 413 prima ancora di arrivare
 *    alla funzione.
 *
 * Qui ogni immagine diventa un JPEG sotto la soglia, il PDF passa intatto.
 */

/** Sotto questa dimensione il corpo della richiesta non sfonda i limiti. */
const MAX_BYTE = 3_500_000;
const LATO_MAX = 2400;

const eJpeg = (f: File) => f.type === 'image/jpeg' || /\.jpe?g$/i.test(f.name);
const ePdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

function nomeJpeg(nome: string): string {
  const base = nome.replace(/\.[^.]+$/, '') || 'documento';
  return `${base.replace(/[^\w.\-]+/g, '_')}.jpg`;
}

async function disegna(file: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((risolvi, rifiuta) => {
      const i = new Image();
      i.onload = () => risolvi(i);
      i.onerror = () => rifiuta(new Error('formato immagine non leggibile dal browser'));
      i.src = url;
    });
    let { width, height } = img;
    if (width > LATO_MAX || height > LATO_MAX) {
      const r = Math.min(LATO_MAX / width, LATO_MAX / height);
      width = Math.round(width * r);
      height = Math.round(height * r);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas non disponibile');
    ctx.drawImage(img, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function aJpeg(canvas: HTMLCanvasElement, nome: string): Promise<File> {
  let qualita = 0.9;
  for (;;) {
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', qualita));
    if (!blob) throw new Error('conversione in JPEG non riuscita');
    if (blob.size <= MAX_BYTE || qualita <= 0.4) {
      return new File([blob], nomeJpeg(nome), { type: 'image/jpeg' });
    }
    qualita -= 0.1;
  }
}

/**
 * Restituisce il file pronto per il caricamento. Solleva un errore leggibile
 * quando il browser non sa aprire il formato (HEIC fuori da Safari): meglio
 * dirlo subito che lasciare il documento perso per strada.
 */
export async function preparaFileDocumento(file: File): Promise<File> {
  if (ePdf(file)) return file;
  if (eJpeg(file) && file.size <= MAX_BYTE) return file;

  try {
    const canvas = await disegna(file);
    return await aJpeg(canvas, file.name);
  } catch (err) {
    if (eJpeg(file) || file.type === 'image/png') {
      // Formato buono ma troppo pesante e non ridimensionabile: meglio
      // tentare comunque il caricamento che bloccare la persona.
      return file;
    }
    const motivo = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Non riusciamo a leggere ${file.name} (${motivo}). ` +
      'Salva la foto in JPG o PNG e riprova.'
    );
  }
}
