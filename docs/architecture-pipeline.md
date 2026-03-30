# Pipeline Architecture

Single source of truth for the HouseOps inference pipeline.

## Pipeline Flow

```
Input: raw text
  |
  v
EXTRACT ---- verb, entity mentions, dates, quantities
  |           (compromise.js + chrono-node + regex + entity_lexicon scan)
  |
  v
RESOLVE ---- entity mentions -> DB IDs + types + confidence
  |           (pg_trgm fuzzy + aliases + verb-context rules)
  |           If entity not in DB: UNRESOLVED (ask user or route to LLM)
  |
  v
CLASSIFY --- verb + resolved entity types -> tool name + confidence
  |           (verb_tool_lookup table query)
  |
  |-- CONFIDENT (tool known, all reference params resolved, confidence > 0.85)
  |     |
  |     v
  |   ASSEMBLE --- fill tool params from resolved entities + dates + quantities
  |     |
  |     v
  |   VALIDATE --- schema check, FK existence, business rules
  |     |
  |     v
  |   Confirmation card (deterministic path, no LLM)
  |
  |-- NOT CONFIDENT (ambiguous verb, unresolved references, low confidence)
        |
        v
      RETRIEVE --- intent-scoped kg traversal + relevance weight filtering
        |
        v
      GENERATE --- ONE LLM call (raw text + resolved entities + context + tools)
        |           LLM handles: ambiguous verbs, compound inputs, coreference
        |           LLM outputs: tool call(s) + optional knowledge triples
        |
        v
      VALIDATE --- schema check, FK existence, business rules
        |
        v
      Confirmation card

On confirm -> execute + log to action_log
On reject -> feedback to appropriate stage
On LLM handling -> candidate rows for deterministic tables (human confirms before production)
```

## Stage Table

| Stage | Input | Output | Feedback Signal | How Feedback Updates | Trainable Storage |
|---|---|---|---|---|---|
| EXTRACT | {text, household_id} | {verb, entity_mentions[], dates[], quantities[]} | "Missed entity" or "wrong date" | New alias in entity_lexicon, new unit in quantity_unit_aliases | entity_lexicon, quantity_units, quantity_unit_aliases |
| RESOLVE | {entity_mentions[], household_id, verb} | {resolved[{mention, entity_id, type, score}], unresolved[]} | "I meant X not Y" | New row in resolution_context_rules | resolution_context_rules, kg_aliases |
| CLASSIFY | {verb, entity_types[], resolved_count, unresolved_count} | {tool_name, confidence, needs_llm, can_assemble} | "Wrong tool" | New row in verb_tool_lookup | verb_tool_lookup, intent_few_shots |
| RETRIEVE | {intent, entity_ids[], household_id} | {context_items[{content, edge_type, relevance}]} | "This context was/wasn't relevant" | Beta distribution update (alpha/beta) | context_relevance_weights |
| GENERATE | {text, resolved_entities, context, tool_schemas} | {tool_calls[], knowledge_triples[]} | "Accepted/rejected/corrected" | Few-shot in tool_call_examples. Promote candidates to deterministic tables. | tool_call_examples |
| VALIDATE | {tool_call, schemas} | {valid, errors[], confidence} | Rejection patterns (offline analysis) | New business rules in code | N/A (deterministic) |

## Entity Model

**Every entity the system can act on must be in the database.** If it's not there, the system doesn't know what it is and asks the user.

- **Resolved entity**: exists in people, locations, inventory, kg_entities, or a products/items table. Has a type and an ID.
- **Unresolved entity**: mention found in text but no DB match. System asks: "I don't know what [X] is. Can you tell me?"
- **No verb-context type inference.** We don't guess that "milk" is an item because the verb is "buy." Either milk is in the DB or it's unknown.

The DB is seeded with common household products (grocery items with stores, typical quantities, categories). The system knows "milk" because it's in the products seed data, not because it inferred it from the verb.

The tool schema defines which params are references (must resolve to an ID) vs values (accept new strings):

```
add_shopping_list_item:
  name: product_ref  <- REFERENCE (must resolve to known product)
  person: person_ref <- REFERENCE (must resolve to people table)
  store: store_ref   <- REFERENCE (must resolve to known store)
  quantity_needed: number <- VALUE (new data, no reference)

create_action_item:
  title: string      <- VALUE (new data)
  person_id: ref     <- REFERENCE
  assigned_to: ref   <- REFERENCE
```

Over time the DB grows. Novel entities get added on first encounter after user confirmation. This is a core value proposition: the system knows your products, your stores, your quantities, your people — because they're all in the database.

### Core operational tables (simplified)

4 core tables. Everything else is knowledge graph, recipes, or pipeline infrastructure.

| Table | What it holds | Examples |
|---|---|---|
| `people` | Household members + pets | Jim, Justine, Charlie, Theo, Lily (cat) |
| `items` | Anything the household buys, stocks, or tracks | Milk, eggs, toilet paper, Charlie's wrestling shoes |
| `actions` | Anything with time (events, tasks, reminders) | Wrestling Thursday 4pm, dentist April 5, remind about singlet |
| `locations` | Places in/around the home | Kitchen, Garage, Basement Pantry |

**`items` replaces inventory + products + shopping_list_items.** An item is a thing. Its STATE tells you whether you have it, need it, or are buying it:

```
items:
  id, name, category, household_id
  quantity          -- how many we have (0 = out)
  unit              -- "roll", "gallon", "count"
  location_id       -- where it is
  reorder_threshold -- auto-add to shopping when below
  status            -- 'stocked', 'needed', 'on_list', 'purchased'
  store             -- where we buy it
  brand             -- preferred brand
  person_id         -- whose item (Charlie's shirts vs household milk)
```

"Buy milk" → find item "milk" → status='on_list'. "Bought the milk" → status='purchased', quantity updated. One table, state transitions.

**`actions` replaces tasks + events + reminders.** Every action is completable. Every action CAN have time attributes. The "type" is emergent from which fields are filled, not a column.

```
actions:
  id, title, description, category, household_id
  status            -- 'pending', 'done', 'dismissed', 'missed'
  starts_at         -- when it happens/surfaces (calendar-visible when set)
  ends_at           -- when it ends (duration, NULL for tasks)
  due_at            -- deadline (NULL for events)
  all_day           -- full-day boolean
  recurrence_rule   -- RRULE string for repeating
  assigned_to       -- person_id (who does it)
  person_id         -- person_id (who it involves, may differ from assigned_to)
  source_id         -- self-ref FK (derived action -> source action)
  location          -- where
  source            -- 'user', 'system'
```

Three time columns: `starts_at`, `ends_at`, `due_at`. Each optional, independent.

| Use case | starts_at | ends_at | due_at |
|---|---|---|---|
| Calendar event | 4pm Thursday | 5:30pm | NULL |
| Task with deadline | NULL | NULL | Saturday |
| Open task (no date) | NULL | NULL | NULL |
| Reminder | Thursday morning | NULL | NULL |
| All-day event | March 28 | NULL | NULL |
| Task you plan to start | Monday 9am | NULL | Friday |

No `trigger_at` column. Reminders use `starts_at` — they're calendar-visible at the reminder time. Reminders are just actions where starts_at = when you want to be nudged.

Every action is completable (status column). Events go 'done' when they pass. Tasks go 'done' when completed. Reminders go 'dismissed' when acknowledged. No type column — type is emergent from which time columns are filled.

`recipes`, `recipe_steps`, `recipe_ingredients`, `meal_plan` stay — recipes are structured enough to justify their own tables.

`person_attributes` stays for now — subsumed by kg_edges later.

`relationship_dates` subsumed by kg_edges + actions.

All core tables feed into entity_lexicon via triggers.

### Parameter mapping (deterministic path)

When CLASSIFY is confident and all reference params resolve, the pipeline fills tool params by matching entity type to parameter type:

```
Tool: add_to_shopping(item: item_ref, store: store_ref, quantity: number)
Resolved: [milk(item), Costco(store)]
Quantity: 3
-> item=milk, store=Costco, quantity=3
```

Works when each tool has at most ONE param per entity type. If two entities of the same type are resolved and the tool has two same-typed params (e.g., assigned_to: person, person_id: person), route to LLM. The LLM handles role assignment from sentence structure.

### verb_tool_lookup query pattern

Verb + sorted entity type array, subset matching, most specific wins:

```sql
SELECT tool_name, confidence
FROM verb_tool_lookup
WHERE verb = $1
  AND entity_types <@ $2  -- lookup types subset of detected types
ORDER BY array_length(entity_types, 1) DESC  -- most specific match
LIMIT 1;
```

## Routing Logic

CLASSIFY decides the path:

```typescript
function needsLLM(classifyResult, resolveResult): boolean {
  if (!classifyResult.toolName) return true;           // verb ambiguous
  if (classifyResult.confidence < 0.85) return true;   // low confidence
  // Check if any REFERENCE params are unresolved
  const tool = getToolSchema(classifyResult.toolName);
  for (const param of tool.referenceParams) {
    const resolved = resolveResult.resolved.find(e => e.type === param.entityType);
    if (!resolved) return true;                        // reference param unresolved
  }
  return false;
}
```

## The LLM Trains Deterministic Pattern

Every time the LLM handles something the deterministic path couldn't:
1. LLM produces a tool call
2. User confirms
3. Confirmed result -> candidate row in deterministic tables:
   - New verb->tool mapping in verb_tool_lookup
   - New entity alias in entity_lexicon/kg_aliases
   - New unit in quantity_unit_aliases
4. Candidate rows shown in review queue
5. Human promotes to 'user_confirmed' (used in production path)
6. Next time same pattern -> deterministic path handles it

Track: % of inputs requiring LLM fallback per week. Should decline over time.

## Structural Confidence

Never ask the LLM "are you sure?" Measure from structural signals:

- Parameter completeness: required params filled / total required
- Entity resolution score: fuzzy match scores from pg_trgm
- Candidate ambiguity: 1 candidate = high confidence, multiple = low
- Historical acceptance rate: per-tool acceptance rate from action_log
- Combined: weighted geometric mean, or min across stages

Thresholds (risk-based):
- > 0.92 + low risk (add item): auto-execute + undo option
- 0.50-0.92 or medium risk: confirmation card
- 0.25-0.50: ask for clarification
- < 0.25: "I don't understand"

## Stage I/O Logging

Every stage execution logged to stage_executions:

```typescript
interface StageExecution {
  stage: string;
  input_payload: object;
  output_payload: object;
  confidence: number;
  duration_ms: number;
  model_version: string;
  user_verdict: 'correct' | 'incorrect' | null;
  conversation_id: number;
  household_id: number;
}
```

This is training data AND debugging data. Any new stage implementation can be backtested against the full history.

## Libraries

- pg_trgm: fuzzy entity matching (Postgres, server-side)
- chrono-node: date/time parsing (npm:chrono-node, Deno + browser)
- compromise.js: verb/noun extraction (npm:compromise, 250KB, Deno + browser)
- regex: quantity extraction (generated from quantity_unit_aliases table)

## What Runs Where

| Stage | Edge Function | Browser/PWA |
|---|---|---|
| EXTRACT | yes | yes (offline capable) |
| RESOLVE | yes (Postgres) | yes if entity list cached |
| CLASSIFY | yes | yes (offline capable) |
| RETRIEVE | yes (Postgres) | no (needs kg_edges) |
| GENERATE | yes (Groq API) | yes (Groq API from client) |
| VALIDATE | yes | yes |

Tier 1 deterministic path can run entirely offline in a PWA with cached entities.

## No DECOMPOSE Stage

Compound inputs ("buy milk and remind me about the dentist") go to the LLM path. The LLM handles decomposition, coreference, and multi-tool-call emission in one pass via parallel tool calling. Research shows this is more accurate than early decomposition (which breaks coreference).

## Deferred: Dependency Parsing

No JS dependency parser exists at production quality. spaCy (Python) could be added as a FastAPI sidecar (15ms/request, 50MB) when data shows entity-type-to-parameter mapping fails >15%. For now, the LLM path handles cases the deterministic path can't.
