create table public.scene_notification_preferences(user_id uuid primary key references public.scene_members(user_id) on delete cascade,availability_enabled boolean not null default false,enabled_at timestamptz,updated_at timestamptz not null default now());
create table public.scene_availability_events(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.scene_members(user_id) on delete cascade,title_key text not null,service_key text not null,title jsonb not null,detected_at timestamptz not null default now(),dismissed boolean not null default false);
create index scene_availability_events_owner on public.scene_availability_events(user_id,detected_at desc);
create index scene_availability_dedup on public.scene_availability_events(user_id,title_key,service_key,detected_at desc);
alter table public.scene_notification_preferences enable row level security;
alter table public.scene_availability_events enable row level security;
revoke all on public.scene_notification_preferences,public.scene_availability_events from public,anon,authenticated;
grant select on public.scene_notification_preferences,public.scene_availability_events to authenticated;
grant all on public.scene_notification_preferences,public.scene_availability_events to service_role;
create policy own_notification_preferences on public.scene_notification_preferences for select to authenticated using(user_id=(select auth.uid()) and (select scene_private.session_allowed()));
create policy own_availability_events on public.scene_availability_events for select to authenticated using(user_id=(select auth.uid()) and (select scene_private.session_allowed()));
alter table public.scene_watchlist_snapshots add column selected_services text[] not null default '{}';
create table scene_private.availability_push_deliveries(subscription_id uuid references public.scene_push_subscriptions(id) on delete cascade,event_id uuid references public.scene_availability_events(id) on delete cascade,attempts integer not null default 0,claimed_at timestamptz,delivered_at timestamptz,last_status integer,primary key(subscription_id,event_id));
create index availability_push_event on scene_private.availability_push_deliveries(event_id);
alter table scene_private.availability_push_deliveries enable row level security;
revoke all on scene_private.availability_push_deliveries from public,anon,authenticated;
create policy no_client_availability_delivery on scene_private.availability_push_deliveries to anon,authenticated using(false) with check(false);
create function scene_private.availability_alert_action(p_action text,p_data jsonb) returns void language plpgsql security definer set search_path='' as $$declare uid uuid:=(select auth.uid());begin
 if uid is null or not scene_private.session_allowed() then raise insufficient_privilege;end if;
 if p_action='preference' and jsonb_typeof(p_data->'enabled')='boolean' then
  insert into public.scene_notification_preferences(user_id,availability_enabled,enabled_at) values(uid,(p_data->>'enabled')::boolean,case when (p_data->>'enabled')::boolean then now() end)
  on conflict(user_id) do update set availability_enabled=excluded.availability_enabled,enabled_at=case when excluded.availability_enabled and not scene_notification_preferences.availability_enabled then now() else scene_notification_preferences.enabled_at end,updated_at=now();
 elsif p_action='dismiss' then update public.scene_availability_events set dismissed=true where user_id=uid and id=(p_data->>'id')::uuid;
 else raise exception 'Invalid notification action';end if;
end$$;
revoke all on function scene_private.availability_alert_action(text,jsonb) from public,anon;
grant execute on function scene_private.availability_alert_action(text,jsonb) to authenticated;
create function public.scene_availability_alert_action(p_action text,p_data jsonb) returns void language sql security invoker set search_path='' as $$select scene_private.availability_alert_action(p_action,p_data);$$;
revoke all on function public.scene_availability_alert_action(text,jsonb) from public,anon;
grant execute on function public.scene_availability_alert_action(text,jsonb) to authenticated;
-- The authenticated worker supplies a claim token, never private activity fields.
create or replace function public.scene_finish_watchlist_check(p_user uuid,p_key text,p_attempt timestamptz,p_title jsonb default null) returns void language plpgsql security definer set search_path='' as $$
declare old public.scene_watchlist_snapshots%rowtype;pref public.scene_notification_preferences%rowtype;selected text[];provider text;begin
 if p_title is not null and (p_title->>'live' is distinct from 'true' or p_title->>'dataSource' is distinct from 'tmdb' or jsonb_typeof(p_title->'offers') is distinct from 'array' or jsonb_typeof(p_title->'name') is distinct from 'string') then raise exception 'Invalid catalogue snapshot';end if;
 select * into old from public.scene_watchlist_snapshots where user_id=p_user and title_key=p_key and attempted_at=p_attempt for update;if not found then return;end if;
 if not exists(select 1 from public.scene_members m join public.scene_libraries l on l.user_id=m.user_id cross join lateral jsonb_each(case when jsonb_typeof(l.payload->'entries')='object' then l.payload->'entries' else '{}'::jsonb end) e where m.user_id=p_user and m.active and coalesce(l.payload->'preferences'->>'autoAvailability','true')<>'false' and e.value->>'saved'='true' and scene_private.catalogue_title_key(e.value->'title')=p_key) then return;end if;
 select coalesce(array_agg(s.key),'{}') into selected from public.scene_libraries l cross join lateral jsonb_each(case when jsonb_typeof(l.payload->'services')='object' then l.payload->'services' else '{}'::jsonb end) s where l.user_id=p_user and s.value='true';
 select * into pref from public.scene_notification_preferences where user_id=p_user;
 -- First check after opting in establishes a baseline. A newly selected service also needs a baseline.
 if p_title is not null and pref.availability_enabled and old.checked_at>=pref.enabled_at and old.checked_at>now()-interval '3 days' then
  for provider in select distinct o->>'key' from jsonb_array_elements(p_title->'offers') o where o->>'type' in ('sub','free') and o->>'key'=any(selected) and o->>'key'=any(old.selected_services)
   and not exists(select 1 from jsonb_array_elements(coalesce(old.title->'offers','[]')) prev where prev->>'key'=o->>'key' and prev->>'type' in ('sub','free')) loop
   if not exists(select 1 from public.scene_availability_events where user_id=p_user and title_key=p_key and service_key=provider and detected_at>now()-interval '30 days') then
    insert into public.scene_availability_events(user_id,title_key,service_key,title) values(p_user,p_key,provider,p_title);
   end if;
  end loop;
 end if;
 update public.scene_watchlist_snapshots set title=coalesce(p_title,title),checked_at=case when p_title is not null then now() else checked_at end,selected_services=case when p_title is not null then selected else selected_services end,lease_until=null,failures=case when p_title is null then failures+1 else 0 end,last_error=p_title is null where user_id=p_user and title_key=p_key;
end$$;
-- Worker-only helper: rechecks current account consent, saved status, provider selection and current fresh availability.
create function scene_private.availability_event_allowed(p_event uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.scene_availability_events e join public.scene_notification_preferences p on p.user_id=e.user_id and p.availability_enabled join public.scene_members m on m.user_id=e.user_id and m.active join public.scene_libraries l on l.user_id=e.user_id join public.scene_watchlist_snapshots s on s.user_id=e.user_id and s.title_key=e.title_key
 where e.id=p_event and not e.dismissed and e.detected_at>=p.enabled_at and e.detected_at>now()-interval '2 days' and s.checked_at>now()-interval '25 hours' and coalesce(l.payload->'preferences'->>'autoAvailability','true')<>'false' and l.payload->'services'->>e.service_key='true'
 and exists(select 1 from jsonb_array_elements(coalesce(s.title->'offers','[]')) o where o->>'key'=e.service_key and o->>'type' in ('sub','free'))
 and exists(select 1 from jsonb_each(case when jsonb_typeof(l.payload->'entries')='object' then l.payload->'entries' else '{}'::jsonb end) ent where ent.value->>'saved'='true' and scene_private.catalogue_title_key(ent.value->'title')=e.title_key));
$$;
revoke all on function scene_private.availability_event_allowed(uuid) from public,anon,authenticated;
grant execute on function scene_private.availability_event_allowed(uuid) to service_role;
create function scene_private.claim_availability_pushes() returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb;begin
 if (now() at time zone 'Europe/London')::time<time '09:00' or (now() at time zone 'Europe/London')::time>=time '21:00' then return '[]';end if;
 insert into scene_private.availability_push_deliveries(subscription_id,event_id) select s.id,e.id from public.scene_availability_events e join public.scene_push_subscriptions s on s.user_id=e.user_id and s.created_at<=e.detected_at where scene_private.availability_event_allowed(e.id) on conflict do nothing;
 with candidates as(select d.subscription_id,d.event_id from scene_private.availability_push_deliveries d where d.delivered_at is null and d.attempts<3 and (d.claimed_at is null or d.claimed_at<now()-interval '20 minutes') and scene_private.availability_event_allowed(d.event_id) order by d.event_id limit 60 for update skip locked),
 claimed as(update scene_private.availability_push_deliveries d set attempts=d.attempts+1,claimed_at=clock_timestamp() from candidates c where d.subscription_id=c.subscription_id and d.event_id=c.event_id returning d.*)
 select coalesce(jsonb_agg(jsonb_build_object('subscriptionId',s.id,'eventId',d.event_id,'claim',d.claimed_at,'endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth))),'[]') into result from claimed d join public.scene_push_subscriptions s on s.id=d.subscription_id;return result;
end$$;
create function public.scene_claim_availability_pushes() returns jsonb language sql security invoker set search_path='' as $$select scene_private.claim_availability_pushes();$$;
create function scene_private.can_send_availability(p_event uuid,p_subscription uuid,p_claim timestamptz) returns boolean language sql stable security definer set search_path='' as $$select scene_private.availability_event_allowed(p_event) and exists(select 1 from public.scene_push_subscriptions s join public.scene_availability_events e on s.user_id=e.user_id join scene_private.availability_push_deliveries d on d.event_id=e.id and d.subscription_id=s.id where e.id=p_event and s.id=p_subscription and d.claimed_at=p_claim and d.delivered_at is null);$$;
create function public.scene_can_send_availability(p_event uuid,p_subscription uuid,p_claim timestamptz) returns boolean language sql security invoker set search_path='' as $$select scene_private.can_send_availability(p_event,p_subscription,p_claim);$$;
create function scene_private.finish_availability_push(p_event uuid,p_subscription uuid,p_claim timestamptz,p_status integer) returns void language plpgsql security definer set search_path='' as $$begin
 update scene_private.availability_push_deliveries set delivered_at=case when p_status between 200 and 299 then now() else null end,last_status=p_status where event_id=p_event and subscription_id=p_subscription and claimed_at=p_claim;
 if p_status in (404,410) then delete from public.scene_push_subscriptions where id=p_subscription;end if;
end$$;
create function public.scene_finish_availability_push(p_event uuid,p_subscription uuid,p_claim timestamptz,p_status integer) returns void language sql security invoker set search_path='' as $$select scene_private.finish_availability_push(p_event,p_subscription,p_claim,p_status);$$;
revoke all on function scene_private.claim_availability_pushes(),public.scene_claim_availability_pushes(),scene_private.can_send_availability(uuid,uuid,timestamptz),public.scene_can_send_availability(uuid,uuid,timestamptz),scene_private.finish_availability_push(uuid,uuid,timestamptz,integer),public.scene_finish_availability_push(uuid,uuid,timestamptz,integer) from public,anon,authenticated;
grant execute on function scene_private.claim_availability_pushes(),public.scene_claim_availability_pushes(),scene_private.can_send_availability(uuid,uuid,timestamptz),public.scene_can_send_availability(uuid,uuid,timestamptz),scene_private.finish_availability_push(uuid,uuid,timestamptz,integer),public.scene_finish_availability_push(uuid,uuid,timestamptz,integer) to service_role;
