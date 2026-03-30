-- 001_core_tables.sql
-- Core operational tables: households, profiles, people, items, actions, locations.
-- Plus conversations, messages, action_log, recipes.

-- Extensions ------------------------------------------------------------------

create extension if not exists pg_trgm;

-- Households ------------------------------------------------------------------

create table households (
  id          bigint generated always as identity primary key,
  name        text not null,
  created_at  timestamptz not null default now()
);

alter table households enable row level security;

create policy "members see own household"
  on households for select
  using (id in (select household_id from profiles where id = auth.uid()));

-- Profiles (linked to Supabase auth.users) ------------------------------------

create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  household_id  bigint not null references households(id),
  display_name  text,
  created_at    timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "users see own profile"
  on profiles for select using (id = auth.uid());

create policy "users see household members"
  on profiles for select
  using (household_id in (select household_id from profiles where id = auth.uid()));

-- People ----------------------------------------------------------------------

create table people (
  id            bigint generated always as identity primary key,
  household_id  bigint not null references households(id),
  name          text not null,
  role          text not null default 'member',
  created_at    timestamptz not null default now()
);

alter table people enable row level security;

create policy "household isolation"
  on people for all
  using (household_id in (select household_id from profiles where id = auth.uid()));

-- Locations -------------------------------------------------------------------

create table locations (
  id                  bigint generated always as identity primary key,
  household_id        bigint not null references households(id),
  name                text not null,
  parent_location_id  bigint references locations(id),
  created_at          timestamptz not null default now()
);

alter table locations enable row level security;

create policy "household isolation"
  on locations for all
  using (household_id in (select household_id from profiles where id = auth.uid()));

-- Items -----------------------------------------------------------------------
-- Replaces inventory + products + shopping_list_items.
-- Status column drives state: stocked → needed → on_list → purchased → stocked.

create table items (
  id                  bigint generated always as identity primary key,
  household_id        bigint not null references households(id),
  name                text not null,
  category            text,
  quantity            numeric not null default 0,
  unit                text,
  location_id         bigint references locations(id),
  reorder_threshold   numeric,
  status              text not null default 'stocked'
                        check (status in ('stocked', 'needed', 'on_list', 'purchased')),
  store               text,
  brand               text,
  person_id           bigint references people(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table items enable row level security;

create policy "household isolation"
  on items for all
  using (household_id in (select household_id from profiles where id = auth.uid()));

create index idx_items_household_status on items (household_id, status);
create index idx_items_name_trgm on items using gin (name gin_trgm_ops);

-- Actions ---------------------------------------------------------------------
-- Replaces tasks + events + reminders. Type is emergent from which time
-- columns are filled, not a stored column.

create table actions (
  id                bigint generated always as identity primary key,
  household_id      bigint not null references households(id),
  title             text not null,
  description       text,
  category          text,
  status            text not null default 'pending'
                      check (status in ('pending', 'done', 'dismissed', 'missed')),
  starts_at         timestamptz,
  ends_at           timestamptz,
  due_at            timestamptz,
  all_day           boolean not null default false,
  recurrence_rule   text,
  assigned_to       bigint references people(id),
  person_id         bigint references people(id),
  source_id         bigint references actions(id),
  location          text,
  source            text not null default 'user'
                      check (source in ('user', 'system')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table actions enable row level security;

create policy "household isolation"
  on actions for all
  using (household_id in (select household_id from profiles where id = auth.uid()));

create index idx_actions_household_status on actions (household_id, status);
create index idx_actions_starts_at on actions (starts_at) where starts_at is not null;
create index idx_actions_due_at on actions (due_at) where due_at is not null;

-- Conversations + Messages (NLI context persistence) --------------------------

create table conversations (
  id            bigint generated always as identity primary key,
  household_id  bigint not null references households(id),
  user_id       uuid not null references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table conversations enable row level security;

create policy "users see own conversations"
  on conversations for all
  using (user_id = auth.uid());

create table messages (
  id                bigint generated always as identity primary key,
  conversation_id   bigint not null references conversations(id) on delete cascade,
  role              text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content           text,
  tool_calls        jsonb,
  tool_call_id      text,
  created_at        timestamptz not null default now()
);

alter table messages enable row level security;

create policy "users see own messages"
  on messages for all
  using (conversation_id in (
    select id from conversations where user_id = auth.uid()
  ));

create index idx_messages_conversation on messages (conversation_id, created_at);

-- Action log (tool execution audit trail) -------------------------------------

create table action_log (
  id                bigint generated always as identity primary key,
  household_id      bigint not null references households(id),
  user_id           uuid not null references auth.users(id),
  conversation_id   bigint references conversations(id),
  tool_name         text not null,
  tool_params       jsonb not null,
  result            jsonb,
  status            text not null default 'pending'
                      check (status in ('pending', 'confirmed', 'executed', 'rejected', 'failed')),
  pipeline_path     text check (pipeline_path in ('deterministic', 'llm')),
  confidence        numeric,
  created_at        timestamptz not null default now()
);

alter table action_log enable row level security;

create policy "household isolation"
  on action_log for all
  using (household_id in (select household_id from profiles where id = auth.uid()));

-- Recipes ---------------------------------------------------------------------

create table recipes (
  id            bigint generated always as identity primary key,
  household_id  bigint not null references households(id),
  name          text not null,
  description   text,
  method        text,
  prep_time_min integer,
  cook_time_min integer,
  servings      integer,
  source        text,
  created_at    timestamptz not null default now()
);

alter table recipes enable row level security;

create policy "household isolation"
  on recipes for all
  using (household_id in (select household_id from profiles where id = auth.uid()));

create table recipe_steps (
  id          bigint generated always as identity primary key,
  recipe_id   bigint not null references recipes(id) on delete cascade,
  step_number integer not null,
  instruction text not null,
  duration_min integer
);

create table recipe_ingredients (
  id          bigint generated always as identity primary key,
  recipe_id   bigint not null references recipes(id) on delete cascade,
  name        text not null,
  quantity    numeric,
  unit        text,
  item_id     bigint references items(id),
  optional    boolean not null default false
);

create table meal_plan (
  id            bigint generated always as identity primary key,
  household_id  bigint not null references households(id),
  recipe_id     bigint references recipes(id),
  meal_type     text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  planned_date  date not null,
  servings      integer,
  notes         text,
  created_at    timestamptz not null default now()
);

alter table meal_plan enable row level security;

create policy "household isolation"
  on meal_plan for all
  using (household_id in (select household_id from profiles where id = auth.uid()));

-- Person attributes (EAV, subsumed by kg_edges later) -------------------------

create table person_attributes (
  id          bigint generated always as identity primary key,
  person_id   bigint not null references people(id) on delete cascade,
  attribute   text not null,
  value       text not null,
  source      text not null default 'user'
                check (source in ('seed', 'llm_candidate', 'user_confirmed')),
  created_at  timestamptz not null default now()
);

create index idx_person_attributes_person on person_attributes (person_id);

-- Triggers: updated_at --------------------------------------------------------

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_items_updated_at
  before update on items
  for each row execute function set_updated_at();

create trigger trg_actions_updated_at
  before update on actions
  for each row execute function set_updated_at();

create trigger trg_conversations_updated_at
  before update on conversations
  for each row execute function set_updated_at();

-- Triggers: item status transitions -------------------------------------------
-- When quantity drops to 0 or below reorder_threshold, auto-set status=needed.

create or replace function check_item_reorder()
returns trigger as $$
begin
  if new.quantity <= 0 and new.status = 'stocked' then
    new.status := 'needed';
  elsif new.reorder_threshold is not null
    and new.quantity <= new.reorder_threshold
    and new.status = 'stocked' then
    new.status := 'needed';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_item_reorder
  before update of quantity on items
  for each row execute function check_item_reorder();

-- Trigger: action recurrence --------------------------------------------------
-- On completing a recurring action, create the next occurrence.

create or replace function spawn_next_recurrence()
returns trigger as $$
declare
  next_starts timestamptz;
  next_due    timestamptz;
  interval_val interval;
begin
  if new.status = 'done'
    and old.status != 'done'
    and new.recurrence_rule is not null then

    -- Parse simple RRULE (FREQ=DAILY/WEEKLY/MONTHLY/YEARLY)
    interval_val := case
      when new.recurrence_rule ilike '%FREQ=DAILY%' then interval '1 day'
      when new.recurrence_rule ilike '%FREQ=WEEKLY%' then interval '1 week'
      when new.recurrence_rule ilike '%FREQ=MONTHLY%' then interval '1 month'
      when new.recurrence_rule ilike '%FREQ=YEARLY%' then interval '1 year'
      else null
    end;

    if interval_val is null then return new; end if;

    next_starts := case when new.starts_at is not null
      then new.starts_at + interval_val else null end;
    next_due := case when new.due_at is not null
      then new.due_at + interval_val else null end;

    insert into actions (
      household_id, title, description, category, status,
      starts_at, ends_at, due_at, all_day, recurrence_rule,
      assigned_to, person_id, source_id, location, source
    ) values (
      new.household_id, new.title, new.description, new.category, 'pending',
      next_starts,
      case when new.ends_at is not null and new.starts_at is not null
        then next_starts + (new.ends_at - new.starts_at) else null end,
      next_due, new.all_day, new.recurrence_rule,
      new.assigned_to, new.person_id, new.id, new.location, 'system'
    );
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_action_recurrence
  after update of status on actions
  for each row execute function spawn_next_recurrence();
