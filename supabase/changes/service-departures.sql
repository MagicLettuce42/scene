create table public.scene_departures(
 id text primary key check(id ~ '^[a-z0-9-]{1,80}$'),title text not null check(length(title) between 1 and 250),kind text not null check(kind in ('movie','series')),original_year integer,
 service_key text not null check(service_key in ('netflix','prime','disney','apple','bbc','now','itv','channel4','paramount','sky','max')),
 last_available_date date not null,source_url text not null check(source_url ~ '^https://[^/@ ]+/' and length(source_url)<2000),verified_on date not null,active boolean not null default true,
 tmdb_id bigint check(tmdb_id>0),imdb_id text check(imdb_id ~ '^tt[0-9]+$'),poster_url text check(poster_url ~ '^https://image.tmdb.org/t/p/(w500|original)/[a-zA-Z0-9._-]+$'),updated_at timestamptz not null default now()
);
comment on column public.scene_departures.last_available_date is 'Last UK calendar date a viewer can watch, explicitly confirmed by the provider; not a first-unavailable or inferred date.';
create index scene_departures_date on public.scene_departures(last_available_date) where active;
alter table public.scene_departures enable row level security;
revoke all on public.scene_departures from public,anon,authenticated;
grant select on public.scene_departures to authenticated;
grant all on public.scene_departures to service_role;
create policy departure_member_read on public.scene_departures for select to authenticated using((select scene_private.session_allowed()));
alter table public.scene_release_status add column departure_reviewed_at timestamptz,add column departure_coverage_note text;
