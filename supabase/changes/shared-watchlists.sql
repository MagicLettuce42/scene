-- Applied through the hosted migration API. No personal library grants change.
create schema if not exists scene_private;
revoke all on schema scene_private from public, anon;
grant usage on schema scene_private to authenticated;

create table public.scene_lists (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.scene_members(user_id) on delete cascade,
 name text not null check(char_length(btrim(name)) between 1 and 80),
 archived boolean not null default false,
 created_at timestamptz not null default now()
);
create index scene_lists_owner_idx on public.scene_lists(owner_id);
create table public.scene_list_members (
 list_id uuid not null references public.scene_lists(id) on delete cascade,
 user_id uuid not null references public.scene_members(user_id) on delete cascade,
 joined_at timestamptz not null default now(),
 primary key(list_id,user_id)
);
create index scene_list_members_user_idx on public.scene_list_members(user_id,list_id);
create table public.scene_list_items (
 list_id uuid not null references public.scene_lists(id) on delete cascade,
 title_key text not null check(char_length(title_key) between 1 and 100),
 title jsonb not null check(jsonb_typeof(title)='object' and octet_length(title::text)<20000),
 added_by uuid not null references public.scene_members(user_id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(list_id,title_key)
);
create index scene_list_items_added_by_idx on public.scene_list_items(added_by);
create table public.scene_list_votes (
 list_id uuid not null,
 title_key text not null,
 user_id uuid not null references public.scene_members(user_id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(list_id,title_key,user_id),
 foreign key(list_id,title_key) references public.scene_list_items(list_id,title_key) on delete cascade
);
create index scene_list_votes_user_idx on public.scene_list_votes(user_id);
create table scene_private.list_invites (
 id uuid primary key default gen_random_uuid(),
 list_id uuid not null references public.scene_lists(id) on delete cascade,
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 target_id uuid not null references public.scene_members(user_id) on delete cascade,
 expires_at timestamptz not null default (now()+interval '7 days'),
 claimed_at timestamptz,
 revoked boolean not null default false,
 created_at timestamptz not null default now()
);
create index scene_list_invites_list_idx on scene_private.list_invites(list_id);
create index scene_list_invites_target_idx on scene_private.list_invites(target_id);
alter table public.scene_lists enable row level security;
alter table public.scene_list_members enable row level security;
alter table public.scene_list_items enable row level security;
alter table public.scene_list_votes enable row level security;
alter table scene_private.list_invites enable row level security;
revoke all on public.scene_lists,public.scene_list_members,public.scene_list_items,public.scene_list_votes from public,anon,authenticated;
revoke all on scene_private.list_invites from public,anon,authenticated;
grant select on public.scene_lists,public.scene_list_members,public.scene_list_items,public.scene_list_votes to authenticated;

-- Only current active list participants can read. Removing a Scene member is immediate.
-- This private helper avoids recursive membership policies; it takes no caller identity argument.
create function scene_private.list_access(p_list uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null and exists(
  select 1 from public.scene_lists l
  join public.scene_members owner on owner.user_id=l.owner_id and owner.active
  join public.scene_members caller on caller.user_id=(select auth.uid()) and caller.active
  where l.id=p_list and (l.owner_id=(select auth.uid()) or (not l.archived and exists(
   select 1 from public.scene_list_members m where m.list_id=l.id and m.user_id=(select auth.uid())
  )))
 );
$$;
revoke all on function scene_private.list_access(uuid) from public,anon;
grant execute on function scene_private.list_access(uuid) to authenticated;
create policy "Participants read lists" on public.scene_lists for select to authenticated using(scene_private.list_access(id));
create policy "Participants read roster" on public.scene_list_members for select to authenticated using(scene_private.list_access(list_id));
create policy "Participants read titles" on public.scene_list_items for select to authenticated using(scene_private.list_access(list_id));
create policy "Participants read votes" on public.scene_list_votes for select to authenticated using(scene_private.list_access(list_id));

-- Privileged writes are deliberately confined to this private, authenticated transaction.
-- No client has direct INSERT/UPDATE/DELETE rights. IDs never determine caller identity.
create function scene_private.social(p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
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
-- Exposed wrapper remains SECURITY INVOKER. All privilege elevation lives in the private schema.
create function public.scene_social(p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language sql security invoker set search_path='' as $$select scene_private.social(p_action,p_data);$$;
revoke all on function public.scene_social(text,jsonb) from public,anon;
grant execute on function public.scene_social(text,jsonb) to authenticated;

-- Follow-up migration: scene_shared_invitation_policy
create policy "Invitation secrets are inaccessible to clients" on scene_private.list_invites for all to anon,authenticated using(false) with check(false);
