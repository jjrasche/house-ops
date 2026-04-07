-- 003_seed_data.sql
-- Seed: people, locations, verb→tool mappings, edge types, quantity units.
-- NO products/items seeded — users build their catalog through interaction.
-- Entity lexicon auto-populated by triggers on people/locations inserts.

-- Household (dev/test) --------------------------------------------------------

insert into households (name) values ('Rasche Family');

-- People (triggers auto-populate entity_lexicon) ------------------------------

insert into people (household_id, name, role) values
  (1, 'Jim',      'adult'),
  (1, 'Justine',  'adult'),
  (1, 'Charlie',  'child'),
  (1, 'Theo',     'child'),
  (1, 'Lily',     'pet'),
  (1, 'Desi',     'pet');

-- Locations (triggers auto-populate entity_lexicon) ---------------------------

insert into locations (household_id, name, parent_location_id) values
  (1, 'Kitchen',          null),
  (1, 'Garage',           null),
  (1, 'Basement',         null),
  (1, 'Pantry',           1),     -- child of Kitchen
  (1, 'Basement Pantry',  3),     -- child of Basement
  (1, 'Charlie''s Room',  null),
  (1, 'Theo''s Room',     null);

-- Verb → tool mappings --------------------------------------------------------

insert into verb_tool_lookup (household_id, verb, entity_types, tool_name, confidence, source) values
  (1, 'buy',        '{item}',            'update_item',    0.95, 'seed'),
  (1, 'add',        '{item}',            'update_item',    0.93, 'seed'),
  (1, 'need',       '{item}',            'update_item',    0.94, 'seed'),
  (1, 'bought',     '{item}',            'update_item',    0.94, 'seed'),
  (1, 'purchased',  '{item}',            'update_item',    0.94, 'seed'),
  (1, 'have',       '{item,location}',   'update_item',    0.92, 'seed'),
  (1, 'used',       '{item}',            'update_item',    0.92, 'seed'),
  (1, 'pick up',    '{item,store}',      'update_item',    0.95, 'seed'),
  (1, 'out of',     '{item}',            'update_item',    0.90, 'seed'),
  (1, 'pick up',    '{item}',            'update_item',    0.90, 'seed'),
  (1, 'get',        '{item}',            'update_item',    0.94, 'seed'),
  (1, 'got',        '{item}',            'update_item',    0.94, 'seed'),
  (1, 'grab',       '{item}',            'update_item',    0.94, 'seed'),
  (1, 'grabbed',    '{item}',            'update_item',    0.94, 'seed'),
  (1, 'put',        '{item}',            'update_item',    0.93, 'seed'),
  (1, 'running low','{item}',            'update_item',    0.90, 'seed'),
  (1, 'low on',     '{item}',            'update_item',    0.90, 'seed'),
  (1, 'all set',   '{item}',            'update_item',    0.90, 'seed'),
  (1, 'remind',     '{}',                'create_action',  0.93, 'seed'),
  (1, 'schedule',   '{}',                'create_action',  0.93, 'seed'),
  (1, 'create',     '{}',                'create_action',  0.90, 'seed'),
  (1, 'finished',   '{action}',          'update_action',  0.92, 'seed'),
  (1, 'completed',  '{action}',          'update_action',  0.92, 'seed'),
  (1, 'done',       '{action}',          'update_action',  0.92, 'seed'),
  (1, 'save',       '{}',                'create_recipe',  0.88, 'seed');

-- Edge type registry (hierarchical, ~28 leaf types) ---------------------------

-- Root categories
insert into edge_type_registry (id, parent_id, display_name, description) values
  ('relationship', null,           'Relationship',  'Connections between people'),
  ('attribute',    null,           'Attribute',      'Personal traits and preferences'),
  ('activity',     null,           'Activity',       'Sports, classes, hobbies'),
  ('state',        null,           'State',          'Current state of entities'),
  ('sizing',       null,           'Sizing',         'Clothing and shoe sizes'),
  ('temporal',     null,           'Temporal',       'Time-based patterns');

-- Relationship leaves
insert into edge_type_registry (id, parent_id, display_name, description) values
  ('is_parent_of',    'relationship', 'Is parent of',    null),
  ('is_child_of',     'relationship', 'Is child of',     null),
  ('is_sibling_of',   'relationship', 'Is sibling of',   null),
  ('is_spouse_of',    'relationship', 'Is spouse of',    null),
  ('is_pet_owner_of', 'relationship', 'Is pet owner of', null),
  ('is_friend_of',    'relationship', 'Is friend of',    null),
  ('is_classmate_of', 'relationship', 'Is classmate of', null),
  ('is_teacher_of',   'relationship', 'Is teacher of',   null);

-- Attribute leaves
insert into edge_type_registry (id, parent_id, display_name, description) values
  ('prefers_food',            'attribute', 'Prefers food',            null),
  ('dislikes_food',           'attribute', 'Dislikes food',           null),
  ('prefers_activity',        'attribute', 'Prefers activity',        null),
  ('dislikes_activity',       'attribute', 'Dislikes activity',       null),
  ('has_allergy',             'attribute', 'Has allergy',             null),
  ('has_dietary_restriction', 'attribute', 'Has dietary restriction', null),
  ('has_condition',           'attribute', 'Has condition',           null),
  ('has_birthday',            'attribute', 'Has birthday',            null),
  ('has_nickname',            'attribute', 'Has nickname',            null),
  ('has_age',                 'attribute', 'Has age',                 null);

-- Activity leaves
insert into edge_type_registry (id, parent_id, display_name, description) values
  ('plays_sport',       'activity', 'Plays sport',       null),
  ('attends_class',     'activity', 'Attends class',     null),
  ('practices_hobby',   'activity', 'Practices hobby',   null),
  ('has_chore',         'activity', 'Has chore',         null),
  ('member_of_team',    'activity', 'Member of team',    null),
  ('enrolled_in_school','activity', 'Enrolled in school',null);

-- State leaves
insert into edge_type_registry (id, parent_id, display_name, description) values
  ('is_located_at',   'state', 'Is located at',   null),
  ('owns',            'state', 'Owns',             null),
  ('has_quantity_of', 'state', 'Has quantity of',  null),
  ('is_due_for',      'state', 'Is due for',       null);

-- Sizing leaves
insert into edge_type_registry (id, parent_id, display_name, description) values
  ('has_shoe_size',     'sizing', 'Has shoe size',     null),
  ('has_clothing_size', 'sizing', 'Has clothing size', null);

-- Temporal leaves
insert into edge_type_registry (id, parent_id, display_name, description) values
  ('recurs_every',    'temporal', 'Recurs every',    null),
  ('occurs_on_day',   'temporal', 'Occurs on day',   null),
  ('occurs_at_time',  'temporal', 'Occurs at time',  null);

-- KG entities for stores and activities ---------------------------------------

insert into kg_entities (household_id, canonical_name, entity_type) values
  (1, 'Costco',    'store'),
  (1, 'Kroger',    'store'),
  (1, 'Target',    'store'),
  (1, 'wrestling', 'activity'),
  (1, 'soccer',    'activity');

-- KG aliases for stores/activities
insert into kg_aliases (entity_id, alias, source) values
  ((select id from kg_entities where canonical_name = 'Costco'    and household_id = 1), 'costco',    'seed'),
  ((select id from kg_entities where canonical_name = 'Kroger'    and household_id = 1), 'kroger',    'seed'),
  ((select id from kg_entities where canonical_name = 'Target'    and household_id = 1), 'target',    'seed'),
  ((select id from kg_entities where canonical_name = 'wrestling' and household_id = 1), 'wrestling', 'seed'),
  ((select id from kg_entities where canonical_name = 'soccer'    and household_id = 1), 'soccer',    'seed');

-- Entity lexicon entries for stores/activities (not auto-triggered) -----------

insert into entity_lexicon (household_id, surface_form, entity_type, entity_id, source)
select 1, lower(canonical_name), entity_type, id, 'seed'
from kg_entities
where household_id = 1;

-- People as KG entities (mirrored from people table) --------------------------

insert into kg_entities (household_id, canonical_name, entity_type, source_table, source_id)
select household_id, name, 'person', 'people', id
from people
where household_id = 1;

-- KG edges: family relationships ----------------------------------------------

-- Jim & Justine are spouses
insert into kg_edges (household_id, subject_id, edge_type, object_id)
select 1,
  (select id from kg_entities where canonical_name = 'Jim' and entity_type = 'person' and household_id = 1),
  'is_spouse_of',
  (select id from kg_entities where canonical_name = 'Justine' and entity_type = 'person' and household_id = 1);

-- Theo does wrestling, Charlie does soccer
insert into kg_edges (household_id, subject_id, edge_type, object_id)
select 1,
  (select id from kg_entities where canonical_name = 'Theo' and entity_type = 'person' and household_id = 1),
  'plays_sport',
  (select id from kg_entities where canonical_name = 'wrestling' and household_id = 1);

insert into kg_edges (household_id, subject_id, edge_type, object_id)
select 1,
  (select id from kg_entities where canonical_name = 'Charlie' and entity_type = 'person' and household_id = 1),
  'plays_sport',
  (select id from kg_entities where canonical_name = 'soccer' and household_id = 1);

-- Quantity units --------------------------------------------------------------

insert into quantity_units (canonical, display_name) values
  ('count',   'count'),
  ('box',     'box'),
  ('bag',     'bag'),
  ('roll',    'roll'),
  ('gallon',  'gallon'),
  ('pound',   'pound'),
  ('ounce',   'ounce'),
  ('liter',   'liter'),
  ('pack',    'pack'),
  ('bottle',  'bottle'),
  ('can',     'can'),
  ('dozen',   'dozen');

insert into quantity_unit_aliases (unit_id, alias, source) values
  ((select id from quantity_units where canonical = 'count'),  'ct',       'seed'),
  ((select id from quantity_units where canonical = 'count'),  'each',     'seed'),
  ((select id from quantity_units where canonical = 'box'),    'boxes',    'seed'),
  ((select id from quantity_units where canonical = 'bag'),    'bags',     'seed'),
  ((select id from quantity_units where canonical = 'roll'),   'rolls',    'seed'),
  ((select id from quantity_units where canonical = 'gallon'), 'gal',      'seed'),
  ((select id from quantity_units where canonical = 'gallon'), 'gallons',  'seed'),
  ((select id from quantity_units where canonical = 'pound'),  'lb',       'seed'),
  ((select id from quantity_units where canonical = 'pound'),  'lbs',      'seed'),
  ((select id from quantity_units where canonical = 'pound'),  'pounds',   'seed'),
  ((select id from quantity_units where canonical = 'ounce'),  'oz',       'seed'),
  ((select id from quantity_units where canonical = 'ounce'),  'ounces',   'seed'),
  ((select id from quantity_units where canonical = 'liter'),  'liters',   'seed'),
  ((select id from quantity_units where canonical = 'liter'),  'l',        'seed'),
  ((select id from quantity_units where canonical = 'pack'),   'packs',    'seed'),
  ((select id from quantity_units where canonical = 'pack'),   'pk',       'seed'),
  ((select id from quantity_units where canonical = 'bottle'), 'bottles',  'seed'),
  ((select id from quantity_units where canonical = 'can'),    'cans',     'seed'),
  ((select id from quantity_units where canonical = 'dozen'),  'doz',      'seed');
