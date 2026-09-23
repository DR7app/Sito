/**
 * Loghi delle testate (bianchi su trasparente, in `public/loghi-stampa/`).
 *
 * Servono alla pagina Press e alla pagina Investitori: la testata si
 * riconosce dal nome scritto nell'articolo, senza ripetere il percorso in
 * ogni riga. Nome senza logo = si mostra il nome scritto, come prima.
 */
const LOGHI: Record<string, string> = {
  'forbes miami': '/loghi-stampa/forbes-miami.png',
  'forbes': '/loghi-stampa/forbes-miami.png',
  'fortune italia': '/loghi-stampa/fortune-italia.png',
  'il tempo': '/loghi-stampa/il-tempo.png',
  'libero quotidiano': '/loghi-stampa/libero-quotidiano.png',
  'libero': '/loghi-stampa/libero-quotidiano.png',
  'il tirreno': '/loghi-stampa/il-tirreno.png',
  'affaritaliani': '/loghi-stampa/affaritaliani.png',
  'affaritaliani.it': '/loghi-stampa/affaritaliani.png',
  'il roma': '/loghi-stampa/il-roma.png',
  'nano tv': '/loghi-stampa/nano-tv.png',
  'nanotv': '/loghi-stampa/nano-tv.png',
  'lifestyleblog.it': '/loghi-stampa/lifestyleblog.png',
  'lifestyleblog': '/loghi-stampa/lifestyleblog.png',
  'nerdbot': '/loghi-stampa/nerdbot.png',
  'talkymedia': '/loghi-stampa/talkymedia.png',
  'talky media': '/loghi-stampa/talkymedia.png',
  'estate in sardegna': '/loghi-stampa/estate-in-sardegna.png',
};

/** Il logo della testata, o '' se non ce l'abbiamo. */
export function logoTestata(nome: string): string {
  const chiave = (nome || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  return LOGHI[chiave] || '';
}
