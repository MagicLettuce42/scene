begin;
select set_config('scene.qa_member',gen_random_uuid()::text,true),set_config('scene.qa_other',gen_random_uuid()::text,true),set_config('scene.qa_session',gen_random_uuid()::text,true),set_config('scene.qa_factor',gen_random_uuid()::text,true);
insert into auth.users(id,email,aud,role) select v::uuid,v||'@example.invalid','authenticated','authenticated' from unnest(array[current_setting('scene.qa_member'),current_setting('scene.qa_other')]) v;
insert into public.scene_members(user_id,email,display_name,role) select v::uuid,v||'@example.invalid','Reminder test','member' from unnest(array[current_setting('scene.qa_member'),current_setting('scene.qa_other')]) v;
insert into auth.sessions(id,user_id,created_at,updated_at,aal) values(current_setting('scene.qa_session')::uuid,current_setting('scene.qa_member')::uuid,now(),now(),'aal1');
insert into public.scene_releases(id,title,kind,release_date,service_key,label,source_url,verified_on) values('qa-reminder','Fixture','series',(now() at time zone 'Europe/London')::date,'now','New series','https://example.invalid/fixture',current_date);
insert into public.scene_release_reminders(user_id,release_id) values(current_setting('scene.qa_other')::uuid,'qa-reminder');
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('scene.qa_member'),'session_id',current_setting('scene.qa_session'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
do $$begin
 if exists(select 1 from public.scene_release_reminders where user_id<>auth.uid()) then raise exception 'Cross-user reminders exposed';end if;
 perform public.scene_reminder_action('follow','{"releaseId":"qa-reminder"}');
 perform public.scene_reminder_action('follow','{"releaseId":"qa-reminder"}');
 if (select count(*) from public.scene_release_reminders where release_id='qa-reminder')<>1 then raise exception 'Not idempotent';end if;
 begin perform public.scene_release_worker_config();raise exception 'Secrets exposed';exception when insufficient_privilege then null;end;
 begin perform public.scene_claim_release_pushes();raise exception 'Queue exposed';exception when insufficient_privilege then null;end;
 begin insert into public.scene_releases(id,title) values('forbidden','Bad');raise exception 'Member wrote releases';exception when insufficient_privilege then null;end;
 begin perform public.scene_reminder_action('subscribe',jsonb_build_object('endpoint','https://127.0.0.1/private','p256dh',repeat('a',87),'auth',repeat('b',22)));raise exception 'Unsafe endpoint accepted';exception when check_violation then null;end;
 perform public.scene_reminder_action('subscribe',jsonb_build_object('endpoint','https://fcm.googleapis.com/scene-fixture','p256dh',repeat('a',87),'auth',repeat('b',22)));
end$$;
reset role;
-- Claiming never sends anything. Test date changes, opt-out, revoked access and deduplication in a rolled-back transaction.
do $$declare rows jsonb;sid uuid;begin
 select id into sid from public.scene_push_subscriptions where user_id=current_setting('scene.qa_member')::uuid;
 if (now() at time zone 'Europe/London')::time>=time '09:00' then
  rows:=public.scene_claim_release_pushes();if not exists(select 1 from jsonb_array_elements(rows) x where x->>'releaseId'='qa-reminder') then raise exception 'Due reminder not claimed';end if;
  rows:=public.scene_claim_release_pushes();if exists(select 1 from jsonb_array_elements(rows) x where x->>'releaseId'='qa-reminder') then raise exception 'Concurrent duplicate';end if;
  perform public.scene_finish_release_push(sid,'qa-reminder',current_date,201);
  rows:=public.scene_claim_release_pushes();if exists(select 1 from jsonb_array_elements(rows) x where x->>'releaseId'='qa-reminder') then raise exception 'Delivered duplicate';end if;
  delete from scene_private.push_deliveries where release_id='qa-reminder';
  update public.scene_releases set release_date=current_date+1 where id='qa-reminder';
  rows:=public.scene_claim_release_pushes();if exists(select 1 from jsonb_array_elements(rows) x where x->>'releaseId'='qa-reminder') then raise exception 'Changed date sent';end if;
  update public.scene_releases set release_date=current_date,active=false where id='qa-reminder';
  rows:=public.scene_claim_release_pushes();if exists(select 1 from jsonb_array_elements(rows) x where x->>'releaseId'='qa-reminder') then raise exception 'Cancelled release sent';end if;
  update public.scene_releases set active=true where id='qa-reminder';update public.scene_members set active=false where user_id=current_setting('scene.qa_member')::uuid;
  rows:=public.scene_claim_release_pushes();if exists(select 1 from jsonb_array_elements(rows) x where x->>'releaseId'='qa-reminder') then raise exception 'Revoked member sent';end if;
  update public.scene_members set active=true where user_id=current_setting('scene.qa_member')::uuid;
 end if;
end$$;
insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,created_at,updated_at,secret) values(current_setting('scene.qa_factor')::uuid,current_setting('scene.qa_member')::uuid,'Fixture','totp','verified',now(),now(),'fixture');
set local role authenticated;
do $$begin
 if exists(select 1 from public.scene_release_reminders) or exists(select 1 from public.scene_push_subscriptions) then raise exception 'MFA bypass';end if;
 begin perform public.scene_reminder_action('follow','{"releaseId":"qa-reminder"}');raise exception 'MFA write bypass';exception when insufficient_privilege then null;end;
end$$;
reset role;
rollback;
select 'Reminder isolation, MFA, queue deduplication, date changes and access checks passed' as result;
