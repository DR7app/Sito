-- I testi del modulo preventivo Aviation (07/09/2026).
--
-- I nuovi testi erano gia' nel codice, ma non si vedevano: la riga
-- `centralina_pro_config.config.site_copy.aviationQuote` contiene le etichette
-- vecchie ("Partenza da *", "Richiedi Preventivo {service}"...) e quello che e'
-- salvato nel pannello vince SEMPRE sui default del codice. Finche' questa
-- riga non si aggiorna, il modulo resta quello di prima.
--
-- Qui si riscrivono SOLO le chiavi del modulo preventivo: il resto di
-- site_copy (home, flotta, club...) non viene toccato, l'operatore `||` unisce
-- le chiavi nuove a quelle esistenti.
--
-- Dopo, i testi restano modificabili da Centralina Pro > Sito come sempre.

UPDATE public.centralina_pro_config
SET config = jsonb_set(
  config,
  '{site_copy,aviationQuote}',
  COALESCE(config->'site_copy'->'aviationQuote', '{}'::jsonb) || $json$
{
  "header_title_template_it": "RICHIEDI IL TUO PREVENTIVO PERSONALIZZATO",
  "header_title_template_en": "REQUEST YOUR TAILORED QUOTE",
  "header_subtitle_it": "Inserisci i dettagli del viaggio. Il nostro team elaborerà una proposta su misura in base alle tue esigenze.",
  "header_subtitle_en": "Tell us about your trip. Our team will put together a proposal built around what you need.",
  "field_departure_label_it": "Da dove desideri partire?",
  "field_departure_label_en": "Where would you like to depart from?",
  "field_arrival_label_it": "Qual è la destinazione?",
  "field_arrival_label_en": "What is your destination?",
  "field_departure_date_label_it": "Data di partenza",
  "field_departure_date_label_en": "Departure date",
  "field_departure_time_label_it": "Orario indicativo di partenza",
  "field_departure_time_label_en": "Approximate departure time",
  "field_return_flight_label_it": "Hai bisogno anche del volo di ritorno?",
  "field_return_flight_label_en": "Do you also need a return flight?",
  "field_return_date_label_it": "Data di ritorno (opzionale)",
  "field_return_date_label_en": "Return date (optional)",
  "field_return_time_label_it": "Orario indicativo di ritorno (opzionale)",
  "field_return_time_label_en": "Approximate return time (optional)",
  "field_passengers_label_it": "Numero di passeggeri",
  "field_passengers_label_en": "Number of passengers",
  "field_stops_label_it": "Sono previste tappe o scali intermedi?",
  "field_stops_label_en": "Any intermediate stops?",
  "field_stops_detail_label_it": "Indica le tappe o gli scali desiderati",
  "field_stops_detail_label_en": "Which stops would you like?",
  "field_stops_detail_placeholder_it": "Esempio: scalo a Nizza all'andata",
  "field_stops_detail_placeholder_en": "Example: stop in Nice on the way out",
  "field_luggage_label_it": "Bagagli",
  "field_luggage_label_en": "Luggage",
  "field_luggage_placeholder_it": "Quanti e specifica peso",
  "field_luggage_placeholder_en": "How many, and their approximate weight",
  "field_budget_label_it": "Budget indicativo",
  "field_budget_label_en": "Approximate budget",
  "field_budget_placeholder_it": "Esempio: 8.000 - 10.000 EUR",
  "field_budget_placeholder_en": "Example: EUR 8,000 - 10,000",
  "field_budget_hint_it": "",
  "field_budget_hint_en": "",
  "field_aircraft_label_it": "Tipologia di aeromobile",
  "field_aircraft_label_en": "Aircraft type",
  "field_aircraft_option_jet_it": "Jet privato",
  "field_aircraft_option_jet_en": "Private jet",
  "field_aircraft_option_helicopter_it": "Elicottero",
  "field_aircraft_option_helicopter_en": "Helicopter",
  "field_aircraft_option_any_it": "Valuta la soluzione migliore per me",
  "field_aircraft_option_any_en": "Recommend the best option for me",
  "field_flexibility_label_it": "Le date e gli orari sono flessibili?",
  "field_flexibility_label_en": "Are your dates and times flexible?",
  "field_flexibility_hint_it": "",
  "field_flexibility_hint_en": "",
  "option_yes_it": "Sì",
  "option_yes_en": "Yes",
  "option_no_it": "No",
  "option_no_en": "No",
  "field_notes_label_it": "Esigenze o richieste particolari (facoltativo)",
  "field_notes_label_en": "Any particular needs or requests (optional)",
  "field_notes_placeholder_it": "Inserisci eventuali necessità, preferenze o servizi aggiuntivi. (opzionale)",
  "field_notes_placeholder_en": "Tell us about any needs, preferences or extra services. (optional)",
  "submit_idle_it": "RICHIEDI IL TUO PREVENTIVO",
  "submit_idle_en": "REQUEST YOUR QUOTE",
  "disclaimer_it": "Ti rispondiamo entro 24 ore ai contatti che ci hai lasciato.",
  "disclaimer_en": "We reply within 24 hours to the contacts you leave us."
}
$json$::jsonb,
  true
)
WHERE id = 'main';
