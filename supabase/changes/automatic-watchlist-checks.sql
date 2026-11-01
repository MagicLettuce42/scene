create table public.scene_watchlist_snapshots(
 user_id uuid not null references public.scene_members(user_id) on delete cascade,
 title_key text not null check(length(title_key) between 1 and 150),hint jsonb not null,
 title jsonb,checked_at timestamptz,attempted_at timestamptz,lease_until timestamptz,
 failures integer not null default 0,last_error boolean not null default false,
 primary key(user_id,title_key)
);
alter table public.scene_watchlist_snapshots enable row level security;
revoke all on public.scene_watchlist_snapshots from public,anon,authenticated;
grant select on public.scene_watchlist_snapshots to authenticated;
grant all on public.scene_watchlist_snapshots to service_role;
create policy own_watchlist_snapshots on public.scene_watchlist_snapshots for select to authenticated using(user_id=(select auth.uid()) and (select scene_private.session_allowed()));
create index scene_watchlist_due on public.scene_watchlist_snapshots(checked_at,attempted_at);
create table scene_private.watchlist_worker_status(id integer primary key check(id=1),last_run_at timestamptz,checked integer not null default 0,failed integer not null default 0);
insert into scene_private.watchlist_worker_status(id) values(1);
alter table scene_private.watchlist_worker_status enable row level security;
create policy no_client_watchlist_worker on scene_private.watchlist_worker_status for all to anon,authenticated using(false) with check(false);
create function scene_private.catalogue_title_key(t jsonb) returns text language sql immutable set search_path='' as $$
 select case when t->>'tmdbId' ~ '^[1-9][0-9]{0,12}$' then 'tmdb-'||(t->>'kind')||'-'||(t->>'tmdbId') when t->>'imdbId' ~ '^tt[0-9]+$' then 'imdb-'||(t->>'imdbId') else t->>'id' end;
$$;
revoke all on function scene_private.catalogue_title_key(jsonb) from public,anon,authenticated;
create function public.scene_watchlist_worker_config() returns jsonb language sql security definer set search_path='' as $$select jsonb_object_agg(name,decrypted_secret) from vault.decrypted_secrets where name in ('scene_watchlist_worker_secret','scene_watchlist_tmdb_key');$$;
create function public.scene_configure_watchlist_worker(p_api_key text) returns void language plpgsql security definer set search_path='' as $$declare secret_id uuid;begin
 if length(p_api_key)<20 or length(p_api_key)>500 then raise exception 'Invalid catalogue configuration';end if;
 select id into secret_id from vault.secrets where name='scene_watchlist_tmdb_key';
 if secret_id is null then perform vault.create_secret(p_api_key,'scene_watchlist_tmdb_key');else perform vault.update_secret(secret_id,p_api_key);end if;
end$$;
create function public.scene_claim_watchlist_checks() returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb;begin
 insert into public.scene_watchlist_snapshots(user_id,title_key,hint)
 select l.user_id,scene_private.catalogue_title_key(e.value->'title'),jsonb_strip_nulls(jsonb_build_object('id',e.value->'title'->'id','name',e.value->'title'->'name','kind',e.value->'title'->'kind','year',e.value->'title'->'year','tmdbId',e.value->'title'->'tmdbId','imdbId',e.value->'title'->'imdbId'))
 from public.scene_libraries l join public.scene_members m on m.user_id=l.user_id and m.active cross join lateral jsonb_each(coalesce(l.payload->'entries','{}')) e
 where e.value->>'saved'='true' and coalesce(l.payload->'preferences'->>'autoAvailability','true')<>'false' and e.value->'title'->>'kind' in ('movie','series') and scene_private.catalogue_title_key(e.value->'title') is not null
 on conflict(user_id,title_key) do update set hint=excluded.hint;
 -- Removed titles and opted-out accounts are not retained in the background queue.
 delete from public.scene_watchlist_snapshots s where not exists(select 1 from public.scene_libraries l join public.scene_members m on m.user_id=l.user_id and m.active cross join lateral jsonb_each(coalesce(l.payload->'entries','{}')) e where l.user_id=s.user_id and coalesce(l.payload->'preferences'->>'autoAvailability','true')<>'false' and e.value->>'saved'='true' and scene_private.catalogue_title_key(e.value->'title')=s.title_key);
 with candidates as(select user_id,title_key from public.scene_watchlist_snapshots where (checked_at is null or checked_at<now()-interval '21 hours') and (lease_until is null or lease_until<now()) and (attempted_at is null or attempted_at<now()-case when failures>=3 then interval '12 hours' else interval '1 hour' end) order by checked_at nulls first,attempted_at nulls first limit 24 for update skip locked),
 claimed as(update public.scene_watchlist_snapshots s set attempted_at=now(),lease_until=now()+interval '10 minutes' from candidates c where c.user_id=s.user_id and c.title_key=s.title_key returning s.user_id,s.title_key,s.hint,s.attempted_at)
 select coalesce(jsonb_agg(to_jsonb(claimed)),'[]') into result from claimed;return result;
end$$;
create function public.scene_finish_watchlist_check(p_user uuid,p_key text,p_attempt timestamptz,p_title jsonb default null) returns void language plpgsql security definer set search_path='' as $$begin
 if p_title is not null and (p_title->>'live'<>'true' or p_title->>'dataSource'<>'tmdb' or jsonb_typeof(p_title->'offers')<>'array' or jsonb_typeof(p_title->'name')<>'string') then raise exception 'Invalid catalogue snapshot';end if;
 update public.scene_watchlist_snapshots s set title=coalesce(p_title,s.title),checked_at=case when p_title is not null then now() else s.checked_at end,lease_until=null,failures=case when p_title is null then s.failures+1 else 0 end,last_error=p_title is null
 where s.user_id=p_user and s.title_key=p_key and s.attempted_at=p_attempt and exists(select 1 from public.scene_members m join public.scene_libraries l on l.user_id=m.user_id cross join lateral jsonb_each(coalesce(l.payload->'entries','{}')) e where m.user_id=p_user and m.active and coalesce(l.payload->'preferences'->>'autoAvailability','true')<>'false' and e.value->>'saved'='true' and scene_private.catalogue_title_key(e.value->'title')=p_key);
end$$;
create function public.scene_watchlist_worker_heartbeat(p_checked integer,p_failed integer) returns void language sql security definer set search_path='' as $$update scene_private.watchlist_worker_status set last_run_at=now(),checked=p_checked,failed=p_failed where id=1;$$;
revoke all on function public.scene_watchlist_worker_config(),public.scene_configure_watchlist_worker(text),public.scene_claim_watchlist_checks(),public.scene_finish_watchlist_check(uuid,text,timestamptz,jsonb),public.scene_watchlist_worker_heartbeat(integer,integer) from public,anon,authenticated;
grant execute on function public.scene_watchlist_worker_config(),public.scene_configure_watchlist_worker(text),public.scene_claim_watchlist_checks(),public.scene_finish_watchlist_check(uuid,text,timestamptz,jsonb),public.scene_watchlist_worker_heartbeat(integer,integer) to service_role;
create function scene_private.invoke_watchlist_worker() returns bigint language plpgsql security definer set search_path='' as $$declare secret text;request_id bigint;begin
 select decrypted_secret into secret from vault.decrypted_secrets where name='scene_watchlist_worker_secret';if secret is null then raise exception 'Worker not configured';end if;
 select net.http_post(url:='https://cqgauurbkmdbxckjdals.supabase.co/functions/v1/scene-watchlist-refresh',headers:=jsonb_build_object('Content-Type','application/json','x-scene-worker',secret),body:='{}'::jsonb,timeout_milliseconds:=60000) into request_id;return request_id;
end$$;
revoke all on function scene_private.invoke_watchlist_worker() from public,anon,authenticated;
-- Hourly polling refreshes each saved title at most once every 21 hours and retries failures with backoff.
select cron.schedule('scene-watchlist-refresh','25 * * * *','select scene_private.invoke_watchlist_worker();');
