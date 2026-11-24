/* ──────────────────────────────────────────────────────────────
   Testi della vetrina, IT / EN.
   Ogni funzione citata esiste nel gestionale (DR7-AI): niente
   promesse che la piattaforma non mantiene, niente numeri scritti
   a mano.
   ────────────────────────────────────────────────────────────── */

export type Lang = 'it' | 'en'

export const EMAIL = 'info@dr7ai.com'

export function mailDemo(lang: Lang) {
  const subject = lang === 'it' ? 'Richiesta demo DR7 AI' : 'DR7 AI demo request'
  const body =
    lang === 'it'
      ? 'Buongiorno,\n\nvorrei vedere DR7 AI in funzione.\n\nAzienda:\nSettore:\nTelefono:\n'
      : 'Hello,\n\nI would like to see DR7 AI in action.\n\nCompany:\nIndustry:\nPhone:\n'
  return `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

const it = {
  seo: {
    title: 'DR7 AI — Il gestionale per noleggi, lavaggi, soggiorni e servizi',
    description:
      'DR7 AI è la piattaforma che gestisce un’azienda di noleggio dalla richiesta alla fattura: prenotazioni, calendari, preventivi, pagamenti Nexi, cauzioni, contratti con firma OTP, fatturazione elettronica SDI, danni, multe, flotta, magazzino, personale, marketing WhatsApp e rete EMTN di affidabilità clienti. Per auto, barche, elicotteri e jet, soggiorni, centri lavaggio e officine.',
  },
  nav: {
    piattaforma: 'Piattaforma',
    ciclo: 'Come lavora',
    moduli: 'Moduli',
    emtn: 'EMTN',
    prezzi: 'Prezzi',
    demo: 'Richiedi una demo',
    menu: 'Menu',
    chiudi: 'Chiudi',
  },
  hero: {
    eyebrow: 'DR7 AI · Piattaforma gestionale',
    h: ['Il gestionale', 'che fa girare', 'un’azienda vera.'],
    sub: 'Prenotazioni, incassi, contratti, fatture, flotta e clienti in un solo ambiente. Nato dentro DR7, usato ogni giorno, ora disponibile per la tua azienda.',
    cta1: 'Richiedi una demo',
    cta2: 'Scopri la piattaforma',
    frame: 'Prenotazioni Noleggio · istanza dimostrativa',
  },
  statement: {
    lines: ['Non un prototipo.', 'Il software con cui', 'lavora DR7.'],
    note: 'Ogni funzione nasce da un problema reale',
  },
  business: {
    eyebrow: '01 · Cinque attività, una piattaforma',
    h: 'Quello che noleggi\no servi, lo gestisci qui.',
    intro: 'Ogni attività ha il suo calendario, il suo catalogo, i suoi contratti e i suoi report. Clienti, incassi e fatture restano uno solo.',
    items: [
      { k: 'Terra', t: 'Noleggio auto e flotte', d: 'Prenotazioni, calendario giornaliero, consegne e rientri, chilometri e sforo, danni e penali, CarGOS, GPS della flotta.' },
      { k: 'Mare', t: 'Imbarcazioni e tour', d: 'Catalogo barche, uscite e tour, preventivi, contratti dedicati, allerta meteo al cliente prima dell’uscita.' },
      { k: 'Aria', t: 'Elicotteri e jet privati', d: 'Voli e tour, preventivi su richiesta, movimenti aerei di andata e ritorno ricavati dalle prenotazioni.' },
      { k: 'Soggiorni', t: 'Hotel, B&B, ville, appartamenti', d: 'Disponibilità per struttura, soggiorni, contratti e cauzioni con le stesse regole del resto dell’azienda.' },
      { k: 'Lavaggio & Meccanica', t: 'Centri lavaggio e officine', d: 'Slot da 15 minuti, catalogo servizi ed extra, blocchi straordinari e sold out, auto di cortesia.' },
    ],
  },
  ciclo: {
    eyebrow: '02 · Come lavora',
    h: 'Dalla richiesta\nalla fattura,\nsenza rincorrere nessuno.',
    intro: 'Ogni passaggio prepara il successivo. Lo staff conferma; i messaggi, i documenti e i conti li scrive la piattaforma.',
    steps: [
      { t: 'Preventivo', d: 'Prezzo calcolato dalle tue regole e inviato al cliente su WhatsApp ed email.' },
      { t: 'Prenotazione', d: 'Disponibilità reale, orari di ritiro e riconsegna, tempi di preparazione: niente sovrapposizioni.' },
      { t: 'Pagamento', d: 'Link Nexi con scadenza, cauzione pre-autorizzata, acconti, credito wallet.' },
      { t: 'Contratto', d: 'Generato con i dati del cliente e firmato dal suo telefono con codice OTP.' },
      { t: 'Consegna e rientro', d: 'Chilometri, sforo, danni, penali e multe registrati sulla prenotazione giusta.' },
      { t: 'Fattura', d: 'Emessa sul pagato e inviata al SDI. Una sola per prenotazione, mai doppia.' },
      { t: 'Dopo il servizio', d: 'Richiesta di recensione, cashback nel wallet, promemoria e offerte di prolungamento.' },
    ],
  },
  momenti: [
    {
      eyebrow: 'Incassi',
      h: 'Il cliente paga\nprima di arrivare.',
      d: 'Il link di pagamento parte in automatico, scade quando deve e, a incasso avvenuto, conferma la prenotazione da solo. La cauzione si pre-autorizza sulla carta e si svincola con un clic.',
    },
    {
      eyebrow: 'Contratti',
      h: 'Firmato dal telefono\ndel cliente.',
      d: 'Il contratto si compila con i dati della scheda cliente. Il cliente lo legge, riceve un codice OTP e firma. Se cambiano le date, il contratto segue la prenotazione.',
    },
    {
      eyebrow: 'Fatturazione',
      h: 'La fattura\nsi scrive da sola.',
      d: 'Ogni incasso diventa una fattura elettronica inviata al Sistema di Interscambio, con penali, danni e note di credito. Gli importi si inseriscono IVA inclusa: lo scorporo lo fa la piattaforma.',
    },
    {
      eyebrow: 'Documenti',
      h: 'Una foto.\nTutta la scheda.',
      d: 'Patente e documento d’identità letti dall’intelligenza artificiale: anagrafica, codice fiscale, scadenze. La scheda cliente si completa in pochi secondi, anche dal sito.',
    },
  ],
  pv: { tag: 'Messaggio automatico · WhatsApp', body: 'Buongiorno Marco, la prenotazione 4F21 è registrata. Completi il pagamento di € 420,00 per confermarla:', link: 'Paga ora · link sicuro Nexi', expire: 'Il link scade tra 1 ora', paid: 'Pagamento ricevuto · prenotazione confermata' },
  cv: { title: 'Contratto di noleggio', n: 'N. DR7-0418', rows: [['Cliente', 'Marco R.'], ['Veicolo', 'Porsche 911 Carrera'], ['Dal', '14/11/2026 10:30'], ['Al', '17/11/2026 09:00']], otp: 'Codice OTP inviato al +39 ••• ••• 4821', sign: 'Firmato' },
  iv: { title: 'Fattura 2026/1484', status: 'Accettata dal SDI', rows: [['Noleggio 3 giorni', '1.475,41'], ['IVA 22%', '324,59']], total: 'Totale', amount: '€ 1.800,00' },
  dv: { tag: 'Lettura documento', fields: [['Cognome e nome', 'Rossi Marco'], ['Patente', 'U1•••••••K'], ['Categoria', 'B'], ['Scadenza', '03/2034'], ['Codice fiscale', 'RSSMRC••••••••••']], done: 'Scheda cliente completata' },
  moduli: {
    eyebrow: '03 · Moduli',
    h: 'Tutto quello che\nun’azienda tiene in testa.',
    intro: 'Ogni modulo parla con gli altri: un pagamento aggiorna la prenotazione, la prenotazione aggiorna il calendario, il calendario aggiorna i report.',
    gruppi: [
      { t: 'Operatività', v: ['Prenotazioni e calendario giornaliero', 'Preventivi', 'Contratti con firma OTP', 'Uscite straordinarie e tour', 'Ticket interni'] },
      { t: 'Incassi e amministrazione', v: ['Pagamenti Nexi e pay-by-link', 'Cauzioni e acconti', 'Fatturazione elettronica SDI', 'Insoluti e solleciti', 'Fornitori e fatture passive'] },
      { t: 'Clienti', v: ['Scheda cliente con documenti', 'Lettura documenti con AI', 'Rete EMTN', 'Compleanni e scadenze', 'Iscritti dal sito'] },
      { t: 'Marketing', v: ['Campagne WhatsApp ed email', 'Messaggi automatici modificabili', 'Recensioni Google', 'Codici sconto e prevendite', 'Wallet, cashback e referral'] },
      { t: 'Flotta e magazzino', v: ['Veicoli e categorie', 'GPS della flotta', 'Danni e penali', 'Multe', 'Magazzino per attività'] },
      { t: 'Persone e controllo', v: ['Operatori, ruoli e permessi', 'Rilevazione orari e pause', 'Dashboard e report per attività', 'Sito web gestito dal gestionale', 'Allarmi e controlli automatici'] },
    ],
  },
  centralina: {
    eyebrow: '04 · Centralina',
    h: 'Le regole\nle scrivi tu.',
    intro: 'Prezzi, orari, cauzioni, assicurazioni, testi dei messaggi: tutto si cambia da un pannello, senza chiamare uno sviluppatore. La piattaforma applica le regole a ogni prenotazione, sul gestionale e sul sito.',
    punti: [
      ['Nessun blocco rigido', 'Quando serve un’eccezione, la direzione la autorizza con un codice OTP. Il lavoro non si ferma, e resta traccia di chi ha deciso.'],
      ['Ruoli e permessi', 'Ogni operatore vede solo le sezioni e le attività che gli assegni: il cassiere non apre la Centralina.'],
      ['Interruttori', 'Una funzione si spegne con un clic: i messaggi automatici, un canale, un controllo. Si riaccende quando vuoi.'],
    ],
    panel: {
      title: 'Centralina · Noleggio',
      rows: [['Ritiro', 'Lun–Sab · 10:30–12:30 · 16:30–18:30'], ['Riconsegna', 'Lun–Sab · 09:00–11:00 · 15:00–17:00'], ['Domenica', 'Chiuso'], ['Sforo km', '€ 1,80 / km'], ['Cauzione', 'Per categoria']],
      switches: [['Messaggi automatici', true], ['Promemoria ritiro', true], ['Recensioni WhatsApp', false]] as [string, boolean][],
    },
  },
  emtn: {
    eyebrow: '05 · EMTN · European Mobility Trust Network',
    h: 'Sai chi guida\nprima di consegnare le chiavi.',
    intro: 'EMTN è la rete di fiducia tra operatori, inclusa solo in DR7 AI. Con il codice fiscale vedi come si è comportato il cliente presso gli altri noleggi della rete: danni, penali, pagamenti mancati.',
    punti: [
      ['Solo con il consenso', 'Si consulta per codice fiscale, con una prenotazione attiva e un codice OTP confermato dal cliente.'],
      ['Solo fatti documentati', 'Ogni segnalazione richiede prove e passa da una revisione prima di entrare nella rete.'],
      ['La decisione è tua', 'Il livello di fiducia è informativo: nessun blocco automatico, l’ultima parola resta a te.'],
    ],
    card: { level: 'Rischio molto basso', rows: [['Noleggi conclusi senza eventi', '3'], ['Segnalazioni approvate', '0'], ['Pagamenti in sospeso', '0']], source: 'Fonte: operatori della rete EMTN · dati anonimi' },
  },
  istanza: {
    eyebrow: '06 · La tua istanza',
    h: 'La tua piattaforma.\nSolo tua.',
    intro: 'Ogni azienda riceve la propria istanza: database dedicato, indirizzo dedicato, i tuoi utenti e i tuoi dati. Nessuna tabella condivisa con altre aziende.',
    punti: [
      ['Database dedicato', 'Infrastruttura europea, dati cifrati, backup giornalieri.'],
      ['Partenza pulita', 'Moduli, regole e messaggi pronti; nessun dato di altri. Importiamo i tuoi clienti, veicoli e prenotazioni.'],
      ['Sempre aggiornata', 'Le migliorie che nascono in DR7 arrivano anche a te.'],
    ],
  },
  integrazioni: 'Si collega agli strumenti che già usi',
  prezzi: {
    eyebrow: '07 · Prezzi',
    h: 'Un piano costruito\nsulla tua azienda.',
    intro: 'Ogni attività è diversa. Definiamo il piano in base a mezzi, sedi, attività attive e volumi. Nessun costo nascosto, nessun vincolo.',
    popular: 'Il più scelto',
    custom: 'Su misura',
    cta: 'Richiedi un preventivo',
    tiers: [
      { name: 'Starter', scope: 'Una sede, una attività', features: ['Prenotazioni e calendario', 'Preventivi e contratti con firma OTP', 'Pagamenti Nexi e cauzioni', 'Schede cliente'], highlight: false },
      { name: 'Pro', scope: 'Aziende in crescita', features: ['Tutto di Starter', 'Fatturazione elettronica SDI', 'Messaggi automatici WhatsApp', 'Lettura documenti con AI', 'Rete EMTN', 'Wallet, cashback e campagne'], highlight: true },
      { name: 'Enterprise', scope: 'Più attività e più sedi', features: ['Terra, Mare, Aria, Soggiorni, Lavaggio', 'Personale, orari e magazzino', 'Sito web gestito dal gestionale', 'Onboarding e supporto dedicati'], highlight: false },
    ],
  },
  faq: {
    eyebrow: 'Domande frequenti',
    items: [
      ['Posso portare i dati che ho già?', 'Sì. Durante l’avvio importiamo clienti, mezzi e prenotazioni esistenti, senza fermare l’attività.'],
      ['La fatturazione elettronica è inclusa?', 'Sì. Le fatture partono verso il Sistema di Interscambio tramite Aruba, comprese penali, danni e note di credito.'],
      ['Funziona per attività diverse dal noleggio auto?', 'Sì. La stessa piattaforma gestisce barche, elicotteri e jet, soggiorni, centri lavaggio e officine: ognuno con calendario, catalogo, contratti e report propri.'],
      ['Cos’è EMTN?', 'La rete di fiducia tra operatori integrata in DR7 AI. Gli operatori condividono danni, penali e insoluti documentati; tu consulti lo storico del cliente per codice fiscale, con il suo consenso. Gli altri operatori restano anonimi.'],
      ['I miei dati sono separati da quelli degli altri?', 'Sì. Ogni azienda ha un’istanza e un database propri. L’unica informazione condivisa è quella di EMTN, anonima e solo con il consenso del cliente.'],
      ['Che supporto offrite?', 'Supporto in italiano e inglese via WhatsApp ed email. I piani Pro ed Enterprise hanno priorità e un avvio seguito da noi.'],
    ],
  },
  chiusura: {
    eyebrow: 'Demo',
    h: ['Guardala lavorare', 'sui tuoi casi.'],
    sub: 'Ti mostriamo la piattaforma su un’istanza dimostrativa, con le tue attività e le tue regole.',
    cta: 'Richiedi una demo',
    note: 'Nessun impegno · ',
  },
  footer: { lang: 'Lingua', rights: 'Tutti i diritti riservati' },
}

export type Copy = typeof it

const en: Copy = {
  seo: {
    title: 'DR7 AI — Management software for rentals, washes, stays and services',
    description:
      'DR7 AI runs a rental business from request to invoice: bookings, calendars, quotes, Nexi payments, deposits, contracts with OTP signature, SDI e-invoicing, damages, fines, fleet, inventory, staff, WhatsApp marketing and the EMTN customer trust network. For cars, boats, helicopters and jets, stays, car washes and workshops.',
  },
  nav: {
    piattaforma: 'Platform',
    ciclo: 'How it works',
    moduli: 'Modules',
    emtn: 'EMTN',
    prezzi: 'Pricing',
    demo: 'Request a demo',
    menu: 'Menu',
    chiudi: 'Close',
  },
  hero: {
    eyebrow: 'DR7 AI · Management platform',
    h: ['The software', 'that runs', 'a real business.'],
    sub: 'Bookings, payments, contracts, invoices, fleet and customers in one place. Built inside DR7, used every day, now available for your company.',
    cta1: 'Request a demo',
    cta2: 'Explore the platform',
    frame: 'Rental bookings · demo instance',
  },
  statement: {
    lines: ['Not a prototype.', 'The software', 'DR7 runs on.'],
    note: 'Every feature comes from a real problem',
  },
  business: {
    eyebrow: '01 · Five businesses, one platform',
    h: 'Whatever you rent\nor serve, you run it here.',
    intro: 'Each business has its own calendar, catalogue, contracts and reports. Customers, payments and invoices stay in one place.',
    items: [
      { k: 'Land', t: 'Car and fleet rental', d: 'Bookings, daily calendar, handovers and returns, mileage and overage, damages and penalties, police reporting, fleet GPS.' },
      { k: 'Sea', t: 'Boats and tours', d: 'Boat catalogue, trips and tours, quotes, dedicated contracts, weather alerts to the customer before departure.' },
      { k: 'Air', t: 'Helicopters and private jets', d: 'Flights and tours, quotes on request, outbound and return movements derived from bookings.' },
      { k: 'Stays', t: 'Hotels, B&Bs, villas, apartments', d: 'Availability per property, stays, contracts and deposits under the same rules as the rest of the company.' },
      { k: 'Wash & Mechanics', t: 'Car washes and workshops', d: '15-minute slots, service and extras catalogue, special closures and sold-out days, courtesy cars.' },
    ],
  },
  ciclo: {
    eyebrow: '02 · How it works',
    h: 'From request\nto invoice,\nwithout chasing anyone.',
    intro: 'Each step sets up the next. Staff confirm; the platform writes the messages, the documents and the numbers.',
    steps: [
      { t: 'Quote', d: 'Price computed from your rules and sent to the customer on WhatsApp and email.' },
      { t: 'Booking', d: 'Real availability, pickup and return hours, preparation time: no overlaps.' },
      { t: 'Payment', d: 'Expiring Nexi link, pre-authorised deposit, down payments, wallet credit.' },
      { t: 'Contract', d: 'Filled in with the customer’s data and signed from their phone with an OTP code.' },
      { t: 'Handover and return', d: 'Mileage, overage, damages, penalties and fines logged on the right booking.' },
      { t: 'Invoice', d: 'Issued when paid and sent to SDI. One per booking, never twice.' },
      { t: 'After the service', d: 'Review request, wallet cashback, reminders and extension offers.' },
    ],
  },
  momenti: [
    {
      eyebrow: 'Payments',
      h: 'Customers pay\nbefore they arrive.',
      d: 'The payment link goes out automatically, expires when it should and, once paid, confirms the booking on its own. Deposits are pre-authorised on the card and released in one click.',
    },
    {
      eyebrow: 'Contracts',
      h: 'Signed from the\ncustomer’s phone.',
      d: 'The contract is filled in from the customer profile. The customer reads it, receives an OTP code and signs. If the dates change, the contract follows the booking.',
    },
    {
      eyebrow: 'Invoicing',
      h: 'The invoice\nwrites itself.',
      d: 'Every payment becomes an e-invoice sent to the Italian Interchange System, with penalties, damages and credit notes. Amounts are entered VAT included: the platform does the split.',
    },
    {
      eyebrow: 'Documents',
      h: 'One photo.\nThe whole profile.',
      d: 'Driving licence and ID read by AI: personal details, tax code, expiry dates. The customer profile is complete in seconds, from the website too.',
    },
  ],
  pv: { tag: 'Automatic message · WhatsApp', body: 'Hello Marco, booking 4F21 is registered. Complete the € 420.00 payment to confirm it:', link: 'Pay now · secure Nexi link', expire: 'The link expires in 1 hour', paid: 'Payment received · booking confirmed' },
  cv: { title: 'Rental agreement', n: 'No. DR7-0418', rows: [['Customer', 'Marco R.'], ['Vehicle', 'Porsche 911 Carrera'], ['From', '14/11/2026 10:30'], ['To', '17/11/2026 09:00']], otp: 'OTP code sent to +39 ••• ••• 4821', sign: 'Signed' },
  iv: { title: 'Invoice 2026/1484', status: 'Accepted by SDI', rows: [['3-day rental', '1,475.41'], ['VAT 22%', '324.59']], total: 'Total', amount: '€ 1,800.00' },
  dv: { tag: 'Document reading', fields: [['Full name', 'Rossi Marco'], ['Licence', 'U1•••••••K'], ['Category', 'B'], ['Expiry', '03/2034'], ['Tax code', 'RSSMRC••••••••••']], done: 'Customer profile complete' },
  moduli: {
    eyebrow: '03 · Modules',
    h: 'Everything a business\nkeeps in its head.',
    intro: 'Every module talks to the others: a payment updates the booking, the booking updates the calendar, the calendar updates the reports.',
    gruppi: [
      { t: 'Operations', v: ['Bookings and daily calendar', 'Quotes', 'Contracts with OTP signature', 'Special trips and tours', 'Internal tickets'] },
      { t: 'Payments and admin', v: ['Nexi payments and pay-by-link', 'Deposits and down payments', 'SDI e-invoicing', 'Unpaid balances and reminders', 'Suppliers and purchase invoices'] },
      { t: 'Customers', v: ['Customer profile with documents', 'AI document reading', 'EMTN network', 'Birthdays and expiries', 'Website sign-ups'] },
      { t: 'Marketing', v: ['WhatsApp and email campaigns', 'Editable automatic messages', 'Google reviews', 'Discount codes and presales', 'Wallet, cashback and referrals'] },
      { t: 'Fleet and inventory', v: ['Vehicles and categories', 'Fleet GPS', 'Damages and penalties', 'Fines', 'Inventory per business'] },
      { t: 'People and control', v: ['Staff, roles and permissions', 'Time tracking and breaks', 'Dashboards and reports per business', 'Website managed from the platform', 'Automatic alarms and checks'] },
    ],
  },
  centralina: {
    eyebrow: '04 · Control panel',
    h: 'You write\nthe rules.',
    intro: 'Prices, hours, deposits, insurance, message texts: everything changes from one panel, without calling a developer. The platform applies the rules to every booking, in the back office and on the website.',
    punti: [
      ['No hard blocks', 'When an exception is needed, management approves it with an OTP code. Work never stops, and there is a record of who decided.'],
      ['Roles and permissions', 'Each staff member only sees the sections and businesses you assign: the front desk never opens the control panel.'],
      ['Switches', 'Turn a feature off in one click: automatic messages, a channel, a check. Turn it back on whenever you want.'],
    ],
    panel: {
      title: 'Control panel · Rental',
      rows: [['Pickup', 'Mon–Sat · 10:30–12:30 · 16:30–18:30'], ['Return', 'Mon–Sat · 09:00–11:00 · 15:00–17:00'], ['Sunday', 'Closed'], ['Extra km', '€ 1.80 / km'], ['Deposit', 'Per category']],
      switches: [['Automatic messages', true], ['Pickup reminder', true], ['WhatsApp reviews', false]],
    },
  },
  emtn: {
    eyebrow: '05 · EMTN · European Mobility Trust Network',
    h: 'Know who’s driving\nbefore you hand over the keys.',
    intro: 'EMTN is the trust network between operators, included only in DR7 AI. Enter the tax code and see how the customer behaved with other rental companies in the network: damages, penalties, unpaid balances.',
    punti: [
      ['Consent first', 'Lookups are by tax code only, with an active booking and an OTP code confirmed by the customer.'],
      ['Documented facts only', 'Every report needs evidence and is reviewed before it reaches the network.'],
      ['You decide', 'The trust level is informative: no automatic blocks, the final call is yours.'],
    ],
    card: { level: 'Very low risk', rows: [['Rentals completed without incidents', '3'], ['Approved reports', '0'], ['Outstanding payments', '0']], source: 'Source: EMTN network operators · anonymised data' },
  },
  istanza: {
    eyebrow: '06 · Your instance',
    h: 'Your platform.\nYours alone.',
    intro: 'Every company gets its own instance: dedicated database, dedicated address, your users and your data. No table shared with other companies.',
    punti: [
      ['Dedicated database', 'European infrastructure, encrypted data, daily backups.'],
      ['Clean start', 'Modules, rules and messages ready; nobody else’s data. We import your customers, vehicles and bookings.'],
      ['Always up to date', 'Improvements built at DR7 reach you too.'],
    ],
  },
  integrazioni: 'Connects to the tools you already use',
  prezzi: {
    eyebrow: '07 · Pricing',
    h: 'A plan built\naround your company.',
    intro: 'Every business is different. We define the plan around vehicles, locations, active businesses and volumes. No hidden costs, no lock-in.',
    popular: 'Most popular',
    custom: 'Custom',
    cta: 'Request a quote',
    tiers: [
      { name: 'Starter', scope: 'One location, one business', features: ['Bookings and calendar', 'Quotes and OTP-signed contracts', 'Nexi payments and deposits', 'Customer profiles'], highlight: false },
      { name: 'Pro', scope: 'Growing companies', features: ['Everything in Starter', 'SDI e-invoicing', 'Automatic WhatsApp messages', 'AI document reading', 'EMTN network', 'Wallet, cashback and campaigns'], highlight: true },
      { name: 'Enterprise', scope: 'Several businesses and locations', features: ['Land, Sea, Air, Stays, Wash', 'Staff, hours and inventory', 'Website managed from the platform', 'Dedicated onboarding and support'], highlight: false },
    ],
  },
  faq: {
    eyebrow: 'Frequently asked questions',
    items: [
      ['Can I bring the data I already have?', 'Yes. During onboarding we import existing customers, vehicles and bookings without stopping your business.'],
      ['Is e-invoicing included?', 'Yes. Invoices go to the Italian Interchange System via Aruba, including penalties, damages and credit notes.'],
      ['Does it work beyond car rental?', 'Yes. The same platform runs boats, helicopters and jets, stays, car washes and workshops, each with its own calendar, catalogue, contracts and reports.'],
      ['What is EMTN?', 'The trust network between operators built into DR7 AI. Operators share documented damages, penalties and unpaid balances; you look up a customer’s history by tax code, with their consent. Other operators stay anonymous.'],
      ['Is my data separate from other companies?', 'Yes. Each company has its own instance and database. The only shared information is EMTN, anonymised and only with the customer’s consent.'],
      ['What support do you offer?', 'Support in Italian and English via WhatsApp and email. Pro and Enterprise plans get priority and a guided start.'],
    ],
  },
  chiusura: {
    eyebrow: 'Demo',
    h: ['See it work', 'on your cases.'],
    sub: 'We show you the platform on a demo instance, with your businesses and your rules.',
    cta: 'Request a demo',
    note: 'No commitment · ',
  },
  footer: { lang: 'Language', rights: 'All rights reserved' },
}

export const CONTENT: Record<Lang, Copy> = { it, en }

export const INTEGRAZIONI = ['Nexi XPay', 'Aruba · SDI', 'WhatsApp', 'CarGOS · Polizia di Stato', 'Google Business Profile', 'Google Analytics', 'Supabase']
