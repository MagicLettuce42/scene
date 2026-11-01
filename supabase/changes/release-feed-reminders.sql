create table public.scene_releases (
 id text primary key check(id ~ '^[a-z0-9-]{1,80}$'), title text not null check(length(title) between 1 and 250),
 kind text not null check(kind in ('movie','series')), original_year integer, release_date date not null,
 service_key text not null check(service_key in ('netflix','prime','disney','apple','bbc','now','itv','channel4','paramount','sky','max')),
 label text not null check(length(label) between 1 and 60), source_url text not null check(source_url ~ '^https://[^/@ ]+/' and length(source_url)<2000),
 verified_on date not null, active boolean not null default true, tmdb_id bigint check(tmdb_id>0), imdb_id text check(imdb_id ~ '^tt[0-9]+$'),
 poster_url text check(poster_url ~ '^https://image.tmdb.org/t/p/(w500|original)/[a-zA-Z0-9._-]+$'), event_type text, updated_at timestamptz not null default now()
);
create index scene_releases_date on public.scene_releases(release_date) where active;
create table public.scene_release_status(id integer primary key check(id=1),reviewed_at timestamptz not null default now(),coverage_note text not null default 'Selected official UK announcements. Dates can change.',public_vapid_key text);
insert into public.scene_release_status(id) values(1);
create table public.scene_release_reminders(user_id uuid references public.scene_members(user_id) on delete cascade,release_id text references public.scene_releases(id) on delete cascade,created_at timestamptz not null default now(),primary key(user_id,release_id));
create index scene_reminders_release on public.scene_release_reminders(release_id);
create table public.scene_push_subscriptions(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.scene_members(user_id) on delete cascade,endpoint text not null check(length(endpoint)<2048 and endpoint ~ '^https://(fcm.googleapis.com|([a-z0-9-]+\.)?push.services.mozilla.com|([a-z0-9-]+\.)?push.apple.com)/[^?#]+$'),p256dh text not null check(p256dh ~ '^[A-Za-z0-9_-]{87}$'),auth text not null check(auth ~ '^[A-Za-z0-9_-]{22}$'),created_at timestamptz not null default now(),unique(user_id,endpoint));
create table scene_private.push_deliveries(subscription_id uuid references public.scene_push_subscriptions(id) on delete cascade,release_id text references public.scene_releases(id) on delete cascade,release_date date not null,attempts integer not null default 0,claimed_at timestamptz,delivered_at timestamptz,last_status integer,primary key(subscription_id,release_id,release_date));
create table scene_private.release_worker_status(id integer primary key check(id=1),last_run_at timestamptz,sent integer not null default 0,failed integer not null default 0);
insert into scene_private.release_worker_status(id) values(1);
alter table public.scene_releases enable row level security;
alter table public.scene_release_status enable row level security;
alter table public.scene_release_reminders enable row level security;
alter table public.scene_push_subscriptions enable row level security;
alter table scene_private.push_deliveries enable row level security;
alter table scene_private.release_worker_status enable row level security;
revoke all on public.scene_releases,public.scene_release_status,public.scene_release_reminders,public.scene_push_subscriptions from public,anon,authenticated;
grant select on public.scene_releases,public.scene_release_status,public.scene_release_reminders,public.scene_push_subscriptions to authenticated;
grant all on public.scene_releases,public.scene_release_status,public.scene_release_reminders,public.scene_push_subscriptions to service_role;
create policy release_member_read on public.scene_releases for select to authenticated using ((select scene_private.session_allowed()));
create policy release_status_read on public.scene_release_status for select to authenticated using ((select scene_private.session_allowed()));
create policy own_reminders on public.scene_release_reminders for select to authenticated using (user_id=(select auth.uid()) and (select scene_private.session_allowed()));
create policy own_push on public.scene_push_subscriptions for select to authenticated using (user_id=(select auth.uid()) and (select scene_private.session_allowed()));
create or replace function public.scene_reminder_action(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();rid text:=p_data->>'releaseId';ep text:=p_data->>'endpoint';
begin
 if uid is null or not scene_private.session_allowed() then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,9142));
 if p_action='follow' then
  if not exists(select 1 from public.scene_releases where id=rid and active and release_date>=(now() at time zone 'Europe/London')::date) then raise exception 'Release is no longer upcoming';end if;
  if (select count(*) from public.scene_release_reminders where user_id=uid)>=300 and not exists(select 1 from public.scene_release_reminders where user_id=uid and release_id=rid) then raise exception 'Reminder limit reached';end if;
  insert into public.scene_release_reminders(user_id,release_id) values(uid,rid) on conflict do nothing;
 elsif p_action='unfollow' then delete from public.scene_release_reminders where user_id=uid and release_id=rid;
 elsif p_action='subscribe' then
  if (select count(*) from public.scene_push_subscriptions where user_id=uid)>=10 and not exists(select 1 from public.scene_push_subscriptions where user_id=uid and endpoint=ep) then raise exception 'Device limit reached';end if;
  insert into public.scene_push_subscriptions(user_id,endpoint,p256dh,auth) values(uid,ep,p_data->>'p256dh',p_data->>'auth') on conflict(user_id,endpoint) do update set p256dh=excluded.p256dh,auth=excluded.auth;
 elsif p_action='unsubscribe' then delete from public.scene_push_subscriptions where user_id=uid and endpoint=ep;
 else raise exception 'Invalid reminder action';end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.scene_reminder_action(text,jsonb) from public,anon;
grant execute on function public.scene_reminder_action(text,jsonb) to authenticated;
create or replace function public.scene_release_worker_config() returns jsonb language sql security definer set search_path='' as $$
 select jsonb_object_agg(name,decrypted_secret) from vault.decrypted_secrets where name in ('scene_push_worker_secret','scene_push_vapid_public','scene_push_vapid_private');
$$;
revoke all on function public.scene_release_worker_config() from public,anon,authenticated;
grant execute on function public.scene_release_worker_config() to service_role;
create or replace function public.scene_claim_release_pushes() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 if (now() at time zone 'Europe/London')::time < time '09:00' then return '[]'::jsonb;end if;
 insert into scene_private.push_deliveries(subscription_id,release_id,release_date)
 select s.id,r.id,r.release_date from public.scene_releases r join public.scene_release_reminders m on m.release_id=r.id join public.scene_members u on u.user_id=m.user_id and u.active join public.scene_push_subscriptions s on s.user_id=m.user_id
 where r.active and r.release_date=(now() at time zone 'Europe/London')::date and r.verified_on>=current_date-14 on conflict do nothing;
 with candidates as (select d.subscription_id,d.release_id,d.release_date from scene_private.push_deliveries d
 join public.scene_push_subscriptions s on s.id=d.subscription_id join public.scene_members u on u.user_id=s.user_id and u.active join public.scene_release_reminders m on m.user_id=s.user_id and m.release_id=d.release_id join public.scene_releases r on r.id=d.release_id and r.active and r.release_date=d.release_date
 where d.release_date=(now() at time zone 'Europe/London')::date and r.verified_on>=current_date-14 and d.delivered_at is null and d.attempts<3 and (d.claimed_at is null or d.claimed_at<now()-interval '20 minutes') order by d.subscription_id limit 100 for update of d skip locked),
 claimed as(update scene_private.push_deliveries d set attempts=d.attempts+1,claimed_at=now() from candidates c where d.subscription_id=c.subscription_id and d.release_id=c.release_id and d.release_date=c.release_date returning d.*)
 select coalesce(jsonb_agg(jsonb_build_object('subscriptionId',s.id,'userId',s.user_id,'releaseId',d.release_id,'date',d.release_date,'endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth))),'[]') into result from claimed d join public.scene_push_subscriptions s on s.id=d.subscription_id;
 return result;
end $$;
create or replace function public.scene_finish_release_push(p_subscription uuid,p_release text,p_date date,p_status integer) returns void language plpgsql security definer set search_path='' as $$begin
 update scene_private.push_deliveries set delivered_at=case when p_status between 200 and 299 then now() else null end,last_status=p_status where subscription_id=p_subscription and release_id=p_release and release_date=p_date;
 if p_status in (404,410) then delete from public.scene_push_subscriptions where id=p_subscription;end if;
end $$;
create or replace function public.scene_release_worker_heartbeat(p_sent integer,p_failed integer) returns void language sql security definer set search_path='' as $$update scene_private.release_worker_status set last_run_at=now(),sent=p_sent,failed=p_failed where id=1;$$;
revoke all on function public.scene_claim_release_pushes(),public.scene_finish_release_push(uuid,text,date,integer),public.scene_release_worker_heartbeat(integer,integer) from public,anon,authenticated;
grant execute on function public.scene_claim_release_pushes(),public.scene_finish_release_push(uuid,text,date,integer),public.scene_release_worker_heartbeat(integer,integer) to service_role;
