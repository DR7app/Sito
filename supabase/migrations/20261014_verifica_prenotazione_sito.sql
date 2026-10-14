-- 14/10/2026: una prenotazione dal sito esiste SOLO se pagata (Nexi o
-- Credit Wallet). Prima il noleggio scriveva la riga in `bookings` prima del
-- pagamento: il cliente che abbandonava lasciava una prenotazione "da pagare"
-- per un'ora, con Lavaggio Rientro e cauzione creati dai trigger (Roberto
-- Piras, due Huracan, 14/10).
--
-- Ora la riga nasce solo in nexi-callback a pagamento riuscito. Ma i controlli
-- del database (prenotazioni sospese, promozione valida, veicolo gia'
-- occupato) devono dire di no PRIMA che il cliente paghi: questa funzione
-- prova l'INSERT in una sottotransazione e la annulla sempre. Nessun trigger
-- lascia traccia. Ritorna NULL se la prenotazione passerebbe, altrimenti il
-- messaggio di errore del database.
--
-- SECURITY INVOKER: stesse regole RLS dell'INSERT che faceva il sito.

create or replace function public.verifica_prenotazione_sito(p_booking jsonb)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  colonne text;
begin
  -- Solo le chiavi che sono colonne vere: le altre restano al default.
  select string_agg(quote_ident(c.column_name), ', ')
    into colonne
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = 'bookings'
     and p_booking ? c.column_name;

  if colonne is null then
    return 'Prenotazione vuota';
  end if;

  begin
    execute format(
      'insert into public.bookings (%s) select %s from jsonb_populate_record(null::public.bookings, $1)',
      colonne, colonne
    ) using p_booking;
    raise exception using errcode = 'P0099', message = 'DR7_VERIFICA_OK';
  exception when others then
    if sqlstate = 'P0099' then
      return null;
    end if;
    return sqlerrm;
  end;
end;
$$;

grant execute on function public.verifica_prenotazione_sito(jsonb) to anon, authenticated;
