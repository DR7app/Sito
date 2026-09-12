-- Carrello del sito (12/09/2026)
--
-- Prima di oggi ogni servizio aveva il suo tunnel: il lavaggio aveva un
-- carrello suo (tenuto solo nel browser), il noleggio finiva dritto sul
-- pagamento, la meccanica e i tour pure. Non si poteva comprare un lavaggio
-- e un noleggio nello stesso ordine.
--
-- Due tabelle:
--   carrello_articoli  — il carrello del cliente, legato all'account, cosi'
--                        lo ritrova dal telefono dopo averlo riempito dal
--                        computer. Chi non ha l'accesso tiene il carrello
--                        nel browser e lo versa qui appena entra.
--   ordini_carrello    — l'ordine unico mandato a Nexi. Ogni articolo ha il
--                        suo ordine "figlio": e' con quello che nascono la
--                        prenotazione, la ricarica o l'iscrizione, cosi' il
--                        resto del sistema (nexi-callback, gestionale,
--                        fatture) continua a ragionare su un ordine per
--                        servizio come ha sempre fatto.

create table if not exists public.carrello_articoli (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('noleggio','lavaggio','meccanica','tour','club','membership','wallet')),
  titolo text not null,
  sottotitolo text,
  immagine text,
  prezzo_cents integer not null default 0 check (prezzo_cents >= 0),
  dati jsonb not null default '{}'::jsonb,
  creato_il timestamptz not null default now(),
  aggiornato_il timestamptz not null default now()
);

create index if not exists carrello_articoli_user_idx on public.carrello_articoli (user_id, creato_il);

alter table public.carrello_articoli enable row level security;

drop policy if exists carrello_articoli_proprio on public.carrello_articoli;
create policy carrello_articoli_proprio on public.carrello_articoli
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.ordini_carrello (
  id uuid primary key default gen_random_uuid(),
  nexi_order_id text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  totale_cents integer not null default 0,
  metodo text not null default 'nexi',
  -- [{ ordine, tipo, titolo, prezzo_cents }] — l'ordine figlio di ogni articolo.
  articoli jsonb not null default '[]'::jsonb,
  stato text not null default 'in_attesa' check (stato in ('in_attesa','pagato','fallito')),
  creato_il timestamptz not null default now(),
  aggiornato_il timestamptz not null default now()
);

create index if not exists ordini_carrello_order_idx on public.ordini_carrello (nexi_order_id);

alter table public.ordini_carrello enable row level security;

-- Il cliente scrive il suo ordine al checkout e lo rilegge sulla pagina di
-- esito. A marcarlo pagato e' il callback di Nexi, che gira con la chiave di
-- servizio e non passa da queste regole.
drop policy if exists ordini_carrello_proprio_lettura on public.ordini_carrello;
create policy ordini_carrello_proprio_lettura on public.ordini_carrello
  for select
  using (auth.uid() = user_id);

drop policy if exists ordini_carrello_proprio_scrittura on public.ordini_carrello;
create policy ordini_carrello_proprio_scrittura on public.ordini_carrello
  for insert
  with check (auth.uid() = user_id);

drop policy if exists ordini_carrello_proprio_aggiornamento on public.ordini_carrello;
create policy ordini_carrello_proprio_aggiornamento on public.ordini_carrello
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
