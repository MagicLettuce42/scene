-- User data exports use the caller's identity, never a supplied account ID.
create table scene_private.account_delete_limits (
 user_id uuid primary key references auth.users(id) on delete cascade,
 window_start timestamptz not null,
 used integer not null check(used>0)
);
alter table scene_private.account_delete_limits enable row level security;
revoke all on scene_private.account_delete_limits from public,anon,authenticated;
create policy "Deletion counters are server-only" on scene_private.account_delete_limits
 to anon,authenticated using(false) with check(false);

create function scene_private.account_data(p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); m public.scene_members%rowtype; state jsonb;
 recent_mfa boolean; deletable boolean; used_count integer;
 hour_start timestamptz:=date_trunc('hour',clock_timestamp());
begin
 if uid is null or not scene_private.session_allowed() then raise insufficient_privilege; end if;
 select * into m from public.scene_members where user_id=uid and active;
 if not found then raise insufficient_privilege;end if;
 if p_action='export' then
  return jsonb_build_object(
   'format','scene-account-export','version',1,'exportedAt',now(),
   'account',jsonb_build_object('id',uid,'email',m.email,'name',m.display_name,'role',m.role,'createdAt',m.created_at),
   'library',coalesce((select payload-'receipts' from public.scene_libraries where user_id=uid),'{}'::jsonb),
   'notificationPreferences',(select jsonb_build_object('availabilityEnabled',availability_enabled,'enabledAt',enabled_at,'updatedAt',updated_at) from public.scene_notification_preferences where user_id=uid),
   'releaseReminders',(select coalesce(jsonb_agg(jsonb_build_object('releaseId',r.release_id,'createdAt',r.created_at,'release',to_jsonb(t)) order by r.created_at),'[]'::jsonb) from public.scene_release_reminders r join public.scene_releases t on t.id=r.release_id where r.user_id=uid),
   'availabilityAlerts',(select coalesce(jsonb_agg(to_jsonb(e)-'user_id' order by e.detected_at),'[]'::jsonb) from public.scene_availability_events e where user_id=uid),
   'watchlistAvailability',(select coalesce(jsonb_agg(jsonb_build_object('key',title_key,'title',title,'services',selected_services,'checkedAt',checked_at)),'[]'::jsonb) from public.scene_watchlist_snapshots where user_id=uid),
   'notificationDevices',(select coalesce(jsonb_agg(jsonb_build_object('registeredAt',created_at)),'[]'::jsonb) from public.scene_push_subscriptions where user_id=uid),
   'ownedSharedLists',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'archived',archived,'createdAt',created_at) order by created_at),'[]'::jsonb) from public.scene_lists where owner_id=uid),
   'sharedListMemberships',(select coalesce(jsonb_agg(jsonb_build_object('listId',l.id,'name',l.name,'joinedAt',mbr.joined_at)),'[]'::jsonb) from public.scene_list_members mbr join public.scene_lists l on l.id=mbr.list_id where mbr.user_id=uid),
   'sharedTitleContributions',(select coalesce(jsonb_agg(jsonb_build_object('listId',list_id,'key',title_key,'title',title,'createdAt',created_at) order by created_at),'[]'::jsonb) from public.scene_list_items where added_by=uid),
   'sharedVotes',(select coalesce(jsonb_agg(jsonb_build_object('listId',v.list_id,'key',v.title_key,'title',i.title,'createdAt',v.created_at)),'[]'::jsonb) from public.scene_list_votes v join public.scene_list_items i on i.list_id=v.list_id and i.title_key=v.title_key where v.user_id=uid),
   'movieNightChoices',(select coalesce(jsonb_agg(jsonb_build_object('listId',list_id,'services',services)),'[]'::jsonb) from scene_private.movie_night_choices where user_id=uid),
   'feedback',(select coalesce(jsonb_agg(to_jsonb(r)-'reporter_id' order by created_at),'[]'::jsonb) from scene_private.product_reports r where reporter_id=uid),
   'invitations',(select coalesce(jsonb_agg(jsonb_build_object('role',role,'createdAt',created_at,'expiresAt',expires_at,'claimedAt',claimed_at)),'[]'::jsonb) from public.scene_invites where claimed_by=uid or lower(email)=lower(m.email)),
   'sharedInvitations',(select coalesce(jsonb_agg(jsonb_build_object('listId',list_id,'createdAt',created_at,'expiresAt',expires_at,'claimedAt',claimed_at,'revoked',revoked)),'[]'::jsonb) from scene_private.list_invites where target_id=uid),
   'releaseEdits',(select coalesce(jsonb_agg(to_jsonb(e)-'actor' order by changed_at),'[]'::jsonb) from scene_private.release_edits e where actor=uid)
  );
 end if;
 if p_action not in ('summary','delete-attempt') then raise invalid_parameter_value;end if;
 state:=scene_private.security_state();
 select exists(select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) a
  where a->>'method'='totp' and case when a->>'timestamp' ~ '^\d{1,12}$'
   then (a->>'timestamp')::bigint between extract(epoch from now())-600 and extract(epoch from now())+60 else false end) into recent_mfa;
 deletable:=m.role<>'owner' or exists(select 1 from public.scene_members where role='owner' and active and user_id<>uid);
 if p_action='delete-attempt' then
  if not deletable then return jsonb_build_object('canDelete',false);end if;
  if (state->>'enrolled')::boolean and not recent_mfa then return jsonb_build_object('canDelete',true,'requiresMfa',true);end if;
  insert into scene_private.account_delete_limits(user_id,window_start,used) values(uid,hour_start,1)
  on conflict(user_id) do update set window_start=hour_start,used=case when account_delete_limits.window_start=hour_start then least(account_delete_limits.used+1,6) else 1 end
  returning used into used_count;
  return jsonb_build_object('canDelete',true,'requiresMfa',false,'allowed',used_count<=5,
   'retryAfter',greatest(1,ceil(extract(epoch from hour_start+interval '1 hour'-clock_timestamp()))::integer));
 end if;
 return jsonb_build_object('canDelete',deletable,'requiresMfa',(state->>'enrolled')::boolean and not recent_mfa,
  'ownedLists',(select count(*) from public.scene_lists where owner_id=uid),
  'sharedContributions',(select count(*) from public.scene_list_items where added_by=uid and list_id in(select id from public.scene_lists where owner_id<>uid)));
end;$$;
revoke all on function scene_private.account_data(text) from public,anon;
grant execute on function scene_private.account_data(text) to authenticated;
create function public.scene_account_data(p_action text) returns jsonb language sql security invoker set search_path=''
as $$select scene_private.account_data(p_action);$$;
revoke all on function public.scene_account_data(text) from public,anon;
grant execute on function public.scene_account_data(text) to authenticated;

-- Auth's hard-delete API executes this inside its own deletion transaction.
-- The FK cascades remove libraries, lists, contributions, votes, reminders,
-- device credentials and sessions. Remove records whose FKs otherwise retain PII.
create function scene_private.before_account_delete() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(721039224,1);
 if exists(select 1 from public.scene_members where user_id=old.id and role='owner')
  and not exists(select 1 from public.scene_members where user_id<>old.id and role='owner' and active) then
  raise exception 'Another active owner must remain.' using errcode='23514';
 end if;
 perform 1 from public.scene_lists where owner_id=old.id or id in(select list_id from public.scene_list_members where user_id=old.id) order by id for update;
 delete from public.scene_invites where claimed_by=old.id or lower(email)=lower(old.email);
 delete from scene_private.product_reports where reporter_id=old.id;
 return old;
end;$$;
revoke all on function scene_private.before_account_delete() from public,anon,authenticated;
create trigger scene_account_delete_cleanup before delete on auth.users
for each row execute function scene_private.before_account_delete();
