create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create or replace function scene_private.invoke_release_worker() returns bigint language plpgsql security definer set search_path='' as $$declare secret text;request_id bigint;begin
 select decrypted_secret into secret from vault.decrypted_secrets where name='scene_push_worker_secret';
 if secret is null then raise exception 'Worker is not configured';end if;
 select net.http_post(url:='https://cqgauurbkmdbxckjdals.supabase.co/functions/v1/scene-release-reminders',headers:=jsonb_build_object('Content-Type','application/json','x-scene-worker',secret),body:='{}'::jsonb,timeout_milliseconds:=10000) into request_id;
 return request_id;
end$$;
revoke all on function scene_private.invoke_release_worker() from public,anon,authenticated;
select cron.schedule('scene-release-reminders','10 * * * *','select scene_private.invoke_release_worker();');
