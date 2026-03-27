-- HouseOps initial schema
-- Shared core tables. Features are filtered views + scoped injection.

-- Extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================
-- Core tables
-- ============================================================

CREATE TABLE people (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        TEXT NOT NULL,
    role        TEXT NOT NULL CHECK (role IN ('adult', 'child')),
    color       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE locations (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name                TEXT NOT NULL,
    parent_location_id  BIGINT REFERENCES locations(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE inventory (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name                TEXT NOT NULL,
    location_id         BIGINT REFERENCES locations(id),
    category            TEXT,
    quantity            NUMERIC DEFAULT 0,
    unit                TEXT,
    reorder_threshold   NUMERIC DEFAULT 0,
    status              TEXT NOT NULL DEFAULT 'stocked'
                        CHECK (status IN ('stocked', 'low', 'needed', 'out')),
    last_restocked_at   TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tasks (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title               TEXT NOT NULL,
    description         TEXT,
    category            TEXT,
    assigned_to         BIGINT REFERENCES people(id),
    inventory_id        BIGINT REFERENCES inventory(id),
    status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'active', 'done', 'overdue')),
    due_date            TIMESTAMPTZ,
    recurrence_interval INTEGER,
    recurrence_unit     TEXT CHECK (recurrence_unit IN ('days', 'weeks', 'months', 'years')),
    last_completed_at   TIMESTAMPTZ,
    next_due_at         TIMESTAMPTZ,
    source              TEXT NOT NULL DEFAULT 'manual'
                        CHECK (source IN ('manual', 'system')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE events (
    id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title                       TEXT NOT NULL,
    description                 TEXT,
    category                    TEXT,
    date                        TIMESTAMPTZ NOT NULL,
    end_date                    TIMESTAMPTZ,
    all_day                     BOOLEAN NOT NULL DEFAULT false,
    person_id                   BIGINT REFERENCES people(id),
    source                      TEXT NOT NULL DEFAULT 'manual'
                                CHECK (source IN ('manual', 'system')),
    google_calendar_event_id    TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Feature tables (still shared, scoped by queries)
-- ============================================================

CREATE TABLE recipes (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name                TEXT NOT NULL,
    method              TEXT CHECK (method IN ('instant_pot', 'air_fryer', 'stovetop', 'oven', 'grill', 'other')),
    prep_time_minutes   INTEGER,
    tags                TEXT[],
    rating              NUMERIC CHECK (rating >= 0 AND rating <= 10),
    notes               TEXT,
    last_served_at      TIMESTAMPTZ,
    times_served        INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE recipe_steps (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    recipe_id           BIGINT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    step_number         INTEGER NOT NULL,
    instruction         TEXT NOT NULL,
    duration_minutes    INTEGER,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (recipe_id, step_number)
);

CREATE TABLE recipe_ingredients (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    recipe_id       BIGINT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    inventory_id    BIGINT REFERENCES inventory(id),
    name            TEXT NOT NULL,
    quantity        NUMERIC,
    unit            TEXT
);

CREATE TABLE meal_plan (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    date        DATE NOT NULL,
    meal        TEXT NOT NULL CHECK (meal IN ('breakfast', 'lunch', 'dinner', 'snack')),
    recipe_id   BIGINT REFERENCES recipes(id),
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE shopping_list_items (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    inventory_id    BIGINT REFERENCES inventory(id),
    name            TEXT,
    quantity_needed NUMERIC,
    store_section   TEXT,
    source          TEXT NOT NULL DEFAULT 'manual'
                    CHECK (source IN ('manual', 'auto_restock', 'meal_plan')),
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'purchased')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE person_attributes (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    person_id       BIGINT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    attribute_type  TEXT NOT NULL,
    value           TEXT NOT NULL,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE relationship_dates (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    type                    TEXT NOT NULL CHECK (type IN ('partner', 'parent_child')),
    person_id               BIGINT REFERENCES people(id),
    target_frequency_days   INTEGER NOT NULL,
    last_occurred_at        TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE action_log (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    input_text      TEXT NOT NULL,
    model_used      TEXT,
    proposed_action JSONB,
    confirmed       BOOLEAN,
    escalated       BOOLEAN NOT NULL DEFAULT false,
    executed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_inventory_status ON inventory(status);
CREATE INDEX idx_inventory_location ON inventory(location_id);
CREATE INDEX idx_inventory_category ON inventory(category);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_category ON tasks(category);
CREATE INDEX idx_tasks_next_due ON tasks(next_due_at);
CREATE INDEX idx_events_date ON events(date);
CREATE INDEX idx_events_person ON events(person_id);
CREATE INDEX idx_shopping_status ON shopping_list_items(status);
CREATE INDEX idx_person_attrs ON person_attributes(person_id, attribute_type);
CREATE INDEX idx_meal_plan_date ON meal_plan(date);
CREATE INDEX idx_locations_parent ON locations(parent_location_id);

-- ============================================================
-- Triggers: Tier 1 (data-to-data, same transaction)
-- ============================================================

-- When inventory quantity drops to or below reorder_threshold, auto-add to shopping list
CREATE OR REPLACE FUNCTION handle_low_inventory()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.quantity <= NEW.reorder_threshold
       AND (OLD.quantity IS NULL OR OLD.quantity > OLD.reorder_threshold) THEN

        INSERT INTO shopping_list_items (inventory_id, name, quantity_needed, source)
        VALUES (NEW.id, NEW.name, NEW.reorder_threshold - NEW.quantity + 1, 'auto_restock')
        ON CONFLICT DO NOTHING;

        NEW.status := 'needed';
    END IF;

    IF NEW.quantity > NEW.reorder_threshold AND OLD.status != 'stocked' THEN
        NEW.status := 'stocked';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_low_inventory
    BEFORE UPDATE OF quantity ON inventory
    FOR EACH ROW
    EXECUTE FUNCTION handle_low_inventory();

-- When shopping list item is purchased, restock the linked inventory item
CREATE OR REPLACE FUNCTION handle_item_purchased()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'purchased' AND OLD.status = 'pending' AND NEW.inventory_id IS NOT NULL THEN
        UPDATE inventory
        SET status = 'stocked',
            last_restocked_at = now(),
            quantity = quantity + COALESCE(NEW.quantity_needed, 1)
        WHERE id = NEW.inventory_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_item_purchased
    AFTER UPDATE OF status ON shopping_list_items
    FOR EACH ROW
    EXECUTE FUNCTION handle_item_purchased();

-- When a meal plan entry is created, diff ingredients against inventory
CREATE OR REPLACE FUNCTION handle_meal_plan_insert()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO shopping_list_items (inventory_id, name, quantity_needed, source)
    SELECT
        ri.inventory_id,
        ri.name,
        ri.quantity,
        'meal_plan'
    FROM recipe_ingredients ri
    LEFT JOIN inventory inv ON inv.id = ri.inventory_id
    WHERE ri.recipe_id = NEW.recipe_id
      AND (ri.inventory_id IS NULL OR inv.quantity < ri.quantity)
      AND NOT EXISTS (
          SELECT 1 FROM shopping_list_items sli
          WHERE sli.inventory_id = ri.inventory_id
            AND sli.status = 'pending'
      );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_meal_plan_shopping
    AFTER INSERT ON meal_plan
    FOR EACH ROW
    EXECUTE FUNCTION handle_meal_plan_insert();

-- ============================================================
-- pg_cron jobs: Tier 2 (scheduled checks)
-- ============================================================

-- Flip overdue tasks every hour
SELECT cron.schedule(
    'flag-overdue-tasks',
    '0 * * * *',
    $$
        UPDATE tasks
        SET status = 'overdue'
        WHERE status IN ('pending', 'active')
          AND next_due_at < now();
    $$
);

-- Check maintenance tasks due within 14 days, create events
SELECT cron.schedule(
    'create-maintenance-reminders',
    '0 8 * * *',
    $$
        INSERT INTO events (title, description, category, date, source)
        SELECT
            'Maintenance: ' || t.title,
            t.description,
            'maintenance',
            t.next_due_at,
            'system'
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

-- Check relationship date frequency, create reminder events
SELECT cron.schedule(
    'check-relationship-dates',
    '0 8 * * 1',
    $$
        INSERT INTO events (title, category, date, person_id, source)
        SELECT
            CASE rd.type
                WHEN 'partner' THEN 'Date night overdue'
                WHEN 'parent_child' THEN 'One-on-one with ' || p.name || ' overdue'
            END,
            'relationship',
            now(),
            rd.person_id,
            'system'
        FROM relationship_dates rd
        LEFT JOIN people p ON p.id = rd.person_id
        WHERE rd.last_occurred_at IS NULL
           OR rd.last_occurred_at + (rd.target_frequency_days || ' days')::INTERVAL < now();
    $$
);

-- Flag stale person attributes (sizes not updated in 6+ months for children)
SELECT cron.schedule(
    'check-stale-sizes',
    '0 8 1 * *',
    $$
        INSERT INTO tasks (title, category, assigned_to, status, due_date, source)
        SELECT
            'Check ' || p.name || '''s ' || pa.attribute_type,
            'kids',
            NULL,
            'pending',
            now() + INTERVAL '7 days',
            'system'
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
