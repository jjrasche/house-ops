# Pipeline Test Cases — 20 inputs traced through all stages

> Pipeline: EXTRACT → RESOLVE → CLASSIFY → (ASSEMBLE or RETRIEVE+GENERATE) → VALIDATE
> No DECOMPOSE stage. Compound inputs route to LLM path.

## Seed Data (test fixtures)

**People:** Jim (id:1), Justine (id:2), Charlie (id:3), Theo (id:4), Lily (id:5, cat), Desi (id:6, bearded dragon)
**Locations:** Kitchen (id:1), Garage (id:2), Basement (id:3), Pantry (id:4, parent:Kitchen), Basement Pantry (id:5, parent:Basement), Charlie's Room (id:6), Theo's Room (id:7)
**Items:** milk (id:1), eggs (id:2), cereal (id:3), paper towels (id:4), dish soap (id:5), toilet paper (id:6), garbage bags (id:7), laundry detergent (id:8)
**Stores (kg_entities):** Costco (id:101), Kroger (id:102), Target (id:103)
**Activities (kg_entities):** wrestling (id:201), soccer (id:202)
**Actions (test-only):** Mow the lawn (id:1, status:pending, recurrence_rule:FREQ=WEEKLY)

## Design Decisions

1. **Products resolve.** milk, eggs, etc. are seeded items. RESOLVE returns entity_id + type "item".
2. **Stores resolve.** Costco, Kroger, Target are kg_entities with type "store".
3. **More resolved = higher confidence.** All-resolved inputs get +0.05 confidence boost over partially-resolved.
4. **Entity-type-to-param mapping.** One entity per type per tool call. Two same-typed entities → LLM path.
5. **Compound inputs → LLM.** "X and Y" with two distinct intents always routes to GENERATE.

## Tools

| Tool | Table | Purpose |
|---|---|---|
| `create_item` | items | New item (novel product first encounter) |
| `update_item` | items | Status change, quantity change, location change |
| `create_action` | actions | New event, task, reminder, chore |
| `update_action` | actions | Complete, dismiss, reschedule |
| `create_recipe` | recipes | New recipe with metadata |

---

## Test 1: "Buy milk"
**Tier:** 1 | **Path:** deterministic

| Stage | Output |
|---|---|
| EXTRACT | `{verb: "buy", entityMentions: [{text: "milk", typeHint: "item"}], dates: [], quantities: []}` |
| RESOLVE | `{resolved: [{mention: "milk", entityId: 1, entityType: "item", score: 1.0}], unresolved: []}` |
| CLASSIFY | `{toolName: "update_item", confidence: 0.95, needsLlm: false, canAssemble: true}` |
| ASSEMBLE | `{toolCalls: [{tool: "update_item", params: {item_id: 1, status: "on_list"}}]}` |
| VALIDATE | `{isValid: true, errors: [], confidence: 0.95}` |

---

## Test 2: "Add 3 boxes of cereal to the shopping list"
**Tier:** 1 | **Path:** deterministic

| Stage | Output |
|---|---|
| EXTRACT | `{verb: "add", entityMentions: [{text: "cereal", typeHint: "item"}], dates: [], quantities: [{value: 3, unit: "box"}]}` |
| RESOLVE | `{resolved: [{mention: "cereal", entityId: 3, entityType: "item", score: 1.0}], unresolved: []}` |
| CLASSIFY | `{toolName: "update_item", confidence: 0.93, needsLlm: false, canAssemble: true}` |
| ASSEMBLE | `{toolCalls: [{tool: "update_item", params: {item_id: 3, status: "on_list", quantity_needed: 3, unit: "box"}}]}` |
| VALIDATE | `{isValid: true, errors: [], confidence: 0.93}` |

---

## Test 3: "Remind me Thursday about the dentist"
**Tier:** 1 | **Path:** deterministic

| Stage | Output |
|---|---|
| EXTRACT | `{verb: "remind", entityMentions: [{text: "dentist", typeHint: "unknown"}], dates: [{raw: "Thursday", parsed: "2026-04-02"}], quantities: []}` |
| RESOLVE | `{resolved: [], unresolved: ["dentist"]}` |
| CLASSIFY | `{toolName: "create_action", confidence: 0.93, needsLlm: false, canAssemble: true}` — "dentist" is unresolved but maps to VALUE param (title), not REFERENCE |
| ASSEMBLE | `{toolCalls: [{tool: "create_action", params: {title: "Dentist", starts_at: "2026-04-02"}}]}` |
| VALIDATE | `{isValid: true, errors: [], confidence: 0.93}` |

---

## Test 4: "Theo has wrestling at 4"
**Tier:** 1 | **Path:** llm (verb "has" not in verb_tool_lookup initially)

| Stage | Output |
|---|---|
| EXTRACT | `{verb: "has", entityMentions: [{text: "Theo", typeHint: "person"}, {text: "wrestling", typeHint: "unknown"}], dates: [{raw: "at 4", parsed: "2026-03-30T16:00"}], quantities: []}` |
| RESOLVE | `{resolved: [{mention: "Theo", entityId: 4, entityType: "person", score: 1.0}, {mention: "wrestling", entityId: 201, entityType: "activity", score: 1.0}], unresolved: []}` |
| CLASSIFY | `{toolName: null, confidence: 0.4, needsLlm: true, canAssemble: false}` — "has" not in verb_tool_lookup |
| RETRIEVE | `{contextItems: [{content: "Theo does_activity wrestling", edgeType: "does_activity", relevance: 0.8}]}` |
| GENERATE | `{toolCalls: [{tool: "create_action", params: {title: "Wrestling", person_id: 4, starts_at: "2026-03-30T16:00"}}], knowledgeTriples: []}` |
| VALIDATE | `{isValid: true, errors: [], confidence: 0.85}` |

**Training:** On confirm → INSERT verb_tool_lookup: ("has", ["person", "activity"]) → "create_action"

---

## Test 5: "We're out of eggs"
**Tier:** 1 | **Path:** deterministic (EXTRACT recognizes "out of" as verb phrase)

| Stage | Output |
|---|---|
| EXTRACT | `{verb: "out of", entityMentions: [{text: "eggs", typeHint: "item"}], dates: [], quantities: []}` |
| RESOLVE | `{resolved: [{mention: "eggs", entityId: 2, entityType: "item", score: 1.0}], unresolved: []}` |
| CLASSIFY | `{toolName: "update_item", confidence: 0.90, needsLlm: false, canAssemble: true}` — "out of" + item → update status |
| ASSEMBLE | `{toolCalls: [{tool: "update_item", params: {item_id: 2, status: "needed"}}]}` |
| VALIDATE | `{isValid: true, errors: [], confidence: 0.90}` |

**Note:** "out of" is seeded in verb_tool_lookup. Without it, EXTRACT returns verb="are" which routes to LLM.

---

## Test 6: "Buy milk and remind me about the dentist Thursday"
**Tier:** 2 | **Path:** llm (compound input — two distinct intents joined by "and")

| Stage | Output |
|---|---|
| EXTRACT | `{verb: "buy", entityMentions: [{text: "milk", typeHint: "item"}, {text: "dentist", typeHint: "unknown"}], dates: [{raw: "Thursday", parsed: "2026-04-02"}], quantities: []}` |
| RESOLVE | `{resolved: [{mention: "milk", entityId: 1, entityType: "item", score: 1.0}], unresolved: ["dentist"]}` |
| CLASSIFY | `{toolName: null, confidence: 0.4, needsLlm: true, canAssemble: false}` — compound input: mixed entity types + secondary verb "remind" implied |
| RETRIEVE | `{contextItems: []}` |
| GENERATE | `{toolCalls: [{tool: "update_item", params: {item_id: 1, status: "on_list"}}, {tool: "create_action", params: {title: "Dentist", starts_at: "2026-04-02"}}], knowledgeTriples: []}` |
| VALIDATE | `{isValid: true, errors: [], confidence: 0.85}` |

---

## Test 7: "Sophie's shoe size is now 3Y"
**Tier:** 1 | **Path:** halted (unresolved person — novel entity)

| Stage | Output |
|---|---|
| EXTRACT | `{verb: "is", entityMentions: [{text: "Sophie", typeHint: "person"}], dates: [], quantities: []}` |
| RESOLVE | `{resolved: [], unresolved: ["Sophie"]}` — not in people table |
| CLASSIFY | HALTED — unresolved REFERENCE entity (person). Pipeline asks: "I don't recognize Sophie. Who is that?" |

---

## Test 8: "I bought the eggs"
**Tier:** 1 | **Path:** deterministic

| Stage | Output |
|---|---|
| EXTRACT | `{verb: "bought", entityMentions: [{text: "eggs", typeHint: "item"}], dates: [], quantities: []}` |
| RESOLVE | `{resolved: [{mention: "eggs", entityId: 2, entityType: "item", score: 1.0}], unresolved: []}` |
| CLASSIFY | `{toolName: "update_item", confidence: 0.94, needsLlm: false, canAssemble: true}` — "bought" → status=purchased |
| ASSEMBLE | `{toolCalls: [{tool: "update_item", params: {item_id: 2, status: "purchased"}}]}` |
| VALIDATE | `{isValid: true, errors: [], confidence: 0.94}` |

---

## Test 9: "We have 10 rolls of toilet paper in the basement pantry"
**Tier:** 1 | **Path:** deterministic

| Stage | Output |
|---|---|
| EXTRACT | `{verb: "have", entityMentions: [{text: "toilet paper", typeHint: "item"}, {text: "basement pantry", typeHint: "location"}], dates: [], quantities: [{value: 10, unit: "roll"}]}` |
| RESOLVE | `{resolved: [{mention: "toilet paper", entityId: 6, entityType: "item", score: 1.0}, {mention: "basement pantry", entityId: 5, entityType: "location", score: 1.0}], unresolved: []}` |
| CLASSIFY | `{toolName: "update_item", confidence: 0.92, needsLlm: false, canAssemble: true}` — "have" + item + location + quantity → stock update |
| ASSEMBLE | `{toolCalls: [{tool: "update_item", params: {item_id: 6, quantity: 10, unit: "roll", location_id: 5, status: "stocked"}}]}` |
| VALIDATE | `{isValid: true, errors: [], confidence: 0.92}` |

---

## Test 10: "Charlie has a soccer game tomorrow at 3pm"
**Tier:** 1 | **Path:** deterministic (IF trained from Test 4: "has" + [person, activity] → create_action)

| Stage | Output |
|---|---|
| EXTRACT | `{verb: "has", entityMentions: [{text: "Charlie", typeHint: "person"}, {text: "soccer game", typeHint: "unknown"}], dates: [{raw: "tomorrow at 3pm", parsed: "2026-03-31T15:00"}], quantities: []}` |
| RESOLVE | `{resolved: [{mention: "Charlie", entityId: 3, entityType: "person", score: 1.0}, {mention: "soccer", entityId: 202, entityType: "activity", score: 0.85}], unresolved: []}` — "soccer game" fuzzy-matches "soccer" activity |
| CLASSIFY | `{toolName: "create_action", confidence: 0.85, needsLlm: false, canAssemble: true}` — trained: "has" + [person, activity] → create_action |
| ASSEMBLE | `{toolCalls: [{tool: "create_action", params: {title: "Soccer game", person_id: 3, starts_at: "2026-03-31T15:00"}}]}` |
| VALIDATE | `{isValid: true, errors: [], confidence: 0.85}` |

**Depends on:** Test 4 training outcome. Without training, this goes to LLM path (same as Test 4).

---

## Test 11: "Schedule a date night next Saturday evening"
**Tier:** 1 | **Path:** deterministic

| Stage | Output |
|---|---|
| EXTRACT | `{verb: "schedule", entityMentions: [{text: "date night", typeHint: "unknown"}], dates: [{raw: "next Saturday evening", parsed: "2026-04-04T18:00"}], quantities: []}` |
| RESOLVE | `{resolved: [], unresolved: ["date night"]}` |
| CLASSIFY | `{toolName: "create_action", confidence: 0.93, needsLlm: false, canAssemble: true}` — "schedule" + date → create_action. "date night" maps to VALUE param (title) |
| ASSEMBLE | `{toolCalls: [{tool: "create_action", params: {title: "Date night", starts_at: "2026-04-04T18:00"}}]}` |
| VALIDATE | `{isValid: true, errors: [], confidence: 0.93}` |

---

## Test 12: "Used one of the garbage bags"
**Tier:** 1 | **Path:** deterministic

| Stage | Output |
|---|---|
| EXTRACT | `{verb: "used", entityMentions: [{text: "garbage bags", typeHint: "item"}], dates: [], quantities: [{value: 1, unit: "count"}]}` |
| RESOLVE | `{resolved: [{mention: "garbage bags", entityId: 7, entityType: "item", score: 1.0}], unresolved: []}` |
| CLASSIFY | `{toolName: "update_item", confidence: 0.92, needsLlm: false, canAssemble: true}` — "used" + item + quantity → decrement |
| ASSEMBLE | `{toolCalls: [{tool: "update_item", params: {item_id: 7, quantity_delta: -1}}]}` |
| VALIDATE | `{isValid: true, errors: [], confidence: 0.92}` |

---

## Test 13: "Pick up 3 boxes of cereal from Costco"
**Tier:** 1 | **Path:** deterministic

| Stage | Output |
|---|---|
| EXTRACT | `{verb: "pick up", entityMentions: [{text: "cereal", typeHint: "item"}, {text: "Costco", typeHint: "unknown"}], dates: [], quantities: [{value: 3, unit: "box"}]}` |
| RESOLVE | `{resolved: [{mention: "cereal", entityId: 3, entityType: "item", score: 1.0}, {mention: "Costco", entityId: 101, entityType: "store", score: 1.0}], unresolved: []}` |
| CLASSIFY | `{toolName: "update_item", confidence: 0.95, needsLlm: false, canAssemble: true}` — "pick up" → on_list, all entities resolved |
| ASSEMBLE | `{toolCalls: [{tool: "update_item", params: {item_id: 3, status: "on_list", quantity_needed: 3, unit: "box", store_id: 101}}]}` |
| VALIDATE | `{isValid: true, errors: [], confidence: 0.95}` |

---

## Test 14: "Add a weekly chore to vacuum the living room, assign it to Charlie"
**Tier:** 2 | **Path:** llm (recurrence extraction + role assignment)

| Stage | Output |
|---|---|
| EXTRACT | `{verb: "add", entityMentions: [{text: "living room", typeHint: "location"}, {text: "Charlie", typeHint: "person"}], dates: [], quantities: []}` |
| RESOLVE | `{resolved: [{mention: "Charlie", entityId: 3, entityType: "person", score: 1.0}], unresolved: ["living room"]}` — living room not in seeded locations |
| CLASSIFY | `{toolName: "create_action", confidence: 0.75, needsLlm: true, canAssemble: false}` — recurrence + role assignment too complex for deterministic |
| RETRIEVE | `{contextItems: []}` |
| GENERATE | `{toolCalls: [{tool: "create_action", params: {title: "Vacuum the living room", assigned_to: 3, recurrence_rule: "FREQ=WEEKLY", category: "chore"}}], knowledgeTriples: []}` |
| VALIDATE | `{isValid: true, errors: [], confidence: 0.80}` |

---

## Test 15: "Luke is allergic to peanuts"
**Tier:** 1 | **Path:** halted (unresolved person — novel entity)

| Stage | Output |
|---|---|
| EXTRACT | `{verb: "is", entityMentions: [{text: "Luke", typeHint: "person"}, {text: "peanuts", typeHint: "unknown"}], dates: [], quantities: []}` |
| RESOLVE | `{resolved: [], unresolved: ["Luke", "peanuts"]}` — Luke not in people table |
| CLASSIFY | HALTED — unresolved REFERENCE entity (person). Pipeline asks: "I don't recognize Luke. Who is that?" |

---

## Test 16: "We need paper towels and dish soap"
**Tier:** 2 | **Path:** llm (compound input — two items require two tool calls)

| Stage | Output |
|---|---|
| EXTRACT | `{verb: "need", entityMentions: [{text: "paper towels", typeHint: "item"}, {text: "dish soap", typeHint: "item"}], dates: [], quantities: []}` |
| RESOLVE | `{resolved: [{mention: "paper towels", entityId: 4, entityType: "item", score: 1.0}, {mention: "dish soap", entityId: 5, entityType: "item", score: 1.0}], unresolved: []}` |
| CLASSIFY | `{toolName: "update_item", confidence: 0.80, needsLlm: true, canAssemble: false}` — two entities of same type (item) → can't map to single tool call |
| RETRIEVE | `{contextItems: []}` |
| GENERATE | `{toolCalls: [{tool: "update_item", params: {item_id: 4, status: "needed"}}, {tool: "update_item", params: {item_id: 5, status: "needed"}}], knowledgeTriples: []}` |
| VALIDATE | `{isValid: true, errors: [], confidence: 0.90}` |

---

## Test 17: "I finished mowing the lawn"
**Tier:** 1 | **Path:** deterministic (assumes matching action exists in DB)

| Stage | Output |
|---|---|
| EXTRACT | `{verb: "finished", entityMentions: [{text: "mowing the lawn", typeHint: "unknown"}], dates: [], quantities: []}` |
| RESOLVE | `{resolved: [{mention: "mowing the lawn", entityId: 1, entityType: "action", score: 0.85}], unresolved: []}` — fuzzy matches "Mow the lawn" action |
| CLASSIFY | `{toolName: "update_action", confidence: 0.92, needsLlm: false, canAssemble: true}` — "finished" → status=done |
| ASSEMBLE | `{toolCalls: [{tool: "update_action", params: {action_id: 1, status: "done"}}]}` |
| VALIDATE | `{isValid: true, errors: [], confidence: 0.92}` |

---

## Test 18: "We had date night tonight"
**Tier:** 1 | **Path:** llm ("had" past tense ambiguous, logging completed event)

| Stage | Output |
|---|---|
| EXTRACT | `{verb: "had", entityMentions: [{text: "date night", typeHint: "unknown"}], dates: [{raw: "tonight", parsed: "2026-03-30T20:00"}], quantities: []}` |
| RESOLVE | `{resolved: [], unresolved: ["date night"]}` |
| CLASSIFY | `{toolName: null, confidence: 0.4, needsLlm: true, canAssemble: false}` — "had" past tense not in verb_tool_lookup |
| RETRIEVE | `{contextItems: []}` |
| GENERATE | `{toolCalls: [{tool: "create_action", params: {title: "Date night", starts_at: "2026-03-30T20:00", status: "done"}}], knowledgeTriples: []}` |
| VALIDATE | `{isValid: true, errors: [], confidence: 0.80}` |

**Training:** On confirm → INSERT verb_tool_lookup: ("had", []) → "create_action" (with status=done hint)

---

## Test 19: "Save a recipe for instant pot chicken tikka masala, takes about 30 minutes"
**Tier:** 2 | **Path:** llm (complex params: method extraction, name parsing)

| Stage | Output |
|---|---|
| EXTRACT | `{verb: "save", entityMentions: [{text: "instant pot chicken tikka masala", typeHint: "unknown"}], dates: [], quantities: [{value: 30, unit: "minutes"}]}` |
| RESOLVE | `{resolved: [], unresolved: ["instant pot chicken tikka masala"]}` |
| CLASSIFY | `{toolName: "create_recipe", confidence: 0.88, needsLlm: true, canAssemble: false}` — "save" + "recipe" keyword → create_recipe, but needs LLM for method extraction |
| RETRIEVE | `{contextItems: []}` |
| GENERATE | `{toolCalls: [{tool: "create_recipe", params: {name: "Chicken Tikka Masala", method: "instant_pot", prep_time_minutes: 30}}], knowledgeTriples: []}` |
| VALIDATE | `{isValid: true, errors: [], confidence: 0.85}` |

---

## Test 20: "Theo's wrestling shoes are too small, we need new ones before Thursday"
**Tier:** 3 | **Path:** llm (compound, coreference "ones"=shoes, implicit actions, causal reasoning)

| Stage | Output |
|---|---|
| EXTRACT | `{verb: "are", entityMentions: [{text: "Theo", typeHint: "person"}, {text: "wrestling shoes", typeHint: "item"}], dates: [{raw: "before Thursday", parsed: "2026-04-02"}], quantities: []}` |
| RESOLVE | `{resolved: [{mention: "Theo", entityId: 4, entityType: "person", score: 1.0}], unresolved: ["wrestling shoes"]}` |
| CLASSIFY | `{toolName: null, confidence: 0.25, needsLlm: true, canAssemble: false}` — compound + state description + coreference |
| RETRIEVE | `{contextItems: [{content: "Theo does_activity wrestling", edgeType: "does_activity", relevance: 0.7}, {content: "Theo has_shoe_size 2Y", edgeType: "has_shoe_size", relevance: 0.5}]}` |
| GENERATE | `{toolCalls: [{tool: "create_item", params: {name: "Wrestling shoes", person_id: 4, status: "needed"}}, {tool: "create_action", params: {title: "Buy wrestling shoes for Theo", due_at: "2026-04-02"}}], knowledgeTriples: [{subjectId: 4, edgeType: "has_condition", objectId: null, confidence: 0.7}]}` |
| VALIDATE | `{isValid: true, errors: [], confidence: 0.70}` |

**Note:** Hardest test. Demonstrates why compound + coreference + implicit action needs the LLM. "ones" = wrestling shoes (coreference). "too small" = state description (not directly actionable). "we need" = implicit shopping action. "before Thursday" = deadline for the shopping action, not the state description.

---

## Coverage Matrix

| Test | Path | Stages exercised | Key pattern tested |
|---|---|---|---|
| 1 | deterministic | E→R→C→A→V | Simple item status change (buy → on_list) |
| 2 | deterministic | E→R→C→A→V | Quantity + unit extraction |
| 3 | deterministic | E→R→C→A→V | Date parsing, unresolved entity as VALUE param |
| 4 | llm | E→R→C→Ret→G→V | Ambiguous verb, activity resolution, training signal |
| 5 | deterministic | E→R→C→A→V | "out of" verb phrase → status=needed |
| 6 | llm | E→R→C→G→V | Compound input (two intents) |
| 7 | halted | E→R→halt | Novel person entity → ask user |
| 8 | deterministic | E→R→C→A→V | Past tense verb "bought" → status=purchased |
| 9 | deterministic | E→R→C→A→V | Multi-entity (item + location) + quantity |
| 10 | deterministic | E→R→C→A→V | Training-dependent (requires Test 4 outcome) |
| 11 | deterministic | E→R→C→A→V | Schedule verb, unresolved as VALUE param |
| 12 | deterministic | E→R→C→A→V | Consumption → quantity decrement |
| 13 | deterministic | E→R→C→A→V | Store resolution, multi-entity type mapping |
| 14 | llm | E→R→C→G→V | Recurrence + role assignment |
| 15 | halted | E→R→halt | Novel person entity → ask user |
| 16 | llm | E→R→C→G→V | Two same-typed entities → multi-tool-call |
| 17 | deterministic | E→R→C→A→V | Action resolution (fuzzy match existing action) |
| 18 | llm | E→R→C→G→V | Past tense logging, ambiguous verb |
| 19 | llm | E→R→C→G→V | Complex param extraction (recipe method, name) |
| 20 | llm | E→R→C→Ret→G→V | Compound + coreference + implicit action |

**Path distribution:** 9 deterministic, 7 llm, 2 halted, 2 training-dependent
