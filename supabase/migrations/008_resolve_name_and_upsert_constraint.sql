-- Migration 008: Return entity_name from resolve_entity_fuzzy RPC,
-- add unique constraint on resolution_context_rules for upsert support.

-- Unique constraint: prevents duplicate verb+mention rules per household.
-- Enables ON CONFLICT upsert in trainResolvePreference.
alter table resolution_context_rules
  add constraint uq_context_rules_household_verb_mention
  unique (household_id, verb, mention);

-- Extend resolve_entity_fuzzy to return the surface_form as entity_name.
-- Callers can display "milk (item)" instead of "item(#1)".
-- Must drop first because return type changed (added entity_name column).
drop function if exists resolve_entity_fuzzy(bigint, text, real);
create or replace function resolve_entity_fuzzy(
  p_household_id bigint,
  p_mention text,
  p_threshold real default 0.3
)
returns table (
  entity_id   bigint,
  entity_type text,
  entity_name text,
  score       real
) as $$
begin
  return query
    select
      el.entity_id,
      el.entity_type,
      el.surface_form as entity_name,
      similarity(el.surface_form, lower(p_mention))::real as score
    from entity_lexicon el
    where el.household_id = p_household_id
      and similarity(el.surface_form, lower(p_mention)) > p_threshold
    order by score desc
    limit 5;
end;
$$ language plpgsql stable;
