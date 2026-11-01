-- Disposable fixtures; never read or alter real account records. Always roll back.
begin;
select set_config('scene.qa_a',gen_random_uuid()::text,true),set_config('scene.qa_b',gen_random_uuid()::text,true),
 set_config('scene.qa_c',gen_random_uuid()::text,true),set_config('scene.qa_o',gen_random_uuid()::text,true),
 set_config('scene.qa_list',gen_random_uuid()::text,true),set_config('scene.qa_report',gen_random_uuid()::text,true),set_config('scene.qa_factor',gen_random_uuid()::text,true);
insert into auth.users(id,email,aud,role) select current_setting('scene.qa_'||u)::uuid,current_setting('scene.qa_'||u)||'@example.invalid','authenticated','authenticated' from unnest(array['a','b','c','o']) u;
insert into public.scene_members(user_id,email,display_name,role) select current_setting('scene.qa_'||u)::uuid,current_setting('scene.qa_'||u)||'@example.invalid','Experience QA',case when u='o' then 'owner' else 'member' end from unnest(array['a','b','c','o']) u;
insert into auth.sessions(id,user_id,created_at,updated_at,aal) select current_setting('scene.qa_'||u)::uuid,current_setting('scene.qa_'||u)::uuid,now(),now(),'aal1' from unnest(array['a','b','c','o']) u;
insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,secret,created_at,updated_at) values(current_setting('scene.qa_factor')::uuid,current_setting('scene.qa_o')::uuid,'QA','totp','verified','fixture-only',now(),now());
update auth.sessions set aal='aal2',factor_id=current_setting('scene.qa_factor')::uuid where user_id=current_setting('scene.qa_o')::uuid;
insert into public.scene_lists(id,owner_id,name) values(current_setting('scene.qa_list')::uuid,current_setting('scene.qa_a')::uuid,'Experience QA movie night');
insert into public.scene_list_members(list_id,user_id) select current_setting('scene.qa_list')::uuid,current_setting('scene.qa_'||u)::uuid from unnest(array['a','b']) u;
insert into public.scene_libraries(user_id,payload) values(current_setting('scene.qa_a')::uuid,'{"entries":{},"services":{"netflix":true},"preferences":{"sharePerformance":false},"receipts":[]}');
select set_config('scene.qa_count',coalesce((select sum(samples)::text from scene_private.quality_totals),'0'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('scene.qa_a'),'session_id',current_setting('scene.qa_a'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
do $$declare d jsonb;begin
 d:=public.scene_movie_night('state',jsonb_build_object('listId',current_setting('scene.qa_list')));
 if (d->>'ready')::boolean or d->'people'->0->'services'<>'[]'::jsonb then raise exception 'Personal services leaked without consent';end if;
 perform public.scene_movie_night('share',jsonb_build_object('listId',current_setting('scene.qa_list'),'services',jsonb_build_array('netflix','disney')));
 perform public.scene_product('submit',jsonb_build_object('id',current_setting('scene.qa_report'),'kind','availability','message','Fixture report'));
 perform public.scene_product('submit',jsonb_build_object('id',current_setting('scene.qa_report'),'kind','availability','message','Fixture report'));
 perform public.scene_product('quality','{"samples":[{"metric":"load","ms":100}]}'::jsonb);
 begin perform public.scene_product('inbox','{}');raise exception 'Member opened owner inbox';exception when insufficient_privilege then null;end;
 begin perform 1 from scene_private.product_reports;raise exception 'Member queried reporter identifiers';exception when insufficient_privilege then null;end;
 begin perform public.scene_movie_night('share',jsonb_build_object('listId',current_setting('scene.qa_list'),'services',jsonb_build_array('bad-service')));raise exception 'Invalid service accepted';exception when invalid_parameter_value then null;end;
end$$;
reset role;
do $$begin
 if (select count(*) from scene_private.product_reports where reporter_id=current_setting('scene.qa_a')::uuid)<>1 then raise exception 'Duplicate report was inserted';end if;
 if coalesce((select sum(samples) from scene_private.quality_totals),0)<>current_setting('scene.qa_count')::bigint then raise exception 'Opt-out diagnostics were stored';end if;
end$$;
update public.scene_libraries set payload=jsonb_set(payload,'{preferences,sharePerformance}','true') where user_id=current_setting('scene.qa_a')::uuid;
set local role authenticated;
select public.scene_product('quality','{"samples":[{"metric":"load","ms":100}]}'::jsonb);
reset role;
do $$begin if coalesce((select sum(samples) from scene_private.quality_totals),0)<>current_setting('scene.qa_count')::bigint+1 then raise exception 'Opt-in sample was lost';end if;end$$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('scene.qa_b'),'session_id',current_setting('scene.qa_b'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
do $$declare d jsonb;begin
 d:=public.scene_movie_night('share',jsonb_build_object('listId',current_setting('scene.qa_list'),'services',jsonb_build_array('netflix')));
 if not (d->>'ready')::boolean or d->'commonServices'<>'["netflix"]'::jsonb then raise exception 'Shared-service intersection failed';end if;
 if exists(select 1 from public.scene_libraries where user_id=current_setting('scene.qa_a')::uuid) then raise exception 'Movie night exposed a personal library';end if;
end$$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('scene.qa_c'),'session_id',current_setting('scene.qa_c'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
do $$begin begin perform public.scene_movie_night('state',jsonb_build_object('listId',current_setting('scene.qa_list')));raise exception 'Outsider read shared services';exception when insufficient_privilege then null;end;end$$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('scene.qa_a'),'session_id',current_setting('scene.qa_a'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
do $$declare d jsonb;begin
 d:=public.scene_movie_night('share',jsonb_build_object('listId',current_setting('scene.qa_list'),'services','[]'::jsonb));
 if (d->>'ready')::boolean then raise exception 'Withdrawal did not clear consent';end if;
end$$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('scene.qa_o'),'session_id',current_setting('scene.qa_o'),'role','authenticated','aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
set local role authenticated;
do $$declare d jsonb;r jsonb;begin
 d:=public.scene_product('inbox','{}');
 select value into r from jsonb_array_elements(d->'reports') where value->>'id'=current_setting('scene.qa_report');
 if r is null or r?'reporter_id' or r?'email' or r?'user_id' then raise exception 'Feedback inbox exposes identity or lost report';end if;
 perform public.scene_product('status',jsonb_build_object('id',current_setting('scene.qa_report'),'status','resolved'));
end$$;
reset role;
set local role anon;
do $$begin begin perform public.scene_product('inbox','{}');raise exception 'Anonymous access succeeded';exception when insufficient_privilege then null;end;end$$;
reset role;
select 'PASS: report idempotence; email-free owner inbox; owner MFA; member/outsider/anonymous denial; opt-in diagnostics; shared-service consent, intersection and withdrawal; personal-library isolation.' as result;
rollback;
