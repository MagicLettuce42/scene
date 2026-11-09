-- Region boundaries for background availability, alerts and UK announcement reminders.
-- Existing permissions and RLS remain in force; no private library fields are exposed.
CREATE OR REPLACE FUNCTION public.scene_claim_watchlist_checks()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare result jsonb;begin
 insert into public.scene_watchlist_snapshots(user_id,title_key,hint)
 select distinct on (l.user_id,scene_private.catalogue_title_key(e.value->'title')) l.user_id,scene_private.catalogue_title_key(e.value->'title'),jsonb_strip_nulls(jsonb_build_object('id',e.value->'title'->'id','name',e.value->'title'->'name','kind',e.value->'title'->'kind','year',e.value->'title'->'year','tmdbId',e.value->'title'->'tmdbId','imdbId',e.value->'title'->'imdbId'))
 from public.scene_libraries l join public.scene_members m on m.user_id=l.user_id and m.active cross join lateral jsonb_each(case when jsonb_typeof(l.payload->'entries')='object' then l.payload->'entries' else '{}'::jsonb end) e
 where e.value->>'saved'='true' and coalesce(l.payload->'preferences'->>'autoAvailability','true')<>'false' and e.value->'title'->>'kind' in ('movie','series') and length(scene_private.catalogue_title_key(e.value->'title')) between 1 and 150 and length(e.value->'title'->>'name') between 1 and 250
 order by l.user_id,scene_private.catalogue_title_key(e.value->'title'),e.key
 on conflict(user_id,title_key) do update set hint=excluded.hint, checked_at=case when coalesce(scene_watchlist_snapshots.title->>'availabilityRegion','GB') is distinct from (select coalesce(l.payload->'preferences'->>'region','GB') from public.scene_libraries l where l.user_id=excluded.user_id) then null else scene_watchlist_snapshots.checked_at end;
 -- Removed titles and opted-out accounts are not retained in the background queue.
 delete from public.scene_watchlist_snapshots s where not exists(select 1 from public.scene_libraries l join public.scene_members m on m.user_id=l.user_id and m.active cross join lateral jsonb_each(case when jsonb_typeof(l.payload->'entries')='object' then l.payload->'entries' else '{}'::jsonb end) e where l.user_id=s.user_id and coalesce(l.payload->'preferences'->>'autoAvailability','true')<>'false' and e.value->>'saved'='true' and scene_private.catalogue_title_key(e.value->'title')=s.title_key);
 with candidates as(select user_id,title_key from public.scene_watchlist_snapshots where (checked_at is null or checked_at<now()-interval '21 hours') and (lease_until is null or lease_until<now()) and (attempted_at is null or attempted_at<now()-case when failures>=3 then interval '12 hours' else interval '1 hour' end) order by checked_at nulls first,attempted_at nulls first limit 24 for update skip locked),
 claimed as(update public.scene_watchlist_snapshots s set attempted_at=now(),lease_until=now()+interval '10 minutes' from candidates c where c.user_id=s.user_id and c.title_key=s.title_key returning s.user_id,s.title_key,s.hint,s.attempted_at)
 select coalesce(jsonb_agg(to_jsonb(claimed)),'[]') into result from claimed;return result;
end$function$;

CREATE OR REPLACE FUNCTION public.scene_finish_watchlist_check(p_user uuid, p_key text, p_attempt timestamp with time zone, p_title jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare old public.scene_watchlist_snapshots%rowtype;pref public.scene_notification_preferences%rowtype;selected text[];provider text;region text;begin
 if p_title is not null and (p_title->>'live' is distinct from 'true' or p_title->>'dataSource' is distinct from 'tmdb' or jsonb_typeof(p_title->'offers') is distinct from 'array' or jsonb_typeof(p_title->'name') is distinct from 'string') then raise exception 'Invalid catalogue snapshot';end if;
 select * into old from public.scene_watchlist_snapshots where user_id=p_user and title_key=p_key and attempted_at=p_attempt for update;if not found then return;end if;
 if not exists(select 1 from public.scene_members m join public.scene_libraries l on l.user_id=m.user_id cross join lateral jsonb_each(case when jsonb_typeof(l.payload->'entries')='object' then l.payload->'entries' else '{}'::jsonb end) e where m.user_id=p_user and m.active and coalesce(l.payload->'preferences'->>'autoAvailability','true')<>'false' and e.value->>'saved'='true' and scene_private.catalogue_title_key(e.value->'title')=p_key) then return;end if;
 select coalesce(array_agg(s.key),'{}') into selected from public.scene_libraries l cross join lateral jsonb_each(case when jsonb_typeof(l.payload->'services')='object' then l.payload->'services' else '{}'::jsonb end) s where l.user_id=p_user and s.value='true';
 select coalesce(l.payload->'preferences'->>'region','GB') into region from public.scene_libraries l where l.user_id=p_user;
 if p_title is not null and coalesce(p_title->>'availabilityRegion','GB') is distinct from region then return;end if;
 select * into pref from public.scene_notification_preferences where user_id=p_user;
 -- First check after opting in establishes a baseline. A newly selected service also needs a baseline.
 if p_title is not null and coalesce(old.title->>'availabilityRegion','GB')=region and pref.availability_enabled and old.checked_at>=pref.enabled_at and old.checked_at>now()-interval '3 days' then
  for provider in select distinct o->>'key' from jsonb_array_elements(p_title->'offers') o where o->>'type' in ('sub','free') and o->>'key'=any(selected) and o->>'key'=any(old.selected_services)
   and not exists(select 1 from jsonb_array_elements(coalesce(old.title->'offers','[]')) prev where prev->>'key'=o->>'key' and prev->>'type' in ('sub','free')) loop
   if not exists(select 1 from public.scene_availability_events where user_id=p_user and title_key=p_key and service_key=provider and coalesce(title->>'availabilityRegion','GB')=region and detected_at>now()-interval '30 days') then
    insert into public.scene_availability_events(user_id,title_key,service_key,title) values(p_user,p_key,provider,p_title);
   end if;
  end loop;
 end if;
 update public.scene_watchlist_snapshots set title=coalesce(p_title,title),checked_at=case when p_title is not null then now() else checked_at end,selected_services=case when p_title is not null then selected else selected_services end,lease_until=null,failures=case when p_title is null then failures+1 else 0 end,last_error=p_title is null where user_id=p_user and title_key=p_key;
end$function$;

CREATE OR REPLACE FUNCTION scene_private.availability_event_allowed(p_event uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.scene_availability_events e join public.scene_notification_preferences p on p.user_id=e.user_id and p.availability_enabled join public.scene_members m on m.user_id=e.user_id and m.active join public.scene_libraries l on l.user_id=e.user_id join public.scene_watchlist_snapshots s on s.user_id=e.user_id and s.title_key=e.title_key
 where coalesce(e.title->>'availabilityRegion','GB')=coalesce(l.payload->'preferences'->>'region','GB') and coalesce(s.title->>'availabilityRegion','GB')=coalesce(l.payload->'preferences'->>'region','GB') and e.id=p_event and not e.dismissed and e.detected_at>=p.enabled_at and e.detected_at>now()-interval '2 days' and s.checked_at>now()-interval '25 hours' and coalesce(l.payload->'preferences'->>'autoAvailability','true')<>'false' and l.payload->'services'->>e.service_key='true'
 and exists(select 1 from jsonb_array_elements(coalesce(s.title->'offers','[]')) o where o->>'key'=e.service_key and o->>'type' in ('sub','free'))
 and exists(select 1 from jsonb_each(case when jsonb_typeof(l.payload->'entries')='object' then l.payload->'entries' else '{}'::jsonb end) ent where ent.value->>'saved'='true' and scene_private.catalogue_title_key(ent.value->'title')=e.title_key));
$function$;

CREATE OR REPLACE FUNCTION scene_private.movie_night_action(p_action text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller uuid:=(select auth.uid()); list uuid; shared text[]; roster jsonb; common jsonb; count_people integer; count_ready integer; region_count integer;
begin
 if caller is null or not scene_private.session_allowed() then raise exception 'Sign in to Scene.' using errcode='42501'; end if;
 if jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>4000 then raise exception 'Invalid request.' using errcode='22023'; end if;
 list:=(p_data->>'listId')::uuid;
 perform 1 from public.scene_lists where id=list and not archived for update;
 if not found or not scene_private.list_access(list) then raise exception 'This list is unavailable.' using errcode='42501'; end if;
 if p_action='share' then
  if jsonb_typeof(p_data->'services')<>'array' or jsonb_array_length(p_data->'services')>15 then raise exception 'Choose valid services.' using errcode='22023'; end if;
  select coalesce(array_agg(distinct s),'{}'::text[]) into shared from jsonb_array_elements_text(p_data->'services') s;
  if exists(select 1 from unnest(shared) s where s not in ('netflix','prime','disney','apple','bbc','now','itv','channel4','paramount','sky','max','hulu','peacock','tubi','pluto')) then raise exception 'Choose valid services.' using errcode='22023'; end if;
  -- Empty choices withdraw consent; they never disclose the user's personal saved services.
  if cardinality(shared)=0 then delete from scene_private.movie_night_choices where list_id=list and user_id=caller;
  else insert into scene_private.movie_night_choices values(list,caller,shared) on conflict(list_id,user_id) do update set services=excluded.services; end if;
 elsif p_action<>'state' then raise exception 'Unknown action.' using errcode='22023'; end if;
 select count(*),count(c.user_id),coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',u.display_name,'services',coalesce(to_jsonb(c.services),'[]'::jsonb)) order by m.joined_at),'[]'::jsonb)
  into count_people,count_ready,roster from public.scene_list_members m join public.scene_members u on u.user_id=m.user_id and u.active
  left join scene_private.movie_night_choices c on c.list_id=m.list_id and c.user_id=m.user_id where m.list_id=list;
 select coalesce(jsonb_agg(service),'[]'::jsonb) into common from
  (select s as service from scene_private.movie_night_choices c join public.scene_members u on u.user_id=c.user_id and u.active
    cross join unnest(c.services) s where c.list_id=list group by s having count(*)=count_people) matches;
 select count(distinct coalesce(l.payload->'preferences'->>'region','GB')) into region_count from public.scene_list_members m join public.scene_members u on u.user_id=m.user_id and u.active left join public.scene_libraries l on l.user_id=m.user_id where m.list_id=list;
 return jsonb_build_object('sameRegion',region_count<=1,'people',roster,'ready',region_count<=1 and count_people>=2 and count_ready=count_people,'commonServices',common);
end;$function$;

CREATE OR REPLACE FUNCTION public.scene_claim_release_pushes()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;begin
 if (now() at time zone 'Europe/London')::time < time '09:00' then return '[]'::jsonb;end if;
 insert into scene_private.push_deliveries(subscription_id,release_id,release_date)
 select s.id,r.id,r.release_date from public.scene_releases r join public.scene_release_reminders m on m.release_id=r.id join public.scene_members u on u.user_id=m.user_id and u.active join public.scene_push_subscriptions s on s.user_id=m.user_id
 where not exists(select 1 from public.scene_libraries l where l.user_id=m.user_id and l.payload->'preferences'->>'region'='US') and r.active and r.release_date=(now() at time zone 'Europe/London')::date and r.verified_on>=current_date-14 on conflict do nothing;
 with candidates as (select d.subscription_id,d.release_id,d.release_date from scene_private.push_deliveries d
 join public.scene_push_subscriptions s on s.id=d.subscription_id join public.scene_members u on u.user_id=s.user_id and u.active join public.scene_release_reminders m on m.user_id=s.user_id and m.release_id=d.release_id join public.scene_releases r on r.id=d.release_id and r.active and r.release_date=d.release_date
 where not exists(select 1 from public.scene_libraries l where l.user_id=s.user_id and l.payload->'preferences'->>'region'='US') and d.release_date=(now() at time zone 'Europe/London')::date and r.verified_on>=current_date-14 and d.delivered_at is null and d.attempts<3 and (d.claimed_at is null or d.claimed_at<now()-interval '20 minutes') order by d.subscription_id limit 20 for update of d skip locked),
 claimed as(update scene_private.push_deliveries d set attempts=d.attempts+1,claimed_at=now() from candidates c where d.subscription_id=c.subscription_id and d.release_id=c.release_id and d.release_date=c.release_date returning d.*)
 select coalesce(jsonb_agg(jsonb_build_object('subscriptionId',s.id,'userId',s.user_id,'releaseId',d.release_id,'date',d.release_date,'endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth))),'[]') into result from claimed d join public.scene_push_subscriptions s on s.id=d.subscription_id;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION scene_private.scene_reminder_action(p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid:=auth.uid();rid text:=p_data->>'releaseId';ep text:=p_data->>'endpoint';
begin
 if uid is null or not scene_private.session_allowed() then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,9142));
 if p_action='follow' then
  if exists(select 1 from public.scene_libraries l where l.user_id=uid and l.payload->'preferences'->>'region'='US') then raise exception 'US announcement reminders are not available yet';end if;
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
end $function$;


