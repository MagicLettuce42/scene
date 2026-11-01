-- Disposable identities and records live only inside this rolled-back transaction.
begin;
select set_config('scene.test_a',gen_random_uuid()::text,true),set_config('scene.test_b',gen_random_uuid()::text,true),set_config('scene.test_c',gen_random_uuid()::text,true);
insert into auth.users(id,email,aud,role) values
(current_setting('scene.test_a')::uuid,'scene-a-test@example.invalid','authenticated','authenticated'),
(current_setting('scene.test_b')::uuid,'scene-b-test@example.invalid','authenticated','authenticated'),
(current_setting('scene.test_c')::uuid,'scene-c-test@example.invalid','authenticated','authenticated');
insert into public.scene_members(user_id,email,display_name,role) values
(current_setting('scene.test_a')::uuid,'scene-a-test@example.invalid','Test A','member'),
(current_setting('scene.test_b')::uuid,'scene-b-test@example.invalid','Test B','member'),
(current_setting('scene.test_c')::uuid,'scene-c-test@example.invalid','Test C','member');
insert into public.scene_libraries(user_id,payload) values(current_setting('scene.test_a')::uuid,'{"entries":{},"services":{"netflix":true},"preferences":{"theme":"yellow","onboarded":true},"receipts":[]}');
select set_config('request.jwt.claim.sub',current_setting('scene.test_a'),true);
set local role authenticated;
do $$ declare d jsonb; l uuid; begin
 d:=public.scene_social('create',jsonb_build_object('id',gen_random_uuid(),'name','QA film night'));l:=(d->>'id')::uuid;perform set_config('scene.test_list',l::text,true);
 perform public.scene_social('add',jsonb_build_object('listId',l,'title',jsonb_build_object('tmdbId',157336,'name','Interstellar','kind','movie')));
 perform public.scene_social('add',jsonb_build_object('listId',l,'title',jsonb_build_object('tmdbId',157336,'name','Interstellar','kind','movie')));
 perform public.scene_social('vote',jsonb_build_object('listId',l,'key','tmdb-movie-157336','value',true));
 perform public.scene_social('vote',jsonb_build_object('listId',l,'key','tmdb-movie-157336','value',true));
 if (select count(*) from public.scene_list_items where list_id=l)<>1 or (select count(*) from public.scene_list_votes where list_id=l)<>1 then raise exception 'Duplicate title/vote';end if;
 perform public.scene_social('invite',jsonb_build_object('listId',l,'email','scene-b-test@example.invalid','hash',repeat('a',64)));
 begin insert into public.scene_list_members(list_id,user_id) values(l,current_setting('scene.test_c')::uuid);raise exception 'Direct membership insertion allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('scene.test_b'),true);
set local role authenticated;
do $$ declare d jsonb; l uuid:=current_setting('scene.test_list')::uuid; begin
 if exists(select 1 from public.scene_lists where id=l) then raise exception 'Unaccepted invitation leaked list';end if;
 if exists(select 1 from public.scene_libraries where user_id=current_setting('scene.test_a')::uuid) then raise exception 'Private library leaked';end if;
 d:=public.scene_social('inspect',jsonb_build_object('hash',repeat('a',64)));if d->>'name'<>'QA film night' then raise exception 'Invitation inspection failed';end if;
 perform public.scene_social('join',jsonb_build_object('hash',repeat('a',64)));
 perform public.scene_social('join',jsonb_build_object('hash',repeat('a',64)));
 if not exists(select 1 from public.scene_lists where id=l) then raise exception 'Accepted member cannot read';end if;
 perform public.scene_social('vote',jsonb_build_object('listId',l,'key','tmdb-movie-157336','value',true));
 if (select count(*) from public.scene_list_votes where list_id=l)<>2 then raise exception 'Independent vote missing';end if;
 begin perform public.scene_social('rename',jsonb_build_object('listId',l,'name','Hijack'));raise exception 'Member renamed list';exception when insufficient_privilege then null;end;
 begin perform public.scene_social('remove-title',jsonb_build_object('listId',l,'key','tmdb-movie-157336'));raise exception 'Member removed another person title';exception when insufficient_privilege then null;end;
 begin perform public.scene_social('invite',jsonb_build_object('listId',l,'email','scene-c-test@example.invalid','hash',repeat('c',64)));raise exception 'Member created invitation';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('scene.test_c'),true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.scene_list_items where list_id=current_setting('scene.test_list')::uuid) then raise exception 'Outsider can read titles';end if;
 begin perform public.scene_social('detail',jsonb_build_object('listId',current_setting('scene.test_list')));raise exception 'Outsider detail allowed';exception when insufficient_privilege then null;end;
 begin perform public.scene_social('join',jsonb_build_object('hash',repeat('a',64)));raise exception 'Wrong account invitation allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('scene.test_a'),true);
set local role authenticated;
do $$ declare d jsonb; l uuid:=current_setting('scene.test_list')::uuid; begin
 perform public.scene_social('remove-person',jsonb_build_object('listId',l,'userId',current_setting('scene.test_b')));
 if (select count(*) from public.scene_list_votes where list_id=l)<>1 then raise exception 'Removed vote remained';end if;
 perform public.scene_social('invite',jsonb_build_object('listId',l,'email','scene-c-test@example.invalid','hash',repeat('c',64)));
 d:=public.scene_social('detail',jsonb_build_object('listId',l));
 perform public.scene_social('cancel-invite',jsonb_build_object('listId',l,'inviteId',d->'invites'->0->>'id'));
 perform public.scene_social('archive',jsonb_build_object('listId',l,'value',true));
 if not (select archived from public.scene_lists where id=l) then raise exception 'Archive failed';end if;
 perform public.scene_social('archive',jsonb_build_object('listId',l,'value',false));
 if (select archived from public.scene_lists where id=l) then raise exception 'Restore failed';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('scene.test_b'),true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.scene_lists where id=current_setting('scene.test_list')::uuid) then raise exception 'Removed member can still read';end if;
 begin perform public.scene_social('join',jsonb_build_object('hash',repeat('a',64)));raise exception 'Removed member rejoined old invite';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('scene.test_c'),true);
set local role authenticated;
do $$ begin
 begin perform public.scene_social('join',jsonb_build_object('hash',repeat('c',64)));raise exception 'Cancelled invitation accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.scene_members set active=false where user_id=current_setting('scene.test_a')::uuid;
select set_config('request.jwt.claim.sub',current_setting('scene.test_a'),true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.scene_lists where id=current_setting('scene.test_list')::uuid) then raise exception 'Revoked Scene member can read';end if;
 begin perform public.scene_social('lists');raise exception 'Revoked Scene member can call RPC';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.scene_social('lists');raise exception 'Anonymous RPC access';exception when insufficient_privilege then null;end;
 begin perform count(*) from public.scene_lists;raise exception 'Anonymous table access';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'PASS: list isolation, accepted invitations, wrong accounts, private libraries, duplicate titles/votes, owner permissions, removal, cancelled links, archive/restore, revocation and anonymous denial' as verification;
rollback;
