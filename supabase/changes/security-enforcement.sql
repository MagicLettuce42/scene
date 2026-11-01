-- Apply after the MFA UI is live. Restrictive policies compose with existing ownership policies.
create policy "Current session required" on public.scene_members as restrictive for select to authenticated
 using ((select (scene_private.security_state()->>'sessionValid')::boolean));
create policy "Current session and MFA required" on public.scene_libraries as restrictive to authenticated
 using ((select scene_private.session_allowed())) with check ((select scene_private.session_allowed()));
create policy "Current session and MFA required" on public.scene_lists as restrictive to authenticated
 using ((select scene_private.session_allowed())) with check ((select scene_private.session_allowed()));
create policy "Current session and MFA required" on public.scene_list_members as restrictive to authenticated
 using ((select scene_private.session_allowed())) with check ((select scene_private.session_allowed()));
create policy "Current session and MFA required" on public.scene_list_items as restrictive to authenticated
 using ((select scene_private.session_allowed())) with check ((select scene_private.session_allowed()));
create policy "Current session and MFA required" on public.scene_list_votes as restrictive to authenticated
 using ((select scene_private.session_allowed())) with check ((select scene_private.session_allowed()));

create or replace function public.scene_redeem_invite(p_hash text, p_user_id uuid, p_email text, p_name text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare invitation public.scene_invites%rowtype;
begin
 select * into invitation from public.scene_invites where token_hash=p_hash for update;
 if not found or lower(invitation.email) <> lower(p_email) then raise exception 'Invalid invitation'; end if;
 if invitation.claimed_at is not null or invitation.expires_at <= now() then raise exception 'Invitation expired or used'; end if;
 insert into public.scene_members(user_id,email,display_name,role,active)
 values(p_user_id,lower(p_email),left(p_name,80),invitation.role,true)
 on conflict(user_id) do update set active=true, display_name=excluded.display_name, sessions_valid_after=now();
 update public.scene_invites set claimed_at=now(),claimed_by=p_user_id where token_hash=p_hash;
 return jsonb_build_object('accepted',true);
end $$;
revoke all on function public.scene_redeem_invite(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.scene_redeem_invite(text,uuid,text,text) to service_role;

create or replace function scene_private.social(p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 caller uuid := (select auth.uid());
 caller_name text;
 l public.scene_lists%rowtype;
 inv scene_private.list_invites%rowtype;
 target uuid;
 item_key text;
 title_data jsonb;
 title_id bigint;
 title_kind text;
 new_id uuid;
 result jsonb;
begin
 if not scene_private.session_allowed() then raise exception 'Complete sign-in and two-factor authentication.' using errcode='42501';end if;
 if caller is null then raise exception 'Sign in to Scene.' using errcode='42501'; end if;
 select display_name into caller_name from public.scene_members where user_id=caller and active;
 if not found then raise exception 'Scene access is required.' using errcode='42501'; end if;
 if jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>40000 then raise exception 'Invalid request.' using errcode='22023'; end if;
 if p_action='lists' then
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'ownerId',a.owner_id,'archived',a.archived,'count',(select count(*) from public.scene_list_items i where i.list_id=a.id),'members',(select count(*) from public.scene_list_members m join public.scene_members u on u.user_id=m.user_id and u.active where m.list_id=a.id)) order by a.created_at desc),'[]'::jsonb) into result from public.scene_lists a where scene_private.list_access(a.id);
  return jsonb_build_object('lists',result);
 end if;
 if p_action='create' then
  if char_length(btrim(coalesce(p_data->>'name',''))) not between 1 and 80 then raise exception 'Use a list name of 1–80 characters.' using errcode='22023'; end if;
  -- Serialize quota checks per owner and make a retried create idempotent.
  perform 1 from public.scene_members where user_id=caller for update;
  new_id:=(p_data->>'id')::uuid;
  if new_id is null then raise exception 'A list ID is required.' using errcode='22023'; end if;
  if exists(select 1 from public.scene_lists where id=new_id and owner_id=caller) then return jsonb_build_object('id',new_id); end if;
  if (select count(*) from public.scene_lists where owner_id=caller and not archived)>=20 then raise exception 'You can have 20 active shared lists. Archive one first.' using errcode='22023'; end if;
  insert into public.scene_lists(id,owner_id,name) values(new_id,caller,btrim(p_data->>'name'));
  insert into public.scene_list_members(list_id,user_id) values(new_id,caller);
  return jsonb_build_object('id',new_id);
 end if;
 if p_action in ('inspect','join') then
  select * into inv from scene_private.list_invites where token_hash=p_data->>'hash' and target_id=caller;
  if not found then raise exception 'This invitation is unavailable for this account.' using errcode='42501'; end if;
  select * into l from public.scene_lists where id=inv.list_id for update;
  -- Re-read after locking the list: cancellation/removal cannot race redemption.
  select * into inv from scene_private.list_invites where id=inv.id;
  if inv.revoked or inv.expires_at<=now() or l.archived or not exists(select 1 from public.scene_members where user_id=l.owner_id and active) then raise exception 'This invitation has expired or was cancelled.' using errcode='42501'; end if;
  if inv.claimed_at is not null then
   if exists(select 1 from public.scene_list_members where list_id=l.id and user_id=caller) then return jsonb_build_object('id',l.id,'name',l.name,'joined',true); end if;
   raise exception 'This invitation has already been used.' using errcode='42501';
  end if;
  if p_action='join' then
   if (select count(*) from public.scene_list_members where list_id=l.id)>=20 then raise exception 'This list has reached 20 people.' using errcode='22023'; end if;
   insert into public.scene_list_members(list_id,user_id) values(l.id,caller) on conflict do nothing;
   update scene_private.list_invites set claimed_at=now() where id=inv.id;
  end if;
  return jsonb_build_object('id',l.id,'name',l.name,'owner',(select display_name from public.scene_members where user_id=l.owner_id),'joined',p_action='join');
 end if;
 select * into l from public.scene_lists where id=(p_data->>'listId')::uuid for update;
 if not found or not scene_private.list_access(l.id) then raise exception 'This shared list is unavailable.' using errcode='42501'; end if;
 if p_action='archive' then
  if l.owner_id<>caller then raise exception 'Only the list owner can archive it.' using errcode='42501'; end if;
  if jsonb_typeof(p_data->'value')<>'boolean' then raise exception 'Invalid archive choice.' using errcode='22023'; end if;
  if (p_data->>'value')::boolean=false and l.archived and (select count(*) from public.scene_lists where owner_id=caller and not archived)>=20 then raise exception 'Archive another list before restoring this one.' using errcode='22023'; end if;
  update public.scene_lists set archived=(p_data->>'value')::boolean where id=l.id;
  update scene_private.list_invites set revoked=true where list_id=l.id and claimed_at is null;
  return jsonb_build_object('ok',true);
 end if;
 if l.archived then raise exception 'Restore this list before using it.' using errcode='22023'; end if;
 if p_action='detail' then
  return jsonb_build_object('id',l.id,'name',l.name,'ownerId',l.owner_id,
   'people',(select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',u.display_name) order by m.joined_at),'[]'::jsonb) from public.scene_list_members m join public.scene_members u on u.user_id=m.user_id and u.active where m.list_id=l.id),
   'items',(select coalesce(jsonb_agg(jsonb_build_object('key',i.title_key,'title',i.title,'addedBy',i.added_by,'votes',(select count(*) from public.scene_list_votes v join public.scene_members u on u.user_id=v.user_id and u.active where v.list_id=i.list_id and v.title_key=i.title_key),'voted',exists(select 1 from public.scene_list_votes v where v.list_id=i.list_id and v.title_key=i.title_key and v.user_id=caller)) order by i.created_at desc),'[]'::jsonb) from public.scene_list_items i where i.list_id=l.id),
   'invites',case when l.owner_id=caller then (select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'email',u.email,'expiresAt',i.expires_at)),'[]'::jsonb) from scene_private.list_invites i join public.scene_members u on u.user_id=i.target_id where i.list_id=l.id and i.claimed_at is null and not i.revoked and i.expires_at>now()) else '[]'::jsonb end);
 end if;
 if p_action='rename' then
  if l.owner_id<>caller then raise exception 'Only the owner can rename this list.' using errcode='42501'; end if;
  if char_length(btrim(coalesce(p_data->>'name',''))) not between 1 and 80 then raise exception 'Use a list name of 1–80 characters.' using errcode='22023'; end if;
  update public.scene_lists set name=btrim(p_data->>'name') where id=l.id;
 elsif p_action='invite' then
  if l.owner_id<>caller then raise exception 'Only the owner can invite people.' using errcode='42501'; end if;
  if coalesce(p_data->>'hash','') !~ '^[a-f0-9]{64}$' then raise exception 'Invalid invitation.' using errcode='22023'; end if;
  select user_id into target from public.scene_members where lower(email)=lower(btrim(p_data->>'email')) and active;
  if not found then raise exception 'Ask this person to join Scene first, then use their Scene email.' using errcode='22023'; end if;
  if exists(select 1 from public.scene_list_members where list_id=l.id and user_id=target) then raise exception 'This person is already in the list.' using errcode='22023'; end if;
  if (select count(*) from public.scene_list_members where list_id=l.id)+(select count(*) from scene_private.list_invites where list_id=l.id and not revoked and claimed_at is null and expires_at>now() and target_id<>target)>=20 then raise exception 'This list has reached 20 people or invitations.' using errcode='22023'; end if;
  update scene_private.list_invites set revoked=true where list_id=l.id and target_id=target and claimed_at is null;
  insert into scene_private.list_invites(list_id,token_hash,target_id) values(l.id,p_data->>'hash',target);
 elsif p_action='cancel-invite' then
  if l.owner_id<>caller then raise exception 'Only the owner can cancel invitations.' using errcode='42501'; end if;
  update scene_private.list_invites set revoked=true where id=(p_data->>'inviteId')::uuid and list_id=l.id;
 elsif p_action in ('remove-person','leave') then
  target:=case when p_action='leave' then caller else (p_data->>'userId')::uuid end;
  if target=l.owner_id or (p_action='remove-person' and caller<>l.owner_id) then raise exception 'This person cannot be removed by you.' using errcode='42501'; end if;
  delete from public.scene_list_votes where list_id=l.id and user_id=target;
  delete from public.scene_list_members where list_id=l.id and user_id=target;
  update scene_private.list_invites set revoked=true where list_id=l.id and target_id=target;
 elsif p_action='add' then
  title_data:=p_data->'title';title_id:=(title_data->>'tmdbId')::bigint;title_kind:=title_data->>'kind';
  if title_id is null or title_id<1 or title_id>2147483647 or title_kind is null or title_kind not in ('movie','series') or char_length(btrim(coalesce(title_data->>'name',''))) not between 1 and 250 then raise exception 'Open a catalogue title before adding it.' using errcode='22023'; end if;
  item_key:='tmdb-'||case when title_kind='movie' then 'movie' else 'tv' end||'-'||title_id;
  if not exists(select 1 from public.scene_list_items where list_id=l.id and title_key=item_key) and (select count(*) from public.scene_list_items where list_id=l.id)>=300 then raise exception 'This list has 300 titles. Remove one first.' using errcode='22023'; end if;
  title_data:=jsonb_build_object('id',item_key,'tmdbId',title_id,'name',title_data->>'name','kind',title_kind,'year',case when (title_data->>'year') ~ '^\d{4}$' then (title_data->>'year')::int else null end,'poster',case when (title_data->>'poster') ~ '^https://image\.tmdb\.org/t/p/[a-zA-Z0-9/_.-]+$' then title_data->>'poster' else null end,'summary',left(coalesce(title_data->>'summary',''),2500),'genres','[]'::jsonb,'runtime',null,'offers','[]'::jsonb,'dataSource','tmdb');
  insert into public.scene_list_items(list_id,title_key,title,added_by) values(l.id,item_key,title_data,caller) on conflict do nothing;
 elsif p_action='remove-title' then
  delete from public.scene_list_items where list_id=l.id and title_key=p_data->>'key' and (added_by=caller or l.owner_id=caller);
  if not found then raise exception 'Only the person who added this title or the owner can remove it.' using errcode='42501'; end if;
 elsif p_action='vote' then
  if jsonb_typeof(p_data->'value')<>'boolean' then raise exception 'Invalid vote.' using errcode='22023'; end if;
  if not exists(select 1 from public.scene_list_items where list_id=l.id and title_key=p_data->>'key') then raise exception 'This title is no longer in the list.' using errcode='22023'; end if;
  if (p_data->>'value')::boolean then insert into public.scene_list_votes(list_id,title_key,user_id) values(l.id,p_data->>'key',caller) on conflict do nothing;
  else delete from public.scene_list_votes where list_id=l.id and title_key=p_data->>'key' and user_id=caller;end if;
 else raise exception 'Unknown shared-list action.' using errcode='22023';
 end if;
 return jsonb_build_object('ok',true,'id',l.id);
end;
$$;
revoke all on function scene_private.social(text,jsonb) from public,anon;
grant execute on function scene_private.social(text,jsonb) to authenticated;
