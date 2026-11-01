-- Verified email identities become regular Scene members without owner approval.
-- The private trigger is never callable through the Data API. User metadata is
-- used only for a display name; role and active status are fixed server-side.
create function scene_private.provision_registered_member()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.email is not null and new.email_confirmed_at is not null and not coalesce(new.is_anonymous,false) then
  insert into public.scene_members(user_id,email,display_name,role,active)
  values(new.id,lower(new.email),
   coalesce(nullif(left(trim(new.raw_user_meta_data->>'display_name'),80),''),'Scene member'),
   'member',true)
  on conflict(user_id) do nothing;
 end if;
 return new;
end;
$$;
revoke all on function scene_private.provision_registered_member() from public,anon,authenticated;

create trigger scene_register_verified_user
 after insert or update of email_confirmed_at on auth.users
 for each row execute function scene_private.provision_registered_member();

-- Existing verified identities can also join. Never change an existing role or
-- reactivate a removed membership, including on a later email confirmation.
insert into public.scene_members(user_id,email,display_name,role,active)
select id,lower(email),
 coalesce(nullif(left(trim(raw_user_meta_data->>'display_name'),80),''),'Scene member'),
 'member',true
from auth.users
where email is not null and email_confirmed_at is not null and not coalesce(is_anonymous,false)
on conflict(user_id) do nothing;
