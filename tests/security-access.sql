-- Disposable fixtures, no real account data read or changed. Always rolled back.
begin;
select set_config('scene.qa_member',gen_random_uuid()::text,true),set_config('scene.qa_owner',gen_random_uuid()::text,true),
 set_config('scene.qa_session',gen_random_uuid()::text,true),set_config('scene.qa_factor',gen_random_uuid()::text,true);
insert into auth.users(id,email,aud,role) values
 (current_setting('scene.qa_member')::uuid,current_setting('scene.qa_member')||'@example.invalid','authenticated','authenticated'),
 (current_setting('scene.qa_owner')::uuid,current_setting('scene.qa_owner')||'@example.invalid','authenticated','authenticated');
insert into public.scene_members(user_id,email,display_name,role) values
 (current_setting('scene.qa_member')::uuid,current_setting('scene.qa_member')||'@example.invalid','Security QA member','member'),
 (current_setting('scene.qa_owner')::uuid,current_setting('scene.qa_owner')||'@example.invalid','Security QA owner','owner');
insert into auth.sessions(id,user_id,created_at,updated_at,aal) values(current_setting('scene.qa_session')::uuid,current_setting('scene.qa_member')::uuid,now(),now(),'aal1');
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('scene.qa_member'),'session_id',current_setting('scene.qa_session'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
do $$begin
 if not (public.scene_security_state()->>'allowed')::boolean then raise exception 'Optional MFA blocked a member';end if;
 for i in 1..90 loop if not (public.scene_consume_api_limit('account')->>'allowed')::boolean then raise exception 'Quota rejected normal request';end if;end loop;
 if (public.scene_consume_api_limit('account')->>'allowed')::boolean then raise exception 'Quota did not reject excess requests';end if;
 begin perform public.scene_consume_api_limit('admin');raise exception 'Member used admin quota';exception when insufficient_privilege then null;end;
 insert into public.scene_libraries(user_id,payload) values(auth.uid(),'{"note":"QA only"}');
 if (select count(*) from public.scene_libraries where user_id=auth.uid())<>1 then raise exception 'Own library unavailable';end if;
end$$;
reset role;
-- Verified factor means password-only sessions must be blocked, including direct REST/RPC.
insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,created_at,updated_at,secret)
 values(current_setting('scene.qa_factor')::uuid,current_setting('scene.qa_member')::uuid,'Disposable fixture','totp','verified',now(),now(),'not-a-real-secret');
set local role authenticated;
do $$begin
 if (public.scene_security_state()->>'allowed')::boolean then raise exception 'Enrolled member bypassed MFA';end if;
 if exists(select 1 from public.scene_libraries) then raise exception 'AAL1 read private data';end if;
 if exists(select 1 from public.scene_lists) or exists(select 1 from public.scene_list_members) or exists(select 1 from public.scene_list_items) or exists(select 1 from public.scene_list_votes) then raise exception 'AAL1 read shared data';end if;
 begin
  perform public.scene_social('create',jsonb_build_object('id',gen_random_uuid(),'name','Forbidden'));
  raise exception 'AAL1 bypassed shared RPC';
 exception when insufficient_privilege then null;end;
 begin
  insert into public.scene_libraries(user_id,payload) values(auth.uid(),'{}') on conflict(user_id) do update set payload='{}';
  raise exception 'AAL1 wrote private data';
 exception when insufficient_privilege then null;end;
end$$;
reset role;
update auth.sessions set aal='aal2',factor_id=current_setting('scene.qa_factor')::uuid where id=current_setting('scene.qa_session')::uuid;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('scene.qa_member'),'session_id',current_setting('scene.qa_session'),'role','authenticated','aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
set local role authenticated;
do $$begin
 if not (public.scene_security_state()->>'allowed')::boolean then raise exception 'Verified member blocked';end if;
 if (public.scene_security_state()->>'adminReady')::boolean then raise exception 'Member gained admin access';end if;
 if (select count(*) from public.scene_libraries where user_id=auth.uid())<>1 then raise exception 'Verified member lost library';end if;
 if exists(select 1 from public.scene_libraries where user_id<>auth.uid()) then raise exception 'Cross-account data leak';end if;
 perform public.scene_social('create',jsonb_build_object('id',gen_random_uuid(),'name','Allowed QA list'));
end$$;
reset role;
-- Owner must enroll even when they have no factor. User metadata cannot bypass it.
update auth.sessions set user_id=current_setting('scene.qa_owner')::uuid,aal='aal1',factor_id=null where id=current_setting('scene.qa_session')::uuid;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('scene.qa_owner'),'session_id',current_setting('scene.qa_session'),'role','authenticated','aal','aal1','user_metadata',jsonb_build_object('aal','aal2'))::text,true);
set local role authenticated;
do $$begin
 if not (public.scene_security_state()->>'required')::boolean or (public.scene_security_state()->>'allowed')::boolean then raise exception 'Owner bypassed required enrollment';end if;
end$$;
reset role;
update auth.mfa_factors set user_id=current_setting('scene.qa_owner')::uuid where id=current_setting('scene.qa_factor')::uuid;
update auth.sessions set aal='aal2',factor_id=current_setting('scene.qa_factor')::uuid where id=current_setting('scene.qa_session')::uuid;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('scene.qa_owner'),'session_id',current_setting('scene.qa_session'),'role','authenticated','aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
set local role authenticated;
do $$begin
 if not (public.scene_security_state()->>'adminReady')::boolean then raise exception 'Fresh owner MFA blocked';end if;
end$$;
reset role;
select set_config('request.jwt.claims',jsonb_set(current_setting('request.jwt.claims')::jsonb,'{amr,0,timestamp}',to_jsonb(extract(epoch from now()-interval '11 minutes')::bigint))::text,true);
set local role authenticated;
do $$begin
 if (public.scene_security_state()->>'adminReady')::boolean or not (public.scene_security_state()->>'allowed')::boolean then raise exception 'Admin step-up timeout failed';end if;
end$$;
reset role;
-- Removed factor, revoked session, or password-reset cutoff each invalidate access.
update auth.mfa_factors set status='unverified' where id=current_setting('scene.qa_factor')::uuid;
set local role authenticated;
do $$begin if (public.scene_security_state()->>'allowed')::boolean then raise exception 'Stale AAL2 bypassed removed factor';end if;end$$;
reset role;
update auth.mfa_factors set status='verified' where id=current_setting('scene.qa_factor')::uuid;
update public.scene_members set sessions_valid_after=now()+interval '1 second' where user_id=current_setting('scene.qa_owner')::uuid;
set local role authenticated;
do $$begin if (public.scene_security_state()->>'sessionValid')::boolean then raise exception 'Old session survived reset';end if;end$$;
reset role;
update public.scene_members set sessions_valid_after='-infinity' where user_id=current_setting('scene.qa_owner')::uuid;
delete from auth.sessions where id=current_setting('scene.qa_session')::uuid;
set local role authenticated;
do $$begin if (public.scene_security_state()->>'allowed')::boolean then raise exception 'Revoked session still allowed';end if;end$$;
reset role;
select 'PASS: optional member MFA, required owner MFA, RLS/RPC enforcement, role isolation, fresh admin verification, stale-factor and revoked-session denial.' as result;
rollback;
