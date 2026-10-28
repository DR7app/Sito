-- App DR7 (iOS/Android): telefoni registrati per le notifiche push.
--
-- L'app salva qui il token del telefono (vedi pages/app/appPush.ts). Il server
-- legge con la service role key per inviare (netlify/functions/utils/appPush.ts).
-- Un telefono senza accesso ha user_id NULL: riceve solo gli avvisi a tutti.

create table if not exists public.app_push_tokens (
  token        text primary key,
  user_id      uuid references auth.users (id) on delete cascade,
  platform     text not null check (platform in ('ios', 'android', 'web')),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists app_push_tokens_user_idx on public.app_push_tokens (user_id);

alter table public.app_push_tokens enable row level security;

-- Il telefono non scrive direttamente nella tabella: passa da questa funzione,
-- che lega il token al cliente con l'accesso fatto (auth.uid()) o lo lascia
-- anonimo. Cosi' nessuno puo' agganciare il proprio token a un altro cliente.
create or replace function public.app_register_push(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_token is null or length(p_token) < 20 or length(p_token) > 4096 then
    raise exception 'token non valido';
  end if;
  if p_platform not in ('ios', 'android', 'web') then
    raise exception 'piattaforma non valida';
  end if;
  insert into public.app_push_tokens (token, user_id, platform, last_seen_at)
  values (p_token, auth.uid(), p_platform, now())
  on conflict (token) do update
    set user_id = auth.uid(), platform = excluded.platform, last_seen_at = now();
end;
$$;

revoke all on function public.app_register_push(text, text) from public;
grant execute on function public.app_register_push(text, text) to anon, authenticated;

-- Il cliente vede e cancella solo i propri telefoni.
drop policy if exists "app_push_select_own" on public.app_push_tokens;
create policy "app_push_select_own" on public.app_push_tokens
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "app_push_delete_own" on public.app_push_tokens;
create policy "app_push_delete_own" on public.app_push_tokens
  for delete to authenticated
  using (user_id = auth.uid());

-- Registro degli invii, per il gestionale.
create table if not exists public.app_push_log (
  id          bigint generated always as identity primary key,
  sent_at     timestamptz not null default now(),
  audience    text not null,           -- 'all' oppure 'users'
  user_ids    uuid[],
  title       text not null,
  body        text not null,
  url         text,
  sent        integer not null default 0,
  failed      integer not null default 0
);
alter table public.app_push_log enable row level security;
-- Nessuna policy: lo leggono solo service role e gestionale.
