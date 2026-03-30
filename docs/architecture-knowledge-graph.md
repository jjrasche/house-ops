# Knowledge Graph Architecture

How the system stores, retrieves, and learns household knowledge.

## Tables

### kg_entities
Nodes in the graph. Every known entity (people, locations, items, activities, stores).
- id, household_id, canonical_name, entity_type
- source_table (optional FK concept: "people", "inventory", etc.)
- source_id (optional FK to operational row)

### kg_aliases
Alternate names for entities. "Theo", "Theos", "the boy".
- entity_id, alias (lowercased), source ('seed', 'llm_candidate', 'user_confirmed')

### kg_edges
Weighted triples: subject -[edge_type]-> object.
- subject_id, edge_type, object_id
- base_weight (extraction confidence), mention_count, first_seen, last_seen
- Effective weight at query time: base_weight * (1 + ln(mention_count)) * exp(-decay * days_since_last_seen)

### kg_observations
Provenance for each edge. Links back to the conversation that produced it.
- edge_id, message_id, confidence, source_text
- source_type: 'extraction' | 'inference' | 'reflection'

## Edge Type Registry

Hierarchical. parent_id enables querying at category level.

```sql
CREATE TABLE edge_type_registry (
  id          TEXT PRIMARY KEY,
  parent_id   TEXT REFERENCES edge_type_registry(id),
  display_name TEXT,
  description TEXT,
  usage_count INT DEFAULT 0
);
```

### Starting hierarchy (~28 leaf types)

relationship: is_parent_of, is_child_of, is_sibling_of, is_spouse_of, is_pet_owner_of, is_friend_of, is_classmate_of, is_teacher_of

attribute: prefers_food, dislikes_food, prefers_activity, dislikes_activity, has_allergy, has_dietary_restriction, has_condition, has_birthday, has_nickname, has_age

activity: plays_sport, attends_class, practices_hobby, has_chore, member_of_team, enrolled_in_school

state: is_located_at, owns, has_quantity_of, is_due_for

sizing: has_shoe_size, has_clothing_size

temporal: recurs_every, occurs_on_day, occurs_at_time

## Edge Type Normalization

Three layers, cheapest first:
1. Extraction prompt lists canonical types, LLM reuses them
2. Synonym table in DB: raw_type -> canonical_type (trainable)
3. OTHER:description escape hatch for genuinely new types -> review queue

## Context Retrieval

Intent-scoped. RETRIEVE stage pulls context relevant to the classified intent.

### Context Relevance Weights

Beta distribution per (intent, edge_type). Trained from user feedback (include/exclude context items).

```sql
context_relevance_weights:
  intent_class TEXT,
  edge_type TEXT,
  alpha REAL DEFAULT 1.0,  -- include signals + prior
  beta REAL DEFAULT 1.0,   -- exclude signals + prior
  weight = alpha / (alpha + beta)  -- Laplace-smoothed
```

Minimum 5 observations before filtering kicks in. Below that, include everything.

### Graph Traversal

Recursive CTE with relevance decay (Personalized PageRank pattern):

```sql
WITH RECURSIVE walk AS (
  SELECT object_id, edge_type, weight AS relevance, 1 AS depth
  FROM kg_edges WHERE subject_id = :seed
  UNION ALL
  SELECT e.object_id, e.edge_type, w.relevance * e.weight * 0.5, w.depth + 1
  FROM kg_edges e JOIN walk w ON e.subject_id = w.object_id
  WHERE w.depth < 3 AND w.relevance * e.weight * 0.5 > 0.1
)
SELECT * FROM walk WHERE relevance > 0.1 ORDER BY relevance DESC LIMIT 20;
```

Direct CTE for now. Materialized view as future optimization.

## Knowledge Extraction

Side-channel after each interaction. Event-driven (fires on INSERT to messages).

Pipeline: extract triples from user message + assistant response -> consolidate against existing edges (ADD/UPDATE/DELETE/NOOP) -> persist to kg tables.

Extraction prompt includes canonical edge types from registry. New types use OTHER:description escape hatch.

## Meta-Knowledge Separation

Domain facts (Theo does wrestling) stored in kg_edges. Retrieval policy (allergy edges irrelevant for shopping intents) stored in context_relevance_weights. These are separate tables, separate training loops. Facts in the graph, retrieval rules outside it.
