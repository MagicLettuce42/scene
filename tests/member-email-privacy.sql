-- Fake identities only; no real user rows are read, changed or returned.
begin;
select set_config('scene.privacy_owner',gen_random_uuid()::text,true),
 set_config('scene.privacy_member',gen_random_uuid()::text,true),
 set_config('scene.privacy_outsider',gen_random_uuid()::text,true),
 set_config('scene.privacy_owner_session',gen_random_uuid()::text,true),
 set_config('scene.privacy_member_session',gen_random_uuid()::text,true),
 set_config('scene.privacy_outsider_session',gen_random_uuid()::text,true),
 set_config('scene.privacy_factor',gen_random_uuid()::text,true);
insert into auth.users(id,email,aud,role) values
 (current_setting('scene.privacy_owner')::uuid,current_setting('scene.privacy_owner')||'@example.invalid','authenticated','authenticated'),
 (current_setting('scene.privacy_member')::uuid,current_setting('scene.privacy_member')||'@example.invalid','authenticated','authenticated'),
 (current_setting('scene.privacy_outsider')::uuid,current_setting('scene.privacy_outsider')||'@example.invalid','authenticated','authenticated');
insert into public.scene_members(user_id,email,display_name,role) values
 (current_setting('scene.privacy_owner')::uuid,current_setting('scene.privacy_owner')||'@example.invalid','Privacy QA owner','owner'),
 (current_setting('scene.privacy_member')::uuid,current_setting('scene.privacy_member')||'@example.invalid','private-member@example.invalid','member'),
 (current_setting('scene.privacy_outsider')::uuid,current_setting('scene.privacy_outsider')||'@example.invalid','Privacy QA outsider','member');
insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,created_at,updated_at,secret)
 values(current_setting('scene.privacy_factor')::uuid,current_setting('scene.privacy_owner')::uuid,'Disposable privacy fixture','totp','verified',now(),now(),'not-a-real-secret');
insert into auth.sessions(id,user_id,created_at,updated_at,aal,factor_id) values
 (current_setting('scene.privacy_owner_session')::uuid,current_setting('scene.privacy_owner')::uuid,now(),now(),'aal2',current_setting('scene.privacy_factor')::uuid),
 (current_setting('scene.privacy_member_session')::uuid,current_setting('scene.privacy_member')::uuid,now(),now(),'aal1',null),
 (current_setting('scene.privacy_outsider_session')::uuid,current_setting('scene.privacy_outsider')::uuid,now(),now(),'aal1',null);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('scene.privacy_owner'),'session_id',current_setting('scene.privacy_owner_session'),'role','authenticated','aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
set local role authenticated;
do $$ declare d jsonb; l uuid; begin
 if exists(select 1 from public.scene_members where user_id<>auth.uid()) then raise exception 'Owner can directly read another membership';end if;
 if not exists(select 1 from public.scene_members where user_id=auth.uid() and email like '%@example.invalid') then raise exception 'Own account email is unavailable';end if;
 d:=public.scene_social('create',jsonb_build_object('id',gen_random_uuid(),'name','Privacy QA list'));l:=(d->>'id')::uuid;
 perform set_config('scene.privacy_list',l::text,true);
 perform public.scene_social('invite',jsonb_build_object('listId',l,'email',current_setting('scene.privacy_member')||'@example.invalid','hash',repeat('4',64)));
 d:=public.scene_social('detail',jsonb_build_object('listId',l));
 if (d->'invites'->0->>'name') is distinct from 'Scene member' or (d->'invites'->0) ? 'email' or strpos(d::text,'@')>0 then raise exception 'Shared invitation exposes an email';end if;
 perform public.scene_social('cancel-invite',jsonb_build_object('listId',l,'inviteId',d->'invites'->0->>'id'));
 d:=public.scene_social('detail',jsonb_build_object('listId',l));
 if jsonb_array_length(d->'invites')<>0 then raise exception 'Email-free cancellation failed';end if;
 perform public.scene_social('invite',jsonb_build_object('listId',l,'email',current_setting('scene.privacy_member')||'@example.invalid','hash',repeat('5',64)));
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('scene.privacy_member'),'session_id',current_setting('scene.privacy_member_session'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
do $$ declare d jsonb; begin
 d:=public.scene_social('inspect',jsonb_build_object('hash',repeat('5',64)));
 if strpos(d::text,'@')>0 then raise exception 'Shared invitation inspection exposes an email';end if;
 perform public.scene_social('join',jsonb_build_object('hash',repeat('5',64)));
 d:=public.scene_social('detail',jsonb_build_object('listId',current_setting('scene.privacy_list')));
 if strpos(d::text,'@')>0 then raise exception 'Shared member identity exposes an email';end if;
 if not exists(select 1 from jsonb_array_elements(d->'people') p where p->>'id'=current_setting('scene.privacy_member') and p->>'name'='Scene member') then raise exception 'Private member label missing';end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('scene.privacy_outsider'),'session_id',current_setting('scene.privacy_outsider_session'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
do $$ begin
 begin perform public.scene_social('detail',jsonb_build_object('listId',current_setting('scene.privacy_list')));raise exception 'Outsider read shared list';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'PASS: owner cannot query other member emails; shared invitations and people omit addresses; own email, invitation cancellation/redemption and outsider denial work. All fixtures rolled back.' as result;
rollback;
