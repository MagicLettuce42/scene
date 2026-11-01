-- Prepare helpers before deploying the MFA UI. No existing policy changes here.
alter table public.scene_members add column sessions_valid_after timestamptz not null default '-infinity';

-- Only the caller's security posture is returned. Secrets, session IDs, and other
-- users' records never leave this private helper. Do not accept a caller ID argument.
create function scene_private.security_state() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
 caller uuid := (select auth.uid());
 claims jsonb := (select auth.jwt());
 m public.scene_members%rowtype;
 s auth.sessions%rowtype;
 enrolled boolean := false;
 valid_session boolean := false;
 verified boolean := false;
 required_mfa boolean := false;
 allowed boolean := false;
 recent_mfa boolean := false;
begin
 if caller is not null then
  select * into m from public.scene_members where user_id=caller;
  select * into s from auth.sessions where user_id=caller and id::text=claims->>'session_id';
  valid_session:=s.id is not null and s.created_at>=m.sessions_valid_after and (s.not_after is null or s.not_after>now());
  select exists(select 1 from auth.mfa_factors where user_id=caller and status='verified') into enrolled;
  required_mfa:=coalesce(m.role='owner',false) or enrolled;
  verified:=coalesce(claims->>'aal'='aal2' and s.aal::text='aal2',false) and exists(
   select 1 from auth.mfa_factors where id=s.factor_id and user_id=caller and status='verified');
  select exists(select 1 from jsonb_array_elements(coalesce(claims->'amr','[]'::jsonb)) a
   where a->>'method'='totp' and case when a->>'timestamp' ~ '^\d{1,12}$'
    then (a->>'timestamp')::bigint between extract(epoch from now())-600 and extract(epoch from now())+60
    else false end) into recent_mfa;
  allowed:=coalesce(valid_session and m.active and (not required_mfa or verified),false);
 end if;
 return jsonb_build_object('sessionValid',coalesce(valid_session,false),'required',required_mfa,
  'enrolled',enrolled,'verified',verified,'allowed',allowed,
  'adminReady',coalesce(allowed and m.role='owner' and verified and recent_mfa,false));
end;
$$;
revoke all on function scene_private.security_state() from public,anon;
grant execute on function scene_private.security_state() to authenticated;
create function public.scene_security_state() returns jsonb
language sql stable security invoker set search_path='' as $$select scene_private.security_state();$$;
revoke all on function public.scene_security_state() from public,anon;
grant execute on function public.scene_security_state() to authenticated;

create function scene_private.session_allowed() returns boolean
language sql stable security invoker set search_path='' as $$select coalesce((scene_private.security_state()->>'allowed')::boolean,false);$$;
revoke all on function scene_private.session_allowed() from public,anon;
grant execute on function scene_private.session_allowed() to authenticated;

-- The Edge Function authenticates the owner before calling this service-only operation.
-- Cancel outstanding links and invalidate old sessions in the same transaction.
create function public.scene_revoke_member(p_user_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare target_email text;
begin
 update public.scene_members set active=false,sessions_valid_after=now()
 where user_id=p_user_id and role<>'owner' returning email into target_email;
 if not found then raise exception 'This member cannot be removed.' using errcode='22023';end if;
 delete from public.scene_invites where email=target_email and claimed_at is null;
end;
$$;
revoke all on function public.scene_revoke_member(uuid) from public,anon,authenticated;
grant execute on function public.scene_revoke_member(uuid) to service_role;
