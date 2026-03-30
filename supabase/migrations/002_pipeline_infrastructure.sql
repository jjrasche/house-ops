-- 002_pipeline_infrastructure.sql
-- Pipeline tables: entity_lexicon, verb_tool_lookup, quantity units,
-- stage_executions, resolution rules, knowledge graph, edge types.

-- Entity lexicon --------------------------------------------------------------
-- Surface forms for gazetteer scan. Triggers on core tables auto-populate.

create table entity_lexicon (
  id              bigint generated always as identity primary key,
  household_id    bigint not null references households(id),
  surface_form    text not null,
  entity_type     text not null,
  entity_id       bigint not null,
  source          text not null default 'seed'
                    check (source in ('seed', 'llm_candidate', 'user_confirmed')),
  created_at      timestamptz not null default now()
);

create index idx_lexicon_household_surface
  on entity_lexicon (household_id, lower(surface_form));
create index idx_lexicon_surface_trgm
  on entity_lexicon using gin (surface_form gin_trgm_ops);

-- Verb → tool lookup ----------------------------------------------------------
-- Deterministic classifier. verb + sorted entity_types[] → tool_name.

create table verb_tool_lookup (
  id              bigint generated always as identity primary key,
  household_id    bigint not null references households(id),
  verb            text not null,
  entity_types    text[] not null default '{}',
  tool_name       text not null,
  confidence      numeric not null default 0.90,
  source          text not null default 'seed'
                    check (source in ('seed', 'llm_candidate', 'user_confirmed')),
  created_at      timestamptz not null default now()
);

create index idx_verb_tool_lookup
  on verb_tool_lookup (household_id, verb);

-- Quantity units + aliases ----------------------------------------------------

create table quantity_units (
  id            bigint generated always as identity primary key,
  canonical     text not null unique,
  display_name  text not null
);

create table quantity_unit_aliases (
  id          bigint generated always as identity primary key,
  unit_id     bigint not null references quantity_units(id) on delete cascade,
  alias       text not null unique,
  source      text not null default 'seed'
                check (source in ('seed', 'llm_candidate', 'user_confirmed'))
);

-- Stage executions (I/O logging) ----------------------------------------------

create table stage_executions (
  id                bigint generated always as identity primary key,
  household_id      bigint not null references households(id),
  conversation_id   bigint references conversations(id),
  stage             text not null,
  input_payload     jsonb not null,
  output_payload    jsonb not null,
  confidence        numeric,
  duration_ms       integer,
  model_version     text,
  user_verdict      text check (user_verdict in ('correct', 'incorrect')),
  created_at        timestamptz not null default now()
);

create index idx_stage_executions_household
  on stage_executions (household_id, stage, created_at desc);

-- Resolution context rules ----------------------------------------------------
-- Learned: "feed" + "Charlie" prefers the cat, not the child.

create table resolution_context_rules (
  id              bigint generated always as identity primary key,
  household_id    bigint not null references households(id),
  verb            text not null,
  mention         text not null,
  preferred_id    bigint not null,
  preferred_type  text not null,
  source          text not null default 'seed'
                    check (source in ('seed', 'llm_candidate', 'user_confirmed')),
  created_at      timestamptz not null default now()
);

-- Context relevance weights ---------------------------------------------------
-- Beta distribution per (intent, edge_type). Trained from user feedback.

create table context_relevance_weights (
  id            bigint generated always as identity primary key,
  household_id  bigint not null references households(id),
  intent_class  text not null,
  edge_type     text not null,
  alpha         real not null default 1.0,
  beta          real not null default 1.0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (household_id, intent_class, edge_type)
);

-- Intent few-shots ------------------------------------------------------------

create table intent_few_shots (
  id            bigint generated always as identity primary key,
  household_id  bigint not null references households(id),
  input_text    text not null,
  tool_name     text not null,
  source        text not null default 'seed'
                  check (source in ('seed', 'llm_candidate', 'user_confirmed')),
  created_at    timestamptz not null default now()
);

-- Tool call examples ----------------------------------------------------------

create table tool_call_examples (
  id              bigint generated always as identity primary key,
  household_id    bigint not null references households(id),
  input_text      text not null,
  tool_name       text not null,
  tool_params     jsonb not null,
  source          text not null default 'seed'
                    check (source in ('seed', 'llm_candidate', 'user_confirmed')),
  created_at      timestamptz not null default now()
);

-- Edge type registry (hierarchical) -------------------------------------------

create table edge_type_registry (
  id            text primary key,
  parent_id     text references edge_type_registry(id),
  display_name  text not null,
  description   text,
  usage_count   integer not null default 0
);

create table edge_type_synonyms (
  id              bigint generated always as identity primary key,
  raw_type        text not null,
  canonical_type  text not null references edge_type_registry(id),
  source          text not null default 'seed'
                    check (source in ('seed', 'llm_candidate', 'user_confirmed'))
);

create unique index idx_edge_synonyms_raw on edge_type_synonyms (lower(raw_type));

-- Knowledge graph -------------------------------------------------------------

create table kg_entities (
  id              bigint generated always as identity primary key,
  household_id    bigint not null references households(id),
  canonical_name  text not null,
  entity_type     text not null,
  source_table    text,
  source_id       bigint,
  created_at      timestamptz not null default now()
);

create index idx_kg_entities_household on kg_entities (household_id, entity_type);
create index idx_kg_entities_name_trgm on kg_entities using gin (canonical_name gin_trgm_ops);

create table kg_aliases (
  id          bigint generated always as identity primary key,
  entity_id   bigint not null references kg_entities(id) on delete cascade,
  alias       text not null,
  source      text not null default 'seed'
                check (source in ('seed', 'llm_candidate', 'user_confirmed')),
  created_at  timestamptz not null default now()
);

create index idx_kg_aliases_lower on kg_aliases (lower(alias));

create table kg_edges (
  id              bigint generated always as identity primary key,
  household_id    bigint not null references households(id),
  subject_id      bigint not null references kg_entities(id),
  edge_type       text not null references edge_type_registry(id),
  object_id       bigint not null references kg_entities(id),
  base_weight     real not null default 1.0,
  mention_count   integer not null default 1,
  first_seen      timestamptz not null default now(),
  last_seen       timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create index idx_kg_edges_subject on kg_edges (subject_id, edge_type);
create index idx_kg_edges_object on kg_edges (object_id, edge_type);
create index idx_kg_edges_household on kg_edges (household_id);

create table kg_observations (
  id            bigint generated always as identity primary key,
  edge_id       bigint not null references kg_edges(id) on delete cascade,
  message_id    bigint references messages(id),
  confidence    real not null default 1.0,
  source_text   text,
  source_type   text not null default 'extraction'
                  check (source_type in ('extraction', 'inference', 'reflection')),
  created_at    timestamptz not null default now()
);

-- Entity lexicon auto-population triggers -------------------------------------
-- When a person/item/location is inserted, add surface forms to entity_lexicon.

create or replace function populate_lexicon_person()
returns trigger as $$
begin
  insert into entity_lexicon (household_id, surface_form, entity_type, entity_id, source)
  values (new.household_id, lower(new.name), 'person', new.id, 'seed');
  return new;
end;
$$ language plpgsql;

create trigger trg_lexicon_person
  after insert on people
  for each row execute function populate_lexicon_person();

create or replace function populate_lexicon_item()
returns trigger as $$
begin
  insert into entity_lexicon (household_id, surface_form, entity_type, entity_id, source)
  values (new.household_id, lower(new.name), 'item', new.id, 'seed');
  return new;
end;
$$ language plpgsql;

create trigger trg_lexicon_item
  after insert on items
  for each row execute function populate_lexicon_item();

create or replace function populate_lexicon_location()
returns trigger as $$
begin
  insert into entity_lexicon (household_id, surface_form, entity_type, entity_id, source)
  values (new.household_id, lower(new.name), 'location', new.id, 'seed');
  return new;
end;
$$ language plpgsql;

create trigger trg_lexicon_location
  after insert on locations
  for each row execute function populate_lexicon_location();

-- Fuzzy entity resolution function --------------------------------------------

create or replace function resolve_entity_fuzzy(
  p_household_id bigint,
  p_mention text,
  p_threshold real default 0.3
)
returns table (
  entity_id   bigint,
  entity_type text,
  score       real
) as $$
begin
  return query
    select
      el.entity_id,
      el.entity_type,
      similarity(el.surface_form, lower(p_mention))::real as score
    from entity_lexicon el
    where el.household_id = p_household_id
      and similarity(el.surface_form, lower(p_mention)) > p_threshold
    order by score desc
    limit 5;
end;
$$ language plpgsql stable;
