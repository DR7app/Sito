import { useEffect, useState, type ReactNode } from 'react'
import SEOHead from '../../components/seo/SEOHead'
// Stili della landing: tutti dentro `.dr7trust-landing`.
import './dr7trust.css'

/* ────────────────────────────────────────────────────────────
   dr7.app/dr7-trust — copia della landing di DR7 Trust
   (dr7trust.com, src/pages/LandingPage.tsx + il fondo pagina di
   components/SiteLayout.tsx). Testi e impaginazione identici.

   Cosa cambia rispetto all'originale:
     · la barra in alto di dr7trust.com non c'e': sopra resta quella
       di dr7.app, e il contenuto parte sotto di lei;
     · ogni link interno porta a https://dr7trust.com/<percorso>;
     · l'originale e' Tailwind 4 con la tavolozza di fabbrica, dr7.app
       e' Tailwind 3 con grigi caldi, bianco avorio e angoli quasi
       vivi: qui colori e raggi sono scritti per valore (i grigi e i
       verdi di Tailwind 4 in esadecimale, il bianco puro), cosi' la
       pagina resta quella di dr7trust.com;
     · in Tailwind 4 `leading-*` vince sulla interlinea di `sm:text-*`,
       in Tailwind 3 no: per questo l'interlinea e' ripetuta con `sm:`.
   ──────────────────────────────────────────────────────────── */

const SITO = 'https://dr7trust.com'
const LOGO = '/dr7trust/dr7trust-logo.png'

const footerLinks = [
  { to: '/terms', label: 'Termini di Servizio' },
  { to: '/privacy', label: 'Privacy Policy' },
  { to: '/security', label: 'Security & Compliance' },
  { to: '/api', label: 'API' },
]

/** Link verso dr7trust.com, in una nuova scheda. */
function Esterno({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  return (
    <a href={`${SITO}${to}`} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  )
}

// La barra di dr7.app (Header.tsx) e' fixed e trasparente: il contenuto parte
// sotto di lei, come sull'originale parte sotto la sua barra sticky.
function useAltezzaBarraSito() {
  const [h, setH] = useState(0)
  useEffect(() => {
    const barra = Array.from(document.querySelectorAll('header')).find((el) => !el.closest('.dr7trust-landing'))
    if (!barra) return
    const misura = () => setH(barra.getBoundingClientRect().height)
    misura()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(misura)
    ro.observe(barra)
    return () => ro.disconnect()
  }, [])
  return h
}

export default function Dr7TrustPage() {
  const sotto = useAltezzaBarraSito()

  return (
    <div className="dr7trust-landing min-h-screen bg-black text-[#f3f4f6] flex flex-col" style={{ paddingTop: sotto }}>
      <SEOHead
        title="DR7 Trust - Infrastructure for Digital Trust"
        description="Firma elettronica sicura, tracciata e gratuita. Firma documenti in pochi secondi con OTP via WhatsApp."
        canonical="/dr7-trust"
      />

      <main className="flex-1">
        {/* Hero */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pt-12 sm:pt-24 pb-12 sm:pb-20 text-center">
          <h1 className="text-3xl sm:text-5xl lg:text-[56px] font-bold leading-[1.1] sm:leading-[1.1] mb-5 sm:mb-6 text-[#fff]">
            Ancora a stampare, firmare e scannerizzare documenti?
          </h1>
          <p className="text-lg sm:text-2xl text-[#99a1af] mb-4 leading-relaxed sm:leading-relaxed">
            Con <strong className="text-[#00a63e]">DR7 Trust</strong> firmi e invii tutto <strong className="text-[#fff]">in meno di un minuto.</strong>
          </p>
          <p className="text-sm sm:text-lg text-[#99a1af] mb-8 sm:mb-10 leading-relaxed sm:leading-relaxed max-w-2xl mx-auto">
            Carica un PDF, scegli a chi inviarlo e il firmatario riceve il link via <strong className="text-[#e5e7eb]">email e WhatsApp</strong>.
            <br className="hidden sm:block" />
            <span className="sm:hidden"> </span>
            Ogni documento ha <strong className="text-[#e5e7eb]">Audit Trail certificato</strong> con data, ora e dispositivo.
          </p>
          <Esterno to="/login" className="inline-block w-full sm:w-auto bg-[#00a63e] hover:bg-[#008236] text-[#fff] font-bold py-4 px-8 sm:px-10 rounded-[0.75rem] text-lg transition-all shadow-lg shadow-[#00a63e]/25 active:scale-[0.98]">
            Inizia Gratis
          </Esterno>
        </section>

        {/* How it works */}
        <section className="py-12 sm:py-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <h2 className="text-2xl sm:text-3xl font-bold text-center text-[#fff] mb-4">Come funziona</h2>
            <p className="text-center text-sm sm:text-base text-[#99a1af] mb-10 sm:mb-12 max-w-xl mx-auto">Tre passaggi. Un minuto. Invia a chiunque.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 sm:gap-8">
              {[
                { step: '1', title: 'Carica il documento', desc: 'Trascina un PDF nella dashboard. Supporta qualsiasi tipo di documento.' },
                { step: '2', title: 'Aggiungi i firmatari', desc: 'Uno o piu firmatari per documento. Inserisci nome, email e WhatsApp. Clienti, fornitori, dipendenti — chiunque.' },
                { step: '3', title: 'Invia e monitora', desc: 'Ogni firmatario riceve il proprio link via email e WhatsApp. Firma con OTP. Monitora chi ha gia firmato.' },
              ].map(s => (
                <div key={s.step} className="text-center">
                  <div className="w-12 h-12 rounded-full bg-[#00a63e] text-[#fff] text-xl font-bold flex items-center justify-center mx-auto mb-4">{s.step}</div>
                  <h3 className="text-lg font-bold text-[#fff] mb-2">{s.title}</h3>
                  <p className="text-[#6a7282] text-sm leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
            <p className="text-center text-sm text-[#99a1af] mt-8">Ogni firmatario ha il proprio link e audit trail indipendente.</p>
          </div>
        </section>

        {/* Features */}
        <section className="bg-[#0a0a0a] py-12 sm:py-20">
          <div className="max-w-5xl mx-auto px-4 sm:px-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {[
                { title: 'Multi-firmatario.', desc: 'Invia a piu persone. Ogni firmatario riceve il proprio link e firma in autonomia.' },
                { title: 'Tracciata.', desc: 'Audit trail completo: IP, data, ora, dispositivo per ogni firma.' },
                { title: 'Protetta.', desc: 'Hash SHA-256, documento non modificabile dopo la firma.' },
                { title: 'Gratuita.', desc: 'Piano Free senza limiti, sostenuto da offerte partner.' },
              ].map(f => (
                <div key={f.title} className="bg-[#fff]/[0.04] border border-[#fff]/10 rounded-[0.75rem] p-5 sm:p-6 shadow-black/40 hover:shadow-md hover:shadow-[#00a63e]/5 transition-shadow">
                  <h3 className="text-base sm:text-lg font-bold text-[#00a63e] mb-2">{f.title}</h3>
                  <p className="text-[#6a7282] text-sm leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing preview */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-4 text-[#fff]">Scegli il tuo piano</h2>
          <p className="text-center text-sm sm:text-base text-[#99a1af] mb-10 sm:mb-12">
            <Esterno to="/pricing" className="hover:text-[#00a63e] transition-colors underline underline-offset-4">Vedi tutti i dettagli</Esterno>
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
            <div className="bg-[#fff]/[0.04] border border-[#fff]/10 rounded-[1rem] p-6 sm:p-8 shadow-black/40">
              <h3 className="text-2xl font-bold text-[#00a63e] mb-1">Free</h3>
              <p className="text-4xl font-bold text-[#fff] mb-1">0</p>
              <p className="text-sm text-[#99a1af] mb-6">per sempre</p>
              <p className="text-[#99a1af] text-sm mb-6 leading-relaxed">
                Piattaforma senza costo, sostenuta da iniziative promozionali e vantaggi commerciali per gli utenti che prestano consenso.
              </p>
              <ul className="text-sm text-[#99a1af] space-y-3 mb-8">
                {['Documenti illimitati', 'Firma OTP via WhatsApp/Email', 'Audit Trail certificato', 'Dashboard documenti'].map(item => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="text-[#00a63e] font-bold text-base">&#10003;</span>
                    {item}
                  </li>
                ))}
              </ul>
              <Esterno to="/login" className="block text-center bg-[#00a63e] hover:bg-[#008236] text-[#fff] font-bold py-3.5 rounded-[0.5rem] transition-colors shadow-md shadow-[#00a63e]/20">
                Inizia Gratis
              </Esterno>
            </div>
            <div className="bg-[#fff]/[0.04] border-2 border-[#00c950]/30 rounded-[1rem] p-6 sm:p-8 relative shadow-black/40">
              <div className="absolute -top-3 right-6 bg-[#00a63e] text-[#fff] text-xs font-bold px-3 py-1 rounded-full">
                PRO
              </div>
              <h3 className="text-2xl font-bold text-[#00a63e] mb-1">Premium</h3>
              <p className="text-4xl font-bold text-[#fff] mb-1">--</p>
              <p className="text-sm text-[#99a1af] mb-6">prossimamente</p>
              <p className="text-[#99a1af] text-sm mb-6 leading-relaxed">
                Esperienza dedicata, senza utilizzo dei contatti per finalita promozionali di terzi.
              </p>
              <ul className="text-sm text-[#99a1af] space-y-3 mb-8">
                {['Tutto del Free', 'Nessuna promozione partner', 'Branding personalizzato', 'API access'].map(item => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="text-[#00a63e] font-bold text-base">&#10003;</span>
                    {item}
                  </li>
                ))}
              </ul>
              <button disabled className="block w-full text-center bg-[#fff]/5 text-[#99a1af] font-bold py-3.5 rounded-[0.5rem] cursor-not-allowed">
                Prossimamente
              </button>
            </div>
          </div>
        </section>

        {/* Trust bar */}
        <section className="bg-[#0d3d2a] py-12 sm:py-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
            <h2 className="text-xl sm:text-3xl font-bold text-[#fff] mb-4">30 giorni gratis. Nessun rischio.</h2>
            <p className="text-[#b9f8cf]/70 text-base sm:text-lg mb-8 max-w-xl mx-auto leading-relaxed sm:leading-relaxed">Prova DR7 Trust gratuitamente e valuta la piattaforma in piena liberta. Nessuna penale, nessun vincolo.</p>
            <Esterno to="/login" className="inline-block w-full sm:w-auto bg-[#fff] text-[#0d3d2a] font-bold py-3.5 px-8 sm:px-10 rounded-[0.75rem] text-lg transition-all hover:bg-[#f0fdf4] active:scale-[0.98]">
              Inizia Gratis
            </Esterno>
          </div>
        </section>
      </main>

      {/* Footer (da SiteLayout di dr7trust.com) */}
      <footer className="border-t border-[#fff]/10 bg-[#0a0a0a]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
          <div className="flex flex-col sm:flex-row items-start justify-between gap-6 sm:gap-8">
            <div>
              <img src={LOGO} alt="DR7 Trust" className="h-8 w-auto mb-3" />
              <p className="text-sm text-[#6a7282] max-w-xs">Infrastructure for Digital Trust</p>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              {footerLinks.map(link => (
                <Esterno key={link.to} to={link.to} className="text-sm text-[#99a1af] hover:text-[#05df72] transition-colors">
                  {link.label}
                </Esterno>
              ))}
            </div>
          </div>
          <div className="mt-8 pt-6 border-t border-[#fff]/10 text-xs text-[#6a7282] text-center sm:text-left">
            DR7 Trust - Infrastructure for Digital Trust
          </div>
        </div>
      </footer>
    </div>
  )
}
