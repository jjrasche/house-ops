-- 006_disable_rls_local_dev.sql
-- Disable RLS for local development. No auth wired up yet.
-- Re-enable when auth is implemented.

alter table households disable row level security;
alter table profiles disable row level security;
alter table people disable row level security;
alter table locations disable row level security;
alter table items disable row level security;
alter table actions disable row level security;
alter table conversations disable row level security;
alter table messages disable row level security;
alter table action_log disable row level security;
alter table recipes disable row level security;
alter table meal_plan disable row level security;
