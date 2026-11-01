-- Run on the selected Scene database; all fixtures are rolled back.
begin;
do $$
declare qa uuid:=gen_random_uuid(); m public.scene_members%rowtype; owner_count integer;
begin
 select count(*) into owner_count from public.scene_members where role='owner';
 insert into auth.users(id,aud,role,email,raw_user_meta_data,is_anonymous)
 values(qa,'authenticated','authenticated','scene-signup-qa-'||qa::text||'@example.invalid',
  '{"display_name":"Signup verification","role":"owner","active":true}'::jsonb,false);
 if exists(select 1 from public.scene_members where user_id=qa) then raise exception 'Unconfirmed user got membership'; end if;
 update auth.users set email_confirmed_at=now() where id=qa;
 select * into m from public.scene_members where user_id=qa;
 if m.user_id is null or m.role<>'member' or not m.active or m.display_name<>'Signup verification' then raise exception 'Verified signup membership failed'; end if;
 update public.scene_members set active=false where user_id=qa;
 update auth.users set email_confirmed_at=now()+interval '1 second',raw_user_meta_data='{"role":"owner"}'::jsonb where id=qa;
 select * into m from public.scene_members where user_id=qa;
 if m.active or m.role<>'member' then raise exception 'Removed access or role was overwritten'; end if;
 if (select count(*) from public.scene_members where role='owner')<>owner_count then raise exception 'Owner roles changed'; end if;
 if has_function_privilege('anon','scene_private.provision_registered_member()','EXECUTE')
  or has_function_privilege('authenticated','scene_private.provision_registered_member()','EXECUTE') then raise exception 'Provisioning trigger callable by client'; end if;
end $$;
rollback;
