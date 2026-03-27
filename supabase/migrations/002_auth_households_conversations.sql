-- HouseOps migration 002: Auth, households, conversations, RLS
-- Adds multi-tenancy (households), user profiles linked to auth.users,
-- conversation persistence for NLI context, task recurrence trigger,
-- and row-level security on all tables.

-- ============================================================
-- 1. Households + Profiles
-- ============================================================

CREATE TABLE households (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
    id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    household_id    BIGINT NOT NULL REFERENCES households(id),
    person_id       BIGINT REFERENCES people(id),
    display_name    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_household ON profiles(household_id);

-- Admin must set raw_user_meta_data.household_id when creating users (GOTRUE_DISABLE_SIGNUP=true)
CREATE OR REPLACE FUNCTION create_profile_for_user()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.raw_user_meta_data->>'household_id' IS NULL THEN
        RAISE EXCEPTION 'household_id required in user metadata when creating a user';
    END IF;

    INSERT INTO public.profiles (id, household_id, display_name)
    VALUES (
        NEW.id,
        (NEW.raw_user_meta_data->>'household_id')::BIGINT,
        COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_new_user
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION create_profile_for_user();

-- ============================================================
-- 2. Add household_id to all existing tables
-- ============================================================
-- Tables are empty (no production data), so NOT NULL is safe.

ALTER TABLE people              ADD COLUMN household_id BIGINT NOT NULL REFERENCES households(id);
ALTER TABLE locations           ADD COLUMN household_id BIGINT NOT NULL REFERENCES households(id);
ALTER TABLE inventory           ADD COLUMN household_id BIGINT NOT NULL REFERENCES households(id);
ALTER TABLE tasks               ADD COLUMN household_id BIGINT NOT NULL REFERENCES households(id);
ALTER TABLE events              ADD COLUMN household_id BIGINT NOT NULL REFERENCES households(id);
ALTER TABLE recipes             ADD COLUMN household_id BIGINT NOT NULL REFERENCES households(id);
ALTER TABLE recipe_steps        ADD COLUMN household_id BIGINT NOT NULL REFERENCES households(id);
ALTER TABLE recipe_ingredients  ADD COLUMN household_id BIGINT NOT NULL REFERENCES households(id);
ALTER TABLE meal_plan           ADD COLUMN household_id BIGINT NOT NULL REFERENCES households(id);
ALTER TABLE shopping_list_items ADD COLUMN household_id BIGINT NOT NULL REFERENCES households(id);
ALTER TABLE person_attributes   ADD COLUMN household_id BIGINT NOT NULL REFERENCES households(id);
ALTER TABLE relationship_dates  ADD COLUMN household_id BIGINT NOT NULL REFERENCES households(id);
ALTER TABLE action_log          ADD COLUMN household_id BIGINT NOT NULL REFERENCES households(id);

-- Indexes on household_id for all tables
CREATE INDEX idx_people_household              ON people(household_id);
CREATE INDEX idx_locations_household           ON locations(household_id);
CREATE INDEX idx_inventory_household           ON inventory(household_id);
CREATE INDEX idx_tasks_household               ON tasks(household_id);
CREATE INDEX idx_events_household              ON events(household_id);
CREATE INDEX idx_recipes_household             ON recipes(household_id);
CREATE INDEX idx_recipe_steps_household        ON recipe_steps(household_id);
CREATE INDEX idx_recipe_ingredients_household  ON recipe_ingredients(household_id);
CREATE INDEX idx_meal_plan_household           ON meal_plan(household_id);
CREATE INDEX idx_shopping_items_household      ON shopping_list_items(household_id);
CREATE INDEX idx_person_attrs_household        ON person_attributes(household_id);
CREATE INDEX idx_relationship_dates_household  ON relationship_dates(household_id);
CREATE INDEX idx_action_log_household          ON action_log(household_id);

-- Auto-inherit household_id from parent recipe for child tables.
-- Allows INSERT without explicit household_id when recipe_id is provided.
CREATE OR REPLACE FUNCTION inherit_recipe_household()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.household_id IS NULL THEN
        NEW.household_id := (SELECT household_id FROM recipes WHERE id = NEW.recipe_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recipe_steps_household
    BEFORE INSERT ON recipe_steps
    FOR EACH ROW
    EXECUTE FUNCTION inherit_recipe_household();

CREATE TRIGGER trg_recipe_ingredients_household
    BEFORE INSERT ON recipe_ingredients
    FOR EACH ROW
    EXECUTE FUNCTION inherit_recipe_household();

-- ============================================================
-- 3. Conversations + Messages (NLI context persistence)
-- ============================================================

CREATE TABLE conversations (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    household_id    BIGINT NOT NULL REFERENCES households(id),
    user_id         UUID NOT NULL REFERENCES profiles(id),
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE messages (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content         TEXT,
    tool_calls      JSONB,
    tool_call_id    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversations_household ON conversations(household_id);
CREATE INDEX idx_conversations_user      ON conversations(user_id);
CREATE INDEX idx_messages_conversation   ON messages(conversation_id);

-- Link action_log to conversations for audit trail
ALTER TABLE action_log ADD COLUMN conversation_id BIGINT REFERENCES conversations(id);
ALTER TABLE action_log ADD COLUMN message_id      BIGINT REFERENCES messages(id);
ALTER TABLE action_log ADD COLUMN user_id         UUID REFERENCES profiles(id);

CREATE INDEX idx_action_log_conversation ON action_log(conversation_id);

-- ============================================================
-- 4. Task recurrence trigger
-- ============================================================

CREATE OR REPLACE FUNCTION advance_task_recurrence()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'done' AND OLD.status != 'done'
       AND NEW.recurrence_interval IS NOT NULL
       AND NEW.recurrence_unit IS NOT NULL THEN
        NEW.last_completed_at := now();
        NEW.next_due_at := now() + (NEW.recurrence_interval || ' ' || NEW.recurrence_unit)::INTERVAL;
        NEW.status := 'pending';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_task_completion
    BEFORE UPDATE OF status ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION advance_task_recurrence();

-- ============================================================
-- 5. Fix pg_cron jobs for household_id
-- ============================================================
-- Unschedule existing jobs that INSERT without household_id,
-- then recreate with household_id from source rows.
-- flag-overdue-tasks is UPDATE-only, no change needed.

SELECT cron.unschedule('create-maintenance-reminders');
SELECT cron.unschedule('check-relationship-dates');
SELECT cron.unschedule('check-stale-sizes');

-- Maintenance reminders: inherit household_id from source task
SELECT cron.schedule(
    'create-maintenance-reminders',
    '0 8 * * *',
    $$
        INSERT INTO events (title, description, category, date, source, household_id)
        SELECT
            'Maintenance: ' || t.title,
            t.description,
            'maintenance',
            t.next_due_at,
            'system',
            t.household_id
        FROM tasks t
        WHERE t.category = 'maintenance'
          AND t.recurrence_interval IS NOT NULL
          AND t.next_due_at <= now() + INTERVAL '14 days'
          AND t.status != 'done'
          AND NOT EXISTS (
              SELECT 1 FROM events e
              WHERE e.title = 'Maintenance: ' || t.title
                AND e.date = t.next_due_at
                AND e.source = 'system'
          );
    $$
);

-- Relationship date reminders: inherit household_id from relationship_dates
SELECT cron.schedule(
    'check-relationship-dates',
    '0 8 * * 1',
    $$
        INSERT INTO events (title, category, date, person_id, source, household_id)
        SELECT
            CASE rd.type
                WHEN 'partner' THEN 'Date night overdue'
                WHEN 'parent_child' THEN 'One-on-one with ' || p.name || ' overdue'
            END,
            'relationship',
            now(),
            rd.person_id,
            'system',
            rd.household_id
        FROM relationship_dates rd
        LEFT JOIN people p ON p.id = rd.person_id
        WHERE rd.last_occurred_at IS NULL
           OR rd.last_occurred_at + (rd.target_frequency_days || ' days')::INTERVAL < now();
    $$
);

-- Stale sizes check: inherit household_id from person_attributes
SELECT cron.schedule(
    'check-stale-sizes',
    '0 8 1 * *',
    $$
        INSERT INTO tasks (title, category, assigned_to, status, due_date, source, household_id)
        SELECT
            'Check ' || p.name || '''s ' || pa.attribute_type,
            'kids',
            NULL,
            'pending',
            now() + INTERVAL '7 days',
            'system',
            pa.household_id
        FROM person_attributes pa
        JOIN people p ON p.id = pa.person_id
        WHERE p.role = 'child'
          AND pa.attribute_type LIKE '%size%'
          AND pa.recorded_at < now() - INTERVAL '6 months'
          AND pa.id = (
              SELECT pa2.id FROM person_attributes pa2
              WHERE pa2.person_id = pa.person_id
                AND pa2.attribute_type = pa.attribute_type
              ORDER BY pa2.recorded_at DESC
              LIMIT 1
          )
          AND NOT EXISTS (
              SELECT 1 FROM tasks t
              WHERE t.title = 'Check ' || p.name || '''s ' || pa.attribute_type
                AND t.status != 'done'
          );
    $$
);

-- ============================================================
-- 6. Row-Level Security
-- ============================================================

-- Helper: resolve current user's household_id once per query.
-- SECURITY DEFINER so it can read profiles regardless of RLS.
-- STABLE so Postgres caches the result within a single statement.
CREATE OR REPLACE FUNCTION current_household_id()
RETURNS BIGINT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT household_id FROM public.profiles WHERE id = auth.uid()
$$;

-- Enable RLS and create policies for all tables with household_id.
-- Pattern: authenticated users see only their household's rows.

-- households: users see only their own household
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own household" ON households
    FOR ALL USING (id = current_household_id());

-- profiles: users see profiles in their household
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see household profiles" ON profiles
    FOR ALL USING (household_id = current_household_id());

-- Core tables
ALTER TABLE people ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Household isolation" ON people
    FOR ALL USING (household_id = current_household_id());

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Household isolation" ON locations
    FOR ALL USING (household_id = current_household_id());

ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Household isolation" ON inventory
    FOR ALL USING (household_id = current_household_id());

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Household isolation" ON tasks
    FOR ALL USING (household_id = current_household_id());

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Household isolation" ON events
    FOR ALL USING (household_id = current_household_id());

-- Feature tables
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Household isolation" ON recipes
    FOR ALL USING (household_id = current_household_id());

ALTER TABLE recipe_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Household isolation" ON recipe_steps
    FOR ALL USING (household_id = current_household_id());

ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Household isolation" ON recipe_ingredients
    FOR ALL USING (household_id = current_household_id());

ALTER TABLE meal_plan ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Household isolation" ON meal_plan
    FOR ALL USING (household_id = current_household_id());

ALTER TABLE shopping_list_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Household isolation" ON shopping_list_items
    FOR ALL USING (household_id = current_household_id());

ALTER TABLE person_attributes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Household isolation" ON person_attributes
    FOR ALL USING (household_id = current_household_id());

ALTER TABLE relationship_dates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Household isolation" ON relationship_dates
    FOR ALL USING (household_id = current_household_id());

-- Conversations + Messages: household isolation
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Household isolation" ON conversations
    FOR ALL USING (household_id = current_household_id());

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own conversation messages" ON messages
    FOR ALL USING (
        conversation_id IN (
            SELECT id FROM conversations WHERE household_id = current_household_id()
        )
    );

-- action_log: household isolation
ALTER TABLE action_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Household isolation" ON action_log
    FOR ALL USING (household_id = current_household_id());
