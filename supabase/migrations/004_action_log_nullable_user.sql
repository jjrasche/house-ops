-- 004_action_log_nullable_user.sql
-- Allow action_log inserts before auth is wired up.
-- user_id will become NOT NULL again when auth is implemented.

alter table action_log alter column user_id drop not null;
