-- Scene uses Supabase Auth identities, with explicit membership in this app.
create table public.scene_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 email text not null,
 display_name text not null check (char_length(display_name) between 1 and 80),
 role text not null default 'member' check (role in ('owner','member')),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
alter table public.scene_members enable row level security;
revoke all on public.scene_members from anon, authenticated;
grant select on public.scene_members to authenticated;
grant all on public.scene_members to service_role;
create policy "Members can read their own membership" on public.scene_members
 for select to authenticated using ((select auth.uid()) = user_id);

create table public.scene_libraries (
 user_id uuid primary key references public.scene_members(user_id) on delete cascade,
 revision bigint not null default 0 check (revision >= 0),
 payload jsonb not null default '{"entries":{},"services":{},"receipts":[]}'::jsonb
  check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 6000000),
 updated_at timestamptz not null default now()
);
alter table public.scene_libraries enable row level security;
revoke all on public.scene_libraries from anon, authenticated;
grant select, insert, update on public.scene_libraries to authenticated;
grant all on public.scene_libraries to service_role;
create policy "Members read their own library" on public.scene_libraries for select to authenticated
 using ((select auth.uid()) = user_id and exists(select 1 from public.scene_members m where m.user_id = (select auth.uid()) and m.active));
create policy "Members create their own library" on public.scene_libraries for insert to authenticated
 with check ((select auth.uid()) = user_id and exists(select 1 from public.scene_members m where m.user_id = (select auth.uid()) and m.active));
create policy "Members update their own library" on public.scene_libraries for update to authenticated
 using ((select auth.uid()) = user_id and exists(select 1 from public.scene_members m where m.user_id = (select auth.uid()) and m.active))
 with check ((select auth.uid()) = user_id and exists(select 1 from public.scene_members m where m.user_id = (select auth.uid()) and m.active));

-- Invite secrets are stored only as SHA-256 hashes and never exposed to users.
create table public.scene_invites (
 token_hash text primary key check (char_length(token_hash) = 64),
 email text not null,
 role text not null default 'member' check (role in ('owner','member')),
 expires_at timestamptz not null,
 created_at timestamptz not null default now(),
 claimed_at timestamptz,
 claimed_by uuid references auth.users(id) on delete set null
);
alter table public.scene_invites enable row level security;
revoke all on public.scene_invites from anon, authenticated;
grant all on public.scene_invites to service_role;
create policy "Invitation records are server-only" on public.scene_invites for all to anon, authenticated using (false) with check (false);
create index scene_invites_claimed_by_idx on public.scene_invites(claimed_by);

-- This transaction is called only by the trusted invitation function.
create function public.scene_redeem_invite(p_hash text, p_user_id uuid, p_email text, p_name text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare invitation public.scene_invites%rowtype;
begin
 select * into invitation from public.scene_invites where token_hash=p_hash for update;
 if not found or lower(invitation.email) <> lower(p_email) then raise exception 'Invalid invitation'; end if;
 if invitation.claimed_at is not null or invitation.expires_at <= now() then raise exception 'Invitation expired or used'; end if;
 insert into public.scene_members(user_id,email,display_name,role,active)
 values(p_user_id,lower(p_email),left(p_name,80),invitation.role,true)
 on conflict(user_id) do update set active=true, display_name=excluded.display_name;
 update public.scene_invites set claimed_at=now(),claimed_by=p_user_id where token_hash=p_hash;
 return jsonb_build_object('accepted',true);
end $$;
revoke all on function public.scene_redeem_invite(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.scene_redeem_invite(text,uuid,text,text) to service_role;
