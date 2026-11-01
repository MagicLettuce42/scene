-- Read-only configuration assertions. Does not read personal payloads or create accounts.
begin read only;
do $$
declare guarded text;
begin
 if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname in ('public','scene_private') and c.relkind='r' and c.relrowsecurity)<>9 then
  raise exception 'Expected nine Scene tables with RLS; review any schema change.';
 end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname in ('public','scene_private') and c.relkind='r' and not c.relrowsecurity) then
  raise exception 'A table lacks RLS.';
 end if;
 for guarded in select unnest(array['scene_libraries','scene_lists','scene_list_members','scene_list_items','scene_list_votes']) loop
  if not exists(select 1 from pg_policies where schemaname='public' and tablename=guarded
    and permissive='RESTRICTIVE' and qual like '%session_allowed%' and with_check like '%session_allowed%') then
   raise exception 'Missing restrictive session/MFA policy on %.',guarded;
  end if;
 end loop;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='scene_members'
   and permissive='RESTRICTIVE' and qual like '%security_state%') then raise exception 'Missing membership session check.';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where (n.nspname='scene_private' or n.nspname='public' and p.proname like 'scene_%')
   and (has_function_privilege('anon',p.oid,'EXECUTE') or not coalesce(p.proconfig @> array['search_path=""'],false))) then
  raise exception 'Scene function has anonymous execution or an unsafe search path.';
 end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname like 'scene_%' and p.prosecdef) then
  raise exception 'Exposed Scene function unexpectedly uses SECURITY DEFINER.';
 end if;
 if has_function_privilege('authenticated','public.scene_redeem_invite(text,uuid,text,text)','EXECUTE')
 or has_function_privilege('authenticated','public.scene_revoke_member(uuid)','EXECUTE') then
  raise exception 'Member can call a service-only access function.';
 end if;
end $$;
select 'PASS: nine RLS tables, restrictive session/MFA policies, no anonymous function execution, pinned search paths and service-only access management.' as result;
rollback;
