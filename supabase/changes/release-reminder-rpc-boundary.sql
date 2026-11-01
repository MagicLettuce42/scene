-- Keep the public API wrapper unprivileged; the checked writer lives in the private schema.
alter function public.scene_reminder_action(text,jsonb) set schema scene_private;
create function public.scene_reminder_action(p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select scene_private.scene_reminder_action(p_action,p_data); $$;
revoke all on function public.scene_reminder_action(text,jsonb) from public,anon;
grant execute on function public.scene_reminder_action(text,jsonb) to authenticated;
create policy deny_client_delivery_access on scene_private.push_deliveries for all to anon,authenticated using(false) with check(false);
create policy deny_client_worker_access on scene_private.release_worker_status for all to anon,authenticated using(false) with check(false);
