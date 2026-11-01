create table scene_private.release_edits(id bigint generated always as identity primary key,actor uuid references public.scene_members(user_id) on delete set null,record_kind text not null,record_id text not null,before_record jsonb,after_record jsonb not null,changed_at timestamptz not null default now());
create index release_edits_actor on scene_private.release_edits(actor);
alter table scene_private.release_edits enable row level security;
revoke all on scene_private.release_edits from public,anon,authenticated;
create policy no_client_release_edits on scene_private.release_edits to anon,authenticated using(false) with check(false);
create function scene_private.release_modified() returns trigger language plpgsql set search_path='' as $$begin new.updated_at:=clock_timestamp();return new;end$$;
revoke all on function scene_private.release_modified() from public,anon,authenticated;
create trigger release_modified before update on public.scene_releases for each row execute function scene_private.release_modified();
create trigger departure_modified before update on public.scene_departures for each row execute function scene_private.release_modified();
create function scene_private.require_release_owner() returns void language plpgsql stable security definer set search_path='' as $$begin
 if not coalesce((scene_private.security_state()->>'adminReady')::boolean,false) then raise insufficient_privilege using message='Verify your owner security code to manage releases';end if;
end$$;
revoke all on function scene_private.require_release_owner() from public,anon,authenticated;
create function scene_private.manage_releases(p_action text,p_kind text default null,p_record jsonb default null,p_expected timestamptz default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare before_row jsonb;after_row jsonb;rid text;source text;host text;r public.scene_releases%rowtype;d public.scene_departures%rowtype;today date:=(now() at time zone 'Europe/London')::date;
begin
 perform scene_private.require_release_owner();
 if p_action='list' then return jsonb_build_object(
  'releases',(select coalesce(jsonb_agg(to_jsonb(x) order by x.release_date desc),'[]') from (select * from public.scene_releases order by release_date desc limit 1000)x),
  'departures',(select coalesce(jsonb_agg(to_jsonb(x) order by x.last_available_date desc),'[]') from (select * from public.scene_departures order by last_available_date desc limit 1000)x),
  'status',(select jsonb_build_object('reviewed_at',reviewed_at,'coverage_note',coverage_note,'departure_reviewed_at',departure_reviewed_at,'departure_coverage_note',departure_coverage_note) from public.scene_release_status where id=1),
  'watchlist',(select to_jsonb(w) from scene_private.watchlist_worker_status w where id=1),
  'notifications',(select to_jsonb(w) from scene_private.release_worker_status w where id=1),
  'edits',(select coalesce(jsonb_agg(to_jsonb(x) order by x.changed_at desc),'[]') from (select record_kind,record_id,changed_at,after_record->>'title' as title from scene_private.release_edits order by changed_at desc limit 10)x)
 );end if;
 if p_action<>'save' or p_kind is null or p_kind not in ('release','departure') or jsonb_typeof(p_record) is distinct from 'object' or octet_length(p_record::text)>8000 then raise exception 'Invalid release change';end if;
 rid:=p_record->>'id';source:=p_record->>'source_url';host:=lower(substring(source from '^https://([^/]+)'));
 if rid is null or rid!~'^[a-z0-9-]{1,80}$' or source is null or source!~'^https://[^/@ :?#]+/[^[:space:]]*$' or length(source)>1999 or host!~'(^|\.)(apple\.com|netflix\.com|aboutamazon\.co\.uk|amazon\.co\.uk|disney\.co\.uk|disneyplus\.com|bbc\.co\.uk|bbc\.com|sky\.com|skygroup\.sky|nowtv\.com|itv\.com|channel4\.com|paramountplus\.com|paramount\.com|hbomax\.com|max\.com|wbd\.com)$' then raise exception 'Use a valid ID and an official provider source link';end if;
 if jsonb_typeof(p_record->'active') is distinct from 'boolean' or p_record->>'verified_on' is null or (p_record->>'verified_on')::date>today or (p_record->>'verified_on')::date<date '2000-01-01' or (p_record->>'original_year')::integer not between 1888 and 2200 then raise exception 'Check the year and evidence review date';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_kind||':'||rid,9216));
 if p_kind='release' then
  select to_jsonb(x) into before_row from public.scene_releases x where id=rid for update;
 else select to_jsonb(x) into before_row from public.scene_departures x where id=rid for update;end if;
 if (before_row is not null and (p_expected is null or (before_row->>'updated_at')::timestamptz<>p_expected)) or (before_row is null and p_expected is not null) then raise exception using errcode='40001',message='This record changed. Reload it before saving.';end if;
 if p_kind='release' then
  r:=jsonb_populate_record(null::public.scene_releases,p_record);
  if r.release_date not between date '2000-01-01' and today+interval '5 years' then raise exception 'Check the release date';end if;
  insert into public.scene_releases(id,title,kind,original_year,release_date,service_key,label,source_url,verified_on,active,tmdb_id,poster_url,event_type)
   values(r.id,trim(r.title),r.kind,r.original_year,r.release_date,r.service_key,r.label,r.source_url,r.verified_on,r.active,r.tmdb_id,r.poster_url,r.event_type)
  on conflict(id) do update set title=excluded.title,kind=excluded.kind,original_year=excluded.original_year,release_date=excluded.release_date,service_key=excluded.service_key,label=excluded.label,source_url=excluded.source_url,verified_on=excluded.verified_on,active=excluded.active,tmdb_id=excluded.tmdb_id,poster_url=excluded.poster_url,event_type=excluded.event_type,imdb_id=case when scene_releases.title=excluded.title and scene_releases.kind=excluded.kind and scene_releases.original_year is not distinct from excluded.original_year then scene_releases.imdb_id end;
  select to_jsonb(x) into after_row from public.scene_releases x where id=rid;
 else
  d:=jsonb_populate_record(null::public.scene_departures,p_record);
  if d.last_available_date not between date '2000-01-01' and today+interval '5 years' then raise exception 'Check the last available date';end if;
  insert into public.scene_departures(id,title,kind,original_year,last_available_date,service_key,source_url,verified_on,active,tmdb_id,poster_url)
   values(d.id,trim(d.title),d.kind,d.original_year,d.last_available_date,d.service_key,d.source_url,d.verified_on,d.active,d.tmdb_id,d.poster_url)
  on conflict(id) do update set title=excluded.title,kind=excluded.kind,original_year=excluded.original_year,last_available_date=excluded.last_available_date,service_key=excluded.service_key,source_url=excluded.source_url,verified_on=excluded.verified_on,active=excluded.active,tmdb_id=excluded.tmdb_id,poster_url=excluded.poster_url,imdb_id=case when scene_departures.title=excluded.title and scene_departures.kind=excluded.kind and scene_departures.original_year is not distinct from excluded.original_year then scene_departures.imdb_id end;
  select to_jsonb(x) into after_row from public.scene_departures x where id=rid;
 end if;
 insert into scene_private.release_edits(actor,record_kind,record_id,before_record,after_record) values((select auth.uid()),p_kind,rid,before_row,after_row);
 return after_row;
end$$;
revoke all on function scene_private.manage_releases(text,text,jsonb,timestamptz) from public,anon;
grant execute on function scene_private.manage_releases(text,text,jsonb,timestamptz) to authenticated;
create function public.scene_manage_releases(p_action text,p_kind text default null,p_record jsonb default null,p_expected timestamptz default null) returns jsonb language sql security invoker set search_path='' as $$select scene_private.manage_releases(p_action,p_kind,p_record,p_expected);$$;
revoke all on function public.scene_manage_releases(text,text,jsonb,timestamptz) from public,anon;
grant execute on function public.scene_manage_releases(text,text,jsonb,timestamptz) to authenticated;
