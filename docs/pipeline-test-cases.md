# Pipeline Test Cases — 20 inputs traced through 6 stages

> **STATUS: Test expected outputs need updating.** The entity model changed after these were written: every entity must be in the DB. Tests currently show entities like "milk" as unresolved — they should resolve against seed data. The next session should update each test case's RESOLVE output.

## Seed Data Required

**People:** Jim, Justine, Charlie, Theo, Lily (cat), Desi (bearded dragon)
**Locations:** Kitchen, Garage, Basement, Pantry (child of Kitchen), Basement Pantry (child of Basement), Charlie's Room, Theo's Room
**Products:** milk, eggs, cereal, paper towels, dish soap, toilet paper, garbage bags, laundry detergent (with categories, typical stores, typical units)
**Stores:** Costco, Kroger, Target (TBD — Jim's actual stores)
**Activities:** wrestling, soccer

> Tests assume DECOMPOSE is removed. Pipeline is: EXTRACT -> RESOLVE -> CLASSIFY -> (ASSEMBLE or RETRIEVE+GENERATE) -> VALIDATE

## Open Questions for Test Updates
1. Should "milk" resolve to a product_id? If so, RESOLVE output changes for tests 1, 5, 6, 16.
2. Should "Costco" / "Target" resolve to a store_id? If so, RESOLVE output changes for tests 13, etc.
3. When a product resolves, does CLASSIFY confidence increase? (More resolved = more confident)
4. ASSEMBLE param mapping: does product-type entity -> name param work by convention?

---

## Test 1: "Buy milk"
**Tier:** 1 | **LLM needed:** No

| Stage | Output |
|---|---|
| DECOMPOSE | `["Buy milk"]` |
| EXTRACT | `{verb: "buy", entities: [{text: "milk", type_hint: "item"}], dates: [], quantities: []}` |
| RESOLVE | `{resolved: [], unresolved: ["milk"]}` — milk not in entity DB (it's a shopping item, not inventory) |
| CLASSIFY | `{tool: "add_shopping_list_item", confidence: 0.95, needs_llm: false, can_assemble: true}` |
| RETRIEVE | `{context_items: []}` — no kg context needed for simple add |
| GENERATE | SKIPPED (can_assemble=true) → `{tool_calls: [{tool: "add_shopping_list_item", params: {name: "milk"}}]}` |
| VALIDATE | `{valid: true, errors: [], confidence: 0.95}` |

---

## Test 2: "Add 3 boxes of cereal to the shopping list"
**Tier:** 1 | **LLM needed:** No

| Stage | Output |
|---|---|
| DECOMPOSE | `["Add 3 boxes of cereal to the shopping list"]` |
| EXTRACT | `{verb: "add", entities: [{text: "cereal", type_hint: "item"}, {text: "shopping list", type_hint: "list"}], dates: [], quantities: [{value: 3, unit: "box"}]}` |
| RESOLVE | `{resolved: [], unresolved: ["cereal"]}` |
| CLASSIFY | `{tool: "add_shopping_list_item", confidence: 0.92, needs_llm: false, can_assemble: true}` — "add" + item + "shopping list" keyword → shopping |
| RETRIEVE | `{context_items: []}` |
| GENERATE | SKIPPED → `{tool_calls: [{tool: "add_shopping_list_item", params: {name: "cereal", quantity_needed: 3}}]}` |
| VALIDATE | `{valid: true, errors: [], confidence: 0.92}` |

---

## Test 3: "Remind me Thursday about the dentist"
**Tier:** 1 | **LLM needed:** No

| Stage | Output |
|---|---|
| DECOMPOSE | `["Remind me Thursday about the dentist"]` |
| EXTRACT | `{verb: "remind", entities: [{text: "dentist", type_hint: "unknown"}], dates: [{raw: "Thursday", parsed: "2026-04-02"}], quantities: []}` |
| RESOLVE | `{resolved: [], unresolved: ["dentist"]}` — dentist not in entity DB |
| CLASSIFY | `{tool: "create_action_item", confidence: 0.93, needs_llm: false, can_assemble: true}` — "remind" + date → action_item with trigger_at |
| RETRIEVE | `{context_items: []}` |
| GENERATE | SKIPPED → `{tool_calls: [{tool: "create_action_item", params: {title: "Dentist", trigger_at: "2026-04-02"}}]}` |
| VALIDATE | `{valid: true, errors: [], confidence: 0.93}` |

---

## Test 4: "Theo has wrestling at 4"
**Tier:** 1 | **LLM needed:** Maybe (verb "has" is ambiguous)

| Stage | Output |
|---|---|
| DECOMPOSE | `["Theo has wrestling at 4"]` |
| EXTRACT | `{verb: "has", entities: [{text: "Theo", type_hint: "person"}, {text: "wrestling", type_hint: "unknown"}], dates: [{raw: "at 4", parsed: "2026-03-30T16:00"}], quantities: []}` |
| RESOLVE | `{resolved: [{mention: "Theo", entity_id: 4, type: "person", score: 1.0}], unresolved: ["wrestling"]}` |
| CLASSIFY | `{tool: null, confidence: 0.4, needs_llm: true, can_assemble: false}` — "has" not in verb_tool_lookup (until trained) |
| RETRIEVE | `{context_items: [{content: "Theo does_activity wrestling", edge_type: "does_activity", relevance: 0.8}]}` — kg knows Theo+wrestling |
| GENERATE | LLM call → `{tool_calls: [{tool: "create_action_item", params: {title: "Wrestling", person_id: 4, starts_at: "2026-03-30T16:00"}}]}` |
| VALIDATE | `{valid: true, errors: [], confidence: 0.85}` |

**Training outcome:** After user confirms, INSERT into verb_tool_lookup: (has, [person, activity, date]) → create_action_item

---

## Test 5: "We're out of eggs"
**Tier:** 3 | **LLM needed:** Yes (implicit action, no explicit verb for shopping)

| Stage | Output |
|---|---|
| DECOMPOSE | `["We're out of eggs"]` |
| EXTRACT | `{verb: "are", entities: [{text: "eggs", type_hint: "item"}], dates: [], quantities: []}` — "out of" is a state, not an action verb |
| RESOLVE | `{resolved: [], unresolved: ["eggs"]}` |
| CLASSIFY | `{tool: null, confidence: 0.3, needs_llm: true, can_assemble: false}` — "are" is not actionable |
| RETRIEVE | `{context_items: [{content: "eggs, quantity: 6, location: Kitchen", edge_type: "has_quantity_of", relevance: 0.7}]}` |
| GENERATE | LLM call → `{tool_calls: [{tool: "update_inventory_quantity", params: {name: "eggs", quantity: 0}}, {tool: "add_shopping_list_item", params: {name: "eggs"}}]}` |
| VALIDATE | `{valid: true, errors: [], confidence: 0.75}` |

---

## Test 6: "Buy milk and remind me about the dentist Thursday"
**Tier:** 2 | **LLM needed:** No (if decomposition works)

| Stage | Output |
|---|---|
| DECOMPOSE | `["Buy milk", "Remind me about the dentist Thursday"]` |
| **Pipeline 1: "Buy milk"** | |
| EXTRACT | `{verb: "buy", entities: [{text: "milk", type_hint: "item"}], dates: [], quantities: []}` |
| RESOLVE | `{resolved: [], unresolved: ["milk"]}` |
| CLASSIFY | `{tool: "add_shopping_list_item", confidence: 0.95, needs_llm: false, can_assemble: true}` |
| RETRIEVE | `{context_items: []}` |
| GENERATE | SKIPPED → `{tool_calls: [{tool: "add_shopping_list_item", params: {name: "milk"}}]}` |
| VALIDATE | `{valid: true, confidence: 0.95}` |
| **Pipeline 2: "Remind me about the dentist Thursday"** | |
| EXTRACT | `{verb: "remind", entities: [{text: "dentist", type_hint: "unknown"}], dates: [{raw: "Thursday", parsed: "2026-04-02"}], quantities: []}` |
| RESOLVE | `{resolved: [], unresolved: ["dentist"]}` |
| CLASSIFY | `{tool: "create_action_item", confidence: 0.93, needs_llm: false, can_assemble: true}` |
| RETRIEVE | `{context_items: []}` |
| GENERATE | SKIPPED → `{tool_calls: [{tool: "create_action_item", params: {title: "Dentist", trigger_at: "2026-04-02"}}]}` |
| VALIDATE | `{valid: true, confidence: 0.93}` |

---

## Test 7: "Sophie's shoe size is now 3Y"
**Tier:** 1 | **LLM needed:** Maybe (no "Sophie" in household — novel entity)

| Stage | Output |
|---|---|
| DECOMPOSE | `["Sophie's shoe size is now 3Y"]` |
| EXTRACT | `{verb: "is", entities: [{text: "Sophie", type_hint: "person"}], dates: [], quantities: []}` |
| RESOLVE | `{resolved: [], unresolved: ["Sophie"]}` — Sophie not in people table |
| CLASSIFY | `{tool: null, confidence: 0.2, needs_llm: true, can_assemble: false}` — unresolved entity halts pipeline |
| RETRIEVE | N/A — can't retrieve without resolved entities |
| GENERATE | Should ask user: "I don't recognize Sophie. Who is that?" |
| VALIDATE | N/A |

**Note:** This tests the "unresolved entity halts pipeline" rule.

---

## Test 8: "I bought the eggs"
**Tier:** 1 | **LLM needed:** No

| Stage | Output |
|---|---|
| DECOMPOSE | `["I bought the eggs"]` |
| EXTRACT | `{verb: "bought", entities: [{text: "eggs", type_hint: "item"}], dates: [], quantities: []}` |
| RESOLVE | `{resolved: [], unresolved: ["eggs"]}` |
| CLASSIFY | `{tool: "mark_item_purchased", confidence: 0.94, needs_llm: false, can_assemble: true}` — "bought" → mark_item_purchased |
| RETRIEVE | `{context_items: []}` |
| GENERATE | SKIPPED → `{tool_calls: [{tool: "mark_item_purchased", params: {name: "eggs"}}]}` |
| VALIDATE | `{valid: true, confidence: 0.94}` |

---

## Test 9: "We have 10 rolls of toilet paper in the basement pantry"
**Tier:** 1 | **LLM needed:** No

| Stage | Output |
|---|---|
| DECOMPOSE | `["We have 10 rolls of toilet paper in the basement pantry"]` |
| EXTRACT | `{verb: "have", entities: [{text: "toilet paper", type_hint: "item"}, {text: "basement pantry", type_hint: "location"}], dates: [], quantities: [{value: 10, unit: "roll"}]}` |
| RESOLVE | `{resolved: [{mention: "basement pantry", entity_id: 5, type: "location", score: 1.0}], unresolved: ["toilet paper"]}` |
| CLASSIFY | `{tool: "add_inventory_item", confidence: 0.90, needs_llm: false, can_assemble: true}` — "have" + item + location + quantity → inventory |
| RETRIEVE | `{context_items: []}` |
| GENERATE | SKIPPED → `{tool_calls: [{tool: "add_inventory_item", params: {name: "toilet paper", quantity: 10, unit: "roll", location: "basement pantry"}}]}` |
| VALIDATE | `{valid: true, confidence: 0.90}` |

**Training outcome:** "have" + [item, location, quantity] → add_inventory_item gets added to verb_tool_lookup

---

## Test 10: "Charlie has a soccer game tomorrow at 3pm"
**Tier:** 1 | **LLM needed:** Maybe (verb "has" ambiguous, but entity types may disambiguate)

| Stage | Output |
|---|---|
| DECOMPOSE | `["Charlie has a soccer game tomorrow at 3pm"]` |
| EXTRACT | `{verb: "has", entities: [{text: "Charlie", type_hint: "person"}, {text: "soccer game", type_hint: "unknown"}], dates: [{raw: "tomorrow at 3pm", parsed: "2026-03-31T15:00"}], quantities: []}` |
| RESOLVE | `{resolved: [{mention: "Charlie", entity_id: 3, type: "person", score: 1.0}], unresolved: ["soccer game"]}` |
| CLASSIFY | `{tool: "create_action_item", confidence: 0.85, needs_llm: false, can_assemble: true}` — IF "has" + [person, activity, date] was already trained from Test 4 |
| RETRIEVE | `{context_items: [{content: "Charlie does_activity soccer", edge_type: "does_activity", relevance: 0.6}]}` |
| GENERATE | SKIPPED → `{tool_calls: [{tool: "create_action_item", params: {title: "Soccer game", person_id: 3, starts_at: "2026-03-31T15:00"}}]}` |
| VALIDATE | `{valid: true, confidence: 0.85}` |

---

## Test 11: "Schedule a date night next Saturday evening"
**Tier:** 1 | **LLM needed:** No

| Stage | Output |
|---|---|
| DECOMPOSE | `["Schedule a date night next Saturday evening"]` |
| EXTRACT | `{verb: "schedule", entities: [{text: "date night", type_hint: "unknown"}], dates: [{raw: "next Saturday evening", parsed: "2026-04-04T18:00"}], quantities: []}` |
| RESOLVE | `{resolved: [], unresolved: ["date night"]}` |
| CLASSIFY | `{tool: "create_action_item", confidence: 0.93, needs_llm: false, can_assemble: true}` — "schedule" + date → create_action_item |
| RETRIEVE | `{context_items: []}` |
| GENERATE | SKIPPED → `{tool_calls: [{tool: "create_action_item", params: {title: "Date night", starts_at: "2026-04-04T18:00", category: "relationship"}}]}` |
| VALIDATE | `{valid: true, confidence: 0.93}` |

**Note:** "category: relationship" — can ASSEMBLE infer this from "date night"? Probably not without the LLM. Maybe needs_llm should be true here for the category assignment. This is an edge case worth discussing.

---

## Test 12: "Used one of the garbage bags"
**Tier:** 1 | **LLM needed:** No

| Stage | Output |
|---|---|
| DECOMPOSE | `["Used one of the garbage bags"]` |
| EXTRACT | `{verb: "used", entities: [{text: "garbage bags", type_hint: "item"}], dates: [], quantities: [{value: 1, unit: "count"}]}` |
| RESOLVE | `{resolved: [], unresolved: ["garbage bags"]}` |
| CLASSIFY | `{tool: "update_inventory_quantity", confidence: 0.92, needs_llm: false, can_assemble: true}` — "used" + item + quantity → inventory update |
| RETRIEVE | `{context_items: []}` |
| GENERATE | SKIPPED → `{tool_calls: [{tool: "update_inventory_quantity", params: {name: "garbage bags", delta: -1}}]}` |
| VALIDATE | `{valid: true, confidence: 0.92}` |

---

## Test 13: "Pick up 3 boxes of cereal from Costco"
**Tier:** 1 | **LLM needed:** No

| Stage | Output |
|---|---|
| DECOMPOSE | `["Pick up 3 boxes of cereal from Costco"]` |
| EXTRACT | `{verb: "pick up", entities: [{text: "cereal", type_hint: "item"}, {text: "Costco", type_hint: "unknown"}], dates: [], quantities: [{value: 3, unit: "box"}]}` |
| RESOLVE | `{resolved: [], unresolved: ["cereal", "Costco"]}` |
| CLASSIFY | `{tool: "add_shopping_list_item", confidence: 0.93, needs_llm: false, can_assemble: true}` — "pick up" → shopping |
| RETRIEVE | `{context_items: []}` |
| GENERATE | SKIPPED → `{tool_calls: [{tool: "add_shopping_list_item", params: {name: "cereal", quantity_needed: 3, store: "Costco"}}]}` |
| VALIDATE | `{valid: true, confidence: 0.93}` |

**Question:** How does "Costco" get assigned to `store` parameter vs left unresolved? Entity-type mapping: Costco is unknown type, and the only unfilled slot accepting a string is `store`. But this is fragile — what if there were two unknown entities?

---

## Test 14: "Add a weekly chore to vacuum the living room, assign it to Charlie"
**Tier:** 2 | **LLM needed:** Probably yes (complex, recurrence, assignment)

| Stage | Output |
|---|---|
| DECOMPOSE | `["Add a weekly chore to vacuum the living room, assign it to Charlie"]` — single statement (no conjunction splitting a second action) |
| EXTRACT | `{verb: "add", entities: [{text: "living room", type_hint: "location"}, {text: "Charlie", type_hint: "person"}], dates: [], quantities: []}` |
| RESOLVE | `{resolved: [{mention: "Charlie", entity_id: 3, type: "person", score: 1.0}], unresolved: ["living room"]}` |
| CLASSIFY | `{tool: "create_action_item", confidence: 0.75, needs_llm: true, can_assemble: false}` — "add" + chore + person + recurrence is complex |
| RETRIEVE | `{context_items: []}` |
| GENERATE | LLM call → `{tool_calls: [{tool: "create_action_item", params: {title: "Vacuum the living room", category: "cleaning", assigned_to: 3, recurrence_interval: "1", recurrence_unit: "weeks"}}]}` |
| VALIDATE | `{valid: true, confidence: 0.80}` |

---

## Test 15: "Luke is allergic to peanuts"
**Tier:** 1 | **LLM needed:** Maybe (novel entity "Luke" not in household)

| Stage | Output |
|---|---|
| DECOMPOSE | `["Luke is allergic to peanuts"]` |
| EXTRACT | `{verb: "is", entities: [{text: "Luke", type_hint: "person"}, {text: "peanuts", type_hint: "unknown"}], dates: [], quantities: []}` |
| RESOLVE | `{resolved: [], unresolved: ["Luke", "peanuts"]}` — Luke not in people table |
| CLASSIFY | `{tool: null, confidence: 0.2, needs_llm: true, can_assemble: false}` — unresolved person entity |
| RETRIEVE | N/A |
| GENERATE | Should ask: "I don't recognize Luke. Who is that?" |
| VALIDATE | N/A |

---

## Test 16: "We need paper towels and dish soap"
**Tier:** 2 | **LLM needed:** No (decomposition into two Tier 1 commands)

| Stage | Output |
|---|---|
| DECOMPOSE | `["We need paper towels", "We need dish soap"]` |
| **Pipeline 1:** | |
| EXTRACT | `{verb: "need", entities: [{text: "paper towels", type_hint: "item"}], dates: [], quantities: []}` |
| RESOLVE | `{resolved: [], unresolved: ["paper towels"]}` |
| CLASSIFY | `{tool: "add_shopping_list_item", confidence: 0.94, needs_llm: false, can_assemble: true}` |
| GENERATE | SKIPPED → `{tool_calls: [{tool: "add_shopping_list_item", params: {name: "paper towels"}}]}` |
| VALIDATE | `{valid: true, confidence: 0.94}` |
| **Pipeline 2:** | |
| EXTRACT | `{verb: "need", entities: [{text: "dish soap", type_hint: "item"}], dates: [], quantities: []}` |
| RESOLVE | `{resolved: [], unresolved: ["dish soap"]}` |
| CLASSIFY | `{tool: "add_shopping_list_item", confidence: 0.94, needs_llm: false, can_assemble: true}` |
| GENERATE | SKIPPED → `{tool_calls: [{tool: "add_shopping_list_item", params: {name: "dish soap"}}]}` |
| VALIDATE | `{valid: true, confidence: 0.94}` |

---

## Test 17: "I finished mowing the lawn"
**Tier:** 1 | **LLM needed:** No

| Stage | Output |
|---|---|
| DECOMPOSE | `["I finished mowing the lawn"]` |
| EXTRACT | `{verb: "finished", entities: [{text: "mowing the lawn", type_hint: "unknown"}], dates: [], quantities: []}` |
| RESOLVE | `{resolved: [], unresolved: ["mowing the lawn"]}` |
| CLASSIFY | `{tool: "complete_task", confidence: 0.92, needs_llm: false, can_assemble: true}` — "finished" → complete |
| RETRIEVE | `{context_items: []}` |
| GENERATE | SKIPPED → `{tool_calls: [{tool: "complete_task", params: {title: "Mowing the lawn"}}]}` |
| VALIDATE | `{valid: true, confidence: 0.92}` |

---

## Test 18: "We had date night tonight"
**Tier:** 1 | **LLM needed:** Maybe (verb "had" is past tense, maps to logging not creating)

| Stage | Output |
|---|---|
| DECOMPOSE | `["We had date night tonight"]` |
| EXTRACT | `{verb: "had", entities: [{text: "date night", type_hint: "unknown"}], dates: [{raw: "tonight", parsed: "2026-03-30"}], quantities: []}` |
| RESOLVE | `{resolved: [], unresolved: ["date night"]}` |
| CLASSIFY | `{tool: "log_relationship_date", confidence: 0.70, needs_llm: true, can_assemble: false}` — "had" + "date night" is ambiguous without training. After training: "had" + relationship activity → log_relationship_date |
| RETRIEVE | `{context_items: []}` |
| GENERATE | LLM call → `{tool_calls: [{tool: "log_relationship_date", params: {type: "partner"}}]}` |
| VALIDATE | `{valid: true, confidence: 0.80}` |

**Training outcome:** "had" + [relationship_activity] → log_relationship_date added to verb_tool_lookup

---

## Test 19: "Save a recipe for instant pot chicken tikka masala, takes about 30 minutes"
**Tier:** 2 | **LLM needed:** Yes (complex params: method, prep time, recipe name extraction)

| Stage | Output |
|---|---|
| DECOMPOSE | `["Save a recipe for instant pot chicken tikka masala, takes about 30 minutes"]` |
| EXTRACT | `{verb: "save", entities: [{text: "instant pot chicken tikka masala", type_hint: "unknown"}], dates: [], quantities: [{value: 30, unit: "minutes"}]}` |
| RESOLVE | `{resolved: [], unresolved: ["instant pot chicken tikka masala"]}` |
| CLASSIFY | `{tool: "create_recipe", confidence: 0.88, needs_llm: true, can_assemble: false}` — "save" + "recipe" keyword → create_recipe. But needs LLM for method extraction. |
| RETRIEVE | `{context_items: []}` |
| GENERATE | LLM call → `{tool_calls: [{tool: "create_recipe", params: {name: "Chicken Tikka Masala", method: "instant_pot", prep_time_minutes: 30}}]}` |
| VALIDATE | `{valid: true, confidence: 0.85}` |

---

## Test 20: "Theo's wrestling shoes are too small, we need new ones before Thursday"
**Tier:** 3 | **LLM needed:** Yes (conversational, coreference "ones"=shoes, implicit action, causal reasoning)

| Stage | Output |
|---|---|
| DECOMPOSE | `["Theo's wrestling shoes are too small", "We need new ones before Thursday"]` — OR treats as single statement. Decomposition quality test. |
| **If decomposed into two statements:** | |
| **Pipeline 1: "Theo's wrestling shoes are too small"** | |
| EXTRACT | `{verb: "are", entities: [{text: "Theo", type_hint: "person"}, {text: "wrestling shoes", type_hint: "item"}], dates: [], quantities: []}` |
| RESOLVE | `{resolved: [{mention: "Theo", entity_id: 4, type: "person", score: 1.0}], unresolved: ["wrestling shoes"]}` |
| CLASSIFY | `{tool: null, confidence: 0.3, needs_llm: true}` — "are" is not actionable, state description |
| GENERATE | LLM → knowledge triple: `{subject: "Theo's wrestling shoes", edge_type: "condition", object: "too small"}` + possibly `{tool_calls: [{tool: "add_person_attribute", params: {person: "Theo", attribute_type: "shoe_size_status", value: "too small"}}]}` |
| **Pipeline 2: "We need new ones before Thursday"** | |
| EXTRACT | `{verb: "need", entities: [], dates: [{raw: "before Thursday", parsed: "2026-04-02"}], quantities: []}` — "ones" is a pronoun, not an entity |
| RESOLVE | `{resolved: [], unresolved: []}` — nothing to resolve. Coreference "ones" = "wrestling shoes" from Pipeline 1 is LOST without coreference resolution. |
| CLASSIFY | `{tool: null, confidence: 0.2, needs_llm: true}` — no entities to work with |
| GENERATE | LLM needs both statements in context → `{tool_calls: [{tool: "add_shopping_list_item", params: {name: "wrestling shoes", person: "Theo"}}]}` |

**Note:** This is the hardest test case. It demonstrates why Tier 3 needs the LLM — coreference across decomposed statements, implicit actions from state descriptions, causal reasoning. The decomposition may actually HURT here by splitting context. This might argue for sending both statements together to GENERATE.
