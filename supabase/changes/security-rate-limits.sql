-- Fixed per-account buckets work across workers and cannot be reset by changing an IP.
create table scene_private.api_limits (
 user_id uuid not null references auth.users(id) on delete cascade,
 bucket text not null check(bucket in ('account','catalogue','library','shared','admin')),
 window_start timestamptz not null,
 used integer not null check(used>0),
 primary key(user_id,bucket)
);
alter table scene_private.api_limits enable row level security;
revoke all on scene_private.api_limits from public,anon,authenticated;
create policy "Rate counters are server-only" on scene_private.api_limits to anon,authenticated using(false) with check(false);
create function scene_private.consume_api_limit(p_bucket text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid());allowed_count integer;used_count integer;
 start_time timestamptz:=date_trunc('minute',clock_timestamp());
 state jsonb:=scene_private.security_state();
begin
 if caller is null or not coalesce((state->>'sessionValid')::boolean,false) then raise exception 'Sign in again.' using errcode='42501';end if;
 if not exists(select 1 from public.scene_members where user_id=caller and active) then raise exception 'Scene access is required.' using errcode='42501';end if;
 if p_bucket<>'account' and not coalesce((state->>'allowed')::boolean,false) then raise exception 'Complete two-factor authentication.' using errcode='42501';end if;
 if p_bucket='admin' and not coalesce((state->>'adminReady')::boolean,false) then raise exception 'Verify your authenticator.' using errcode='42501';end if;
 allowed_count:=case p_bucket when 'account' then 90 when 'catalogue' then 60 when 'library' then 120 when 'shared' then 60 when 'admin' then 20 else null end;
 if allowed_count is null then raise exception 'Invalid quota.' using errcode='22023';end if;
 insert into scene_private.api_limits(user_id,bucket,window_start,used) values(caller,p_bucket,start_time,1)
 on conflict(user_id,bucket) do update set window_start=start_time,used=case when api_limits.window_start=start_time then least(api_limits.used+1,allowed_count+1) else 1 end
 returning used into used_count;
 return jsonb_build_object('allowed',used_count<=allowed_count,'retryAfter',greatest(1,ceil(extract(epoch from start_time+interval '1 minute'-clock_timestamp()))::integer));
end;$$;
revoke all on function scene_private.consume_api_limit(text) from public,anon;
grant execute on function scene_private.consume_api_limit(text) to authenticated;
create function public.scene_consume_api_limit(p_bucket text) returns jsonb language sql security invoker set search_path=''
as $$select scene_private.consume_api_limit(p_bucket);$$;
revoke all on function public.scene_consume_api_limit(text) from public,anon;
grant execute on function public.scene_consume_api_limit(text) to authenticated;
