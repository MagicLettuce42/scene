-- Additive member experience upgrade. Private data stays behind authenticated RPCs.
create table scene_private.product_reports (
 id uuid primary key,
 reporter_id uuid references public.scene_members(user_id) on delete set null,
 kind text not null check(kind in ('suggestion','availability','link','bug')),
 message text not null check(char_length(message) between 1 and 1500),
 title jsonb,
 service text,
 status text not null default 'new' check(status in ('new','reviewing','resolved')),
 created_at timestamptz not null default now()
);
create index product_reports_reporter_created on scene_private.product_reports(reporter_id,created_at desc);
create index product_reports_created on scene_private.product_reports(created_at desc);
alter table scene_private.product_reports enable row level security;
revoke all on scene_private.product_reports from public,anon,authenticated;

create table scene_private.quality_totals (
 day date not null,
 metric text not null check(metric in ('load','interaction','search_ok','search_error','browse_ok','browse_error')),
 bucket text not null check(bucket in ('fast','medium','slow')),
 samples bigint not null default 0,
 total_ms bigint not null default 0,
 primary key(day,metric,bucket)
);
alter table scene_private.quality_totals enable row level security;
revoke all on scene_private.quality_totals from public,anon,authenticated;

create function scene_private.product_action(p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); result jsonb; item jsonb; milliseconds integer; metric_name text; band text;
begin
 if caller is null or not scene_private.session_allowed() then raise exception 'Sign in to Scene.' using errcode='42501'; end if;
 if jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>12000 then raise exception 'Invalid request.' using errcode='22023'; end if;
 if p_action='submit' then
  if p_data->>'kind' not in ('suggestion','availability','link','bug') or char_length(btrim(coalesce(p_data->>'message',''))) not between 1 and 1500
   or p_data->>'id' is null then raise exception 'Check your feedback.' using errcode='22023'; end if;
  if p_data->'title' is not null and p_data->'title'<>'null'::jsonb and
    (jsonb_typeof(p_data->'title')<>'object' or octet_length((p_data->'title')::text)>1000) then raise exception 'Invalid title.' using errcode='22023'; end if;
  if char_length(coalesce(p_data->>'service',''))>30 then raise exception 'Invalid service.' using errcode='22023'; end if;
  perform 1 from public.scene_members where user_id=caller for update;
  if exists(select 1 from scene_private.product_reports where id=(p_data->>'id')::uuid and reporter_id=caller) then return '{"ok":true}'::jsonb; end if;
  if (select count(*) from scene_private.product_reports where reporter_id=caller and created_at>now()-interval '1 day')>=10 then raise exception 'You can send 10 reports per day. Please try tomorrow.' using errcode='22023'; end if;
  insert into scene_private.product_reports(id,reporter_id,kind,message,title,service)
   values((p_data->>'id')::uuid,caller,p_data->>'kind',btrim(p_data->>'message'),p_data->'title',nullif(p_data->>'service',''));
  return '{"ok":true}'::jsonb;
 end if;
 if p_action='quality' then
  -- Only explicit opt-in, bounded anonymous totals. No titles, URLs, queries or user IDs.
  if not exists(select 1 from public.scene_libraries where user_id=caller and payload#>>'{preferences,sharePerformance}'='true') then return '{"ok":true}'::jsonb; end if;
  if jsonb_typeof(p_data->'samples')<>'array' or jsonb_array_length(p_data->'samples')>10 then raise exception 'Invalid measurements.' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(p_data->'samples') loop
   metric_name:=item->>'metric';
   if metric_name not in ('load','interaction','search_ok','search_error','browse_ok','browse_error') or coalesce(item->>'ms','') !~ '^\d{1,5}$' then raise exception 'Invalid measurement.' using errcode='22023'; end if;
   milliseconds:=least(60000,(item->>'ms')::integer);
   band:=case when milliseconds<case when metric_name='interaction' then 200 else 2500 end then 'fast'
    when milliseconds<case when metric_name='interaction' then 500 else 4000 end then 'medium' else 'slow' end;
   insert into scene_private.quality_totals(day,metric,bucket,samples,total_ms) values((now() at time zone 'Europe/London')::date,metric_name,band,1,milliseconds)
    on conflict(day,metric,bucket) do update set samples=scene_private.quality_totals.samples+1,total_ms=scene_private.quality_totals.total_ms+excluded.total_ms;
  end loop;
  delete from scene_private.quality_totals where day<current_date-30;
  return '{"ok":true}'::jsonb;
 end if;
 if not coalesce((scene_private.security_state()->>'adminReady')::boolean,false) then raise exception 'Owner verification is required.' using errcode='42501'; end if;
 if p_action='inbox' then
  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc),'[]'::jsonb) into result from
   (select id,kind,message,title,service,status,created_at from scene_private.product_reports order by created_at desc limit 100) r;
  return jsonb_build_object('reports',result,'quality',(select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) from
   (select day,metric,bucket,samples,total_ms from scene_private.quality_totals where day>=current_date-7 order by day desc,metric) q));
 elsif p_action='status' then
  if p_data->>'status' not in ('new','reviewing','resolved') then raise exception 'Invalid status.' using errcode='22023'; end if;
  update scene_private.product_reports set status=p_data->>'status' where id=(p_data->>'id')::uuid;
  return '{"ok":true}'::jsonb;
 end if;
 raise exception 'Unknown action.' using errcode='22023';
end;$$;
revoke all on function scene_private.product_action(text,jsonb) from public,anon;
grant execute on function scene_private.product_action(text,jsonb) to authenticated;
create function public.scene_product(p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language sql security invoker set search_path='' as $$select scene_private.product_action(p_action,p_data);$$;
revoke all on function public.scene_product(text,jsonb) from public,anon;
grant execute on function public.scene_product(text,jsonb) to authenticated;

create table scene_private.movie_night_choices (
 list_id uuid not null,
 user_id uuid not null,
 services text[] not null check(cardinality(services)<=11),
 primary key(list_id,user_id),
 foreign key(list_id,user_id) references public.scene_list_members(list_id,user_id) on delete cascade
);
create index movie_night_choices_user on scene_private.movie_night_choices(user_id);
alter table scene_private.movie_night_choices enable row level security;
revoke all on scene_private.movie_night_choices from public,anon,authenticated;
create function scene_private.movie_night_action(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); list uuid; shared text[]; roster jsonb; common jsonb; count_people integer; count_ready integer;
begin
 if caller is null or not scene_private.session_allowed() then raise exception 'Sign in to Scene.' using errcode='42501'; end if;
 if jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>4000 then raise exception 'Invalid request.' using errcode='22023'; end if;
 list:=(p_data->>'listId')::uuid;
 perform 1 from public.scene_lists where id=list and not archived for update;
 if not found or not scene_private.list_access(list) then raise exception 'This list is unavailable.' using errcode='42501'; end if;
 if p_action='share' then
  if jsonb_typeof(p_data->'services')<>'array' or jsonb_array_length(p_data->'services')>11 then raise exception 'Choose valid services.' using errcode='22023'; end if;
  select coalesce(array_agg(distinct s),'{}'::text[]) into shared from jsonb_array_elements_text(p_data->'services') s;
  if exists(select 1 from unnest(shared) s where s not in ('netflix','prime','disney','apple','bbc','now','itv','channel4','paramount','sky','max')) then raise exception 'Choose valid services.' using errcode='22023'; end if;
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
 return jsonb_build_object('people',roster,'ready',count_people>=2 and count_ready=count_people,'commonServices',common);
end;$$;
revoke all on function scene_private.movie_night_action(text,jsonb) from public,anon;
grant execute on function scene_private.movie_night_action(text,jsonb) to authenticated;
create function public.scene_movie_night(p_action text,p_data jsonb) returns jsonb
language sql security invoker set search_path='' as $$select scene_private.movie_night_action(p_action,p_data);$$;
revoke all on function public.scene_movie_night(text,jsonb) from public,anon;
grant execute on function public.scene_movie_night(text,jsonb) to authenticated;
