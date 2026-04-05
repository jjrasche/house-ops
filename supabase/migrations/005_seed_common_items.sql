-- 005_seed_common_items.sql
-- Seed common household items so the deterministic pipeline has entities
-- to resolve. Triggers auto-populate entity_lexicon.

insert into items (household_id, name, category, status) values
  (1, 'milk',               'dairy',       'stocked'),
  (1, 'eggs',               'dairy',       'stocked'),
  (1, 'bread',              'bakery',      'stocked'),
  (1, 'butter',             'dairy',       'stocked'),
  (1, 'cereal',             'breakfast',   'stocked'),
  (1, 'paper towels',       'household',   'stocked'),
  (1, 'toilet paper',       'household',   'stocked'),
  (1, 'dish soap',          'cleaning',    'stocked'),
  (1, 'laundry detergent',  'cleaning',    'stocked'),
  (1, 'garbage bags',       'household',   'stocked'),
  (1, 'chicken',            'meat',        'stocked'),
  (1, 'rice',               'pantry',      'stocked'),
  (1, 'pasta',              'pantry',      'stocked'),
  (1, 'bananas',            'produce',     'stocked'),
  (1, 'apples',             'produce',     'stocked'),
  (1, 'cheese',             'dairy',       'stocked'),
  (1, 'yogurt',             'dairy',       'stocked'),
  (1, 'coffee',             'beverages',   'stocked'),
  (1, 'orange juice',       'beverages',   'stocked'),
  (1, 'peanut butter',      'pantry',      'stocked');
