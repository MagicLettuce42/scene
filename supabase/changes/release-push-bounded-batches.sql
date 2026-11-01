create or replace function public.scene_claim_release_pushes() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 if (now() at time zone 'Europe/London')::time < time '09:00' then return '[]'::jsonb;end if;
 insert into scene_private.push_deliveries(subscription_id,release_id,release_date)
 select s.id,r.id,r.release_date from public.scene_releases r join public.scene_release_reminders m on m.release_id=r.id join public.scene_members u on u.user_id=m.user_id and u.active join public.scene_push_subscriptions s on s.user_id=m.user_id
 where r.active and r.release_date=(now() at time zone 'Europe/London')::date and r.verified_on>=current_date-14 on conflict do nothing;
 with candidates as (select d.subscription_id,d.release_id,d.release_date from scene_private.push_deliveries d
 join public.scene_push_subscriptions s on s.id=d.subscription_id join public.scene_members u on u.user_id=s.user_id and u.active join public.scene_release_reminders m on m.user_id=s.user_id and m.release_id=d.release_id join public.scene_releases r on r.id=d.release_id and r.active and r.release_date=d.release_date
 where d.release_date=(now() at time zone 'Europe/London')::date and r.verified_on>=current_date-14 and d.delivered_at is null and d.attempts<3 and (d.claimed_at is null or d.claimed_at<now()-interval '20 minutes') order by d.subscription_id limit 20 for update of d skip locked),
 claimed as(update scene_private.push_deliveries d set attempts=d.attempts+1,claimed_at=now() from candidates c where d.subscription_id=c.subscription_id and d.release_id=c.release_id and d.release_date=c.release_date returning d.*)
 select coalesce(jsonb_agg(jsonb_build_object('subscriptionId',s.id,'userId',s.user_id,'releaseId',d.release_id,'date',d.release_date,'endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth))),'[]') into result from claimed d join public.scene_push_subscriptions s on s.id=d.subscription_id;
 return result;
end $$;
create or replace function scene_private.invoke_release_worker() returns bigint language plpgsql security definer set search_path='' as $$declare secret text;request_id bigint;begin
 select decrypted_secret into secret from vault.decrypted_secrets where name='scene_push_worker_secret';
 if secret is null then raise exception 'Worker is not configured';end if;
 select net.http_post(url:='https://cqgauurbkmdbxckjdals.supabase.co/functions/v1/scene-release-reminders',headers:=jsonb_build_object('Content-Type','application/json','x-scene-worker',secret),body:='{}'::jsonb,timeout_milliseconds:=60000) into request_id;
 return request_id;
end$$;
