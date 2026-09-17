-- Allinea luogo di nascita e patente fra le forme usate da sito e gestionale
-- (17/09/2026).
--
-- Il gestionale legge `luogo_nascita`, le colonne della patente e
-- `metadata.patente.*`; il sito scriveva `citta_nascita` e le chiavi piatte
-- `metadata.numero_patente`, `metadata.patente_data_rilascio`, ... Ogni
-- schermata vedeva solo meta' dei dati.
--
-- Riempie SOLO i campi vuoti, copiando da un'altra forma della stessa
-- scheda. Non sovrascrive niente, si puo' rilanciare.
-- Conteggio al 17/09/2026: luogo<-citta 360, citta<-luogo 487, numero 31,
-- rilascio 32, scadenza 31 (colonne); metadata.patente numero 46, rilascio 45.

begin;

update customers_extended
   set luogo_nascita = citta_nascita
 where coalesce(luogo_nascita, '') = '' and coalesce(citta_nascita, '') <> '';

update customers_extended
   set citta_nascita = luogo_nascita
 where coalesce(citta_nascita, '') = '' and coalesce(luogo_nascita, '') <> ''
   and length(luogo_nascita) <= 100;  -- citta_nascita e' varchar(100)

-- Colonne della patente dal metadata (prima la forma annidata, poi la piatta).
update customers_extended
   set numero_patente = upper(coalesce(nullif(metadata->'patente'->>'numero', ''), metadata->>'numero_patente'))
 where coalesce(numero_patente, '') = ''
   and length(coalesce(nullif(metadata->'patente'->>'numero', ''), metadata->>'numero_patente')) <= 50
   and coalesce(nullif(metadata->'patente'->>'numero', ''), nullif(metadata->>'numero_patente', ''), '') <> '';

update customers_extended
   set data_rilascio_patente = left(coalesce(nullif(metadata->'patente'->>'rilascio', ''), metadata->>'patente_data_rilascio'), 10)::date
 where data_rilascio_patente is null
   and coalesce(nullif(metadata->'patente'->>'rilascio', ''), nullif(metadata->>'patente_data_rilascio', ''), '') ~ '^\d{4}-\d{2}-\d{2}';

update customers_extended
   set scadenza_patente = left(coalesce(nullif(metadata->'patente'->>'scadenza', ''), metadata->>'patente_scadenza'), 10)::date
 where scadenza_patente is null
   and coalesce(nullif(metadata->'patente'->>'scadenza', ''), nullif(metadata->>'patente_scadenza', ''), '') ~ '^\d{4}-\d{2}-\d{2}';

update customers_extended
   set tipo_patente = coalesce(nullif(metadata->'patente'->>'tipo', ''), metadata->>'tipo_patente')
 where coalesce(tipo_patente, '') = ''
   and coalesce(nullif(metadata->'patente'->>'tipo', ''), nullif(metadata->>'tipo_patente', ''), '') <> ''
   and length(coalesce(nullif(metadata->'patente'->>'tipo', ''), metadata->>'tipo_patente')) <= 10;  -- varchar(10)

update customers_extended
   set emessa_da = coalesce(nullif(metadata->'patente'->>'ente', ''), metadata->>'patente_emessa_da')
 where coalesce(emessa_da, '') = ''
   and length(coalesce(nullif(metadata->'patente'->>'ente', ''), metadata->>'patente_emessa_da')) <= 255
   and coalesce(nullif(metadata->'patente'->>'ente', ''), nullif(metadata->>'patente_emessa_da', ''), '') <> '';

-- metadata.patente (letta dalla scheda cliente del gestionale) dalle colonne,
-- ormai complete. Solo le chiavi vuote.
update customers_extended c
   set metadata = coalesce(c.metadata, '{}'::jsonb) || jsonb_build_object(
         'patente',
         coalesce(c.metadata->'patente', '{}'::jsonb)
         || jsonb_strip_nulls(jsonb_build_object(
              'numero',   case when coalesce(c.metadata->'patente'->>'numero', '') = ''   then nullif(c.numero_patente, '') end,
              'tipo',     case when coalesce(c.metadata->'patente'->>'tipo', '') = ''     then nullif(c.tipo_patente, '') end,
              'ente',     case when coalesce(c.metadata->'patente'->>'ente', '') = ''     then nullif(c.emessa_da, '') end,
              'rilascio', case when coalesce(c.metadata->'patente'->>'rilascio', '') = '' then c.data_rilascio_patente::text end,
              'scadenza', case when coalesce(c.metadata->'patente'->>'scadenza', '') = '' then c.scadenza_patente::text end
            ))
       )
 where (coalesce(c.metadata->'patente'->>'numero', '') = ''   and coalesce(c.numero_patente, '') <> '')
    or (coalesce(c.metadata->'patente'->>'tipo', '') = ''     and coalesce(c.tipo_patente, '') <> '')
    or (coalesce(c.metadata->'patente'->>'ente', '') = ''     and coalesce(c.emessa_da, '') <> '')
    or (coalesce(c.metadata->'patente'->>'rilascio', '') = '' and c.data_rilascio_patente is not null)
    or (coalesce(c.metadata->'patente'->>'scadenza', '') = '' and c.scadenza_patente is not null);

commit;
