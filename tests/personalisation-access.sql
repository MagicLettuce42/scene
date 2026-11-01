-- Exercises the existing RLS with the new JSON fields; all records are rolled back.
begin;
select set_config('scene.qa_person_a',gen_random_uuid()::text,true),set_config('scene.qa_person_b',gen_random_uuid()::text,true);
insert into auth.users(id,email,aud,role) values
(current_setting('scene.qa_person_a')::uuid,current_setting('scene.qa_person_a')||'@example.invalid','authenticated','authenticated'),
(current_setting('scene.qa_person_b')::uuid,current_setting('scene.qa_person_b')||'@example.invalid','authenticated','authenticated');
insert into public.scene_members(user_id,email,display_name,role) values
(current_setting('scene.qa_person_a')::uuid,current_setting('scene.qa_person_a')||'@example.invalid','Personalisation QA A','member'),
(current_setting('scene.qa_person_b')::uuid,current_setting('scene.qa_person_b')||'@example.invalid','Personalisation QA B','member');
select set_config('request.jwt.claim.sub',current_setting('scene.qa_person_a'),true);
set local role authenticated;
insert into public.scene_libraries(user_id,payload) values(current_setting('scene.qa_person_a')::uuid,
'{"entries":{"tmdb-movie-1":{"title":{"id":"tmdb-movie-1","kind":"movie","name":"QA film"},"rating":5,"note":"Private QA note"}},"services":{"netflix":true},"preferences":{"theme":"yellow","home":{"startView":"films","density":"comfortable","hidden":["tonight"]}},"receipts":[]}');
do $$ declare d jsonb;begin
 select payload into d from public.scene_libraries where user_id=current_setting('scene.qa_person_a')::uuid;
 if d#>>'{entries,tmdb-movie-1,note}'<>'Private QA note' or d#>>'{preferences,home,startView}'<>'films' then raise exception 'Own private data did not persist';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('scene.qa_person_b'),true);
set local role authenticated;
do $$ declare n integer;begin
 if exists(select 1 from public.scene_libraries where user_id=current_setting('scene.qa_person_a')::uuid) then raise exception 'Other account can read private data';end if;
 update public.scene_libraries set payload='{}' where user_id=current_setting('scene.qa_person_a')::uuid;get diagnostics n=row_count;
 if n<>0 then raise exception 'Other account can overwrite private data';end if;
end $$;
reset role;
update public.scene_members set active=false where user_id=current_setting('scene.qa_person_a')::uuid;
select set_config('request.jwt.claim.sub',current_setting('scene.qa_person_a'),true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.scene_libraries where user_id=current_setting('scene.qa_person_a')::uuid) then raise exception 'Revoked account can still read private data';end if;
end $$;
reset role;
select 'PASS: own preferences, ratings and notes persisted; another account and revoked account cannot access them; transaction rolled back.' as result;
rollback;
