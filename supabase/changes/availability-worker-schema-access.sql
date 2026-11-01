-- The service-only invoker RPCs need schema lookup permission; function and table grants remain explicit.
grant usage on schema scene_private to service_role;
