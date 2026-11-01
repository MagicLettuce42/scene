-- Narrow generated identity fields without changing authentication, ownership,
-- grants, membership, invitation targeting, or any user's stored email address.
do $privacy$
declare definition text := pg_get_functiondef('scene_private.social(text,jsonb)'::regprocedure);
 old_value text;
 new_value text;
begin
 old_value := $old$'id',i.id,'email',u.email,'expiresAt'$old$;
 new_value := $new$'id',i.id,'name',case when strpos(u.display_name,'@')>0 or btrim(u.display_name)='' then 'Scene member' else u.display_name end,'expiresAt'$new$;
 if strpos(definition,old_value)>0 then definition:=replace(definition,old_value,new_value);
 elsif strpos(definition,new_value)=0 then raise exception 'Unexpected shared invitation response; review before changing it.'; end if;
 old_value := $old$'name',u.display_name$old$;
 new_value := $new$'name',case when strpos(u.display_name,'@')>0 or btrim(u.display_name)='' then 'Scene member' else u.display_name end$new$;
 if strpos(definition,old_value)>0 then definition:=replace(definition,old_value,new_value);
 elsif strpos(definition,new_value)=0 then raise exception 'Unexpected shared people response; review before changing it.'; end if;
 old_value := $old$(select display_name from public.scene_members where user_id=l.owner_id)$old$;
 new_value := $new$(select case when strpos(display_name,'@')>0 or btrim(display_name)='' then 'Scene member' else display_name end from public.scene_members where user_id=l.owner_id)$new$;
 if strpos(definition,old_value)>0 then definition:=replace(definition,old_value,new_value);
 elsif strpos(definition,new_value)=0 then raise exception 'Unexpected shared owner response; review before changing it.'; end if;
 execute definition;
end;
$privacy$;
