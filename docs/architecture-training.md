# Training Architecture

How each pipeline stage learns from usage. Every stage has: a signal source, a storage mechanism, and a way the signal changes behavior.

## Core Pattern: LLM Bootstraps Deterministic

The LLM fallback path is a training mechanism. Every confirmed LLM result becomes a candidate row in the deterministic tables. Human reviews and promotes to production.

```
Input -> deterministic fails -> LLM fallback -> user confirms
  -> candidate row in deterministic table (source='llm_candidate')
  -> review queue surfaces it
  -> human promotes to 'user_confirmed'
  -> next time: deterministic handles it
```

Track: % of inputs requiring LLM fallback per week. Should decline over time.

## Source Column Convention

Every trainable table has a `source` column:
- 'seed': initial data, loaded at setup
- 'llm_candidate': proposed by LLM, not yet confirmed
- 'user_confirmed': human reviewed and approved
- Only 'seed' and 'user_confirmed' rows are used in the production pipeline

## Stage-by-Stage Training

### EXTRACT
| Signal | Storage | Behavior Change |
|---|---|---|
| User flags missed entity | entity_lexicon (new surface form) | Lexicon scan finds it next time |
| LLM extracts entity deterministic missed | entity_lexicon (source='llm_candidate') | After confirm: lexicon grows |
| New quantity unit from LLM path | quantity_unit_aliases (source='llm_candidate') | After confirm: regex pattern regenerated |
| Wrong date parse | Logged to stage_executions | Manual review, potential chrono-node config |

### RESOLVE
| Signal | Storage | Behavior Change |
|---|---|---|
| "I meant X not Y" | resolution_context_rules (verb + surface_form -> preferred entity) | Verb-context boost applies next time |
| New entity alias | kg_aliases (source='user_confirmed') | Fuzzy match finds it next time |
| Novel entity confirmed | kg_entities + appropriate operational table | Entity exists in DB, resolves next time |

### CLASSIFY
| Signal | Storage | Behavior Change |
|---|---|---|
| Wrong tool selected | verb_tool_lookup (verb + entity_types -> correct tool) | Deterministic routing next time |
| LLM classified successfully | verb_tool_lookup (source='llm_candidate') | After confirm: deterministic |
| Novel verb used | verb_tool_lookup (new entry after LLM + confirm) | New verb maps to tool |

### RETRIEVE
| Signal | Storage | Behavior Change |
|---|---|---|
| Context item included | context_relevance_weights: alpha += 1 | Weight increases for (intent, edge_type) |
| Context item excluded | context_relevance_weights: beta += 1 | Weight decreases, eventually filtered out |
| After 5+ signals, weight < 0.3 | That edge_type excluded for that intent | Less noise in LLM context |

Beta distribution with Laplace smoothing. Minimum 5 observations before filtering active.

### GENERATE
| Signal | Storage | Behavior Change |
|---|---|---|
| Tool call accepted | tool_call_examples (positive few-shot) | Injected into system prompt next time |
| Tool call corrected | tool_call_examples (corrected version) | Better few-shot example |
| Tool call rejected | intent_few_shots (negative example) | "X is NOT tool Y" in prompt |
| Few-shot effectiveness tracking | EMA: 0.8 * old + 0.2 * outcome | Low-effectiveness examples demoted |

### VALIDATE
| Signal | Storage | Behavior Change |
|---|---|---|
| Rejection patterns | Analyzed offline | New business rules added to code |
| Schema violations | Logged to stage_executions | Tool schema adjustments |

## Stage I/O Logging

Every execution of every stage logged to stage_executions:
- stage, input_payload (JSONB), output_payload (JSONB)
- confidence, duration_ms, model_version
- user_verdict ('correct', 'incorrect', null)
- conversation_id, household_id

This is the training data AND debugging data for every stage. Any new implementation can be backtested against the full history.

## Stage Contract

Every stage follows this interface:

```typescript
interface StageRunner<TInput, TOutput> {
  name: string;
  run(input: TInput): Promise<TOutput>;
  evaluate(input: TInput, output: TOutput, expected: TOutput): EvalResult;
}
```

- Stages are swappable: same interface, different implementation
- Two implementations can run in parallel (A/B testing)
- The evaluate() method quantifies correctness per stage

## Review Queue

LLM candidates surface as cards in the UI:
- verb_tool_lookup candidates: "I used [verb] -> [tool]. Confirm?"
- entity candidates: "I think [X] is a [type]. Confirm?"
- edge_type candidates: "I extracted [subject] [edge] [object]. Confirm?"

Human can: confirm (promote to production), reject (delete), edit (correct + promote).

## Feedback Card Types

| Stage | Card Type | User Action |
|---|---|---|
| EXTRACT | "I didn't find [entity]. Is it [type]?" | Confirm type, add to DB |
| RESOLVE | "Did you mean [X] or [Y]?" | Pick correct entity |
| CLASSIFY | "I chose [tool]. Was that right?" | Confirm or pick correct tool |
| RETRIEVE | "Here's what I used for context" (post-rejection) | Include/exclude items |
| GENERATE | Confirmation card with tool call details | Accept/reject/correct |
| VALIDATE | Error message | Fix input or adjust |

## Event-Driven, Not Cron

- Knowledge extraction: fires on INSERT to messages (Postgres trigger)
- Feedback processing: fires on INSERT to feedback tables (Postgres triggers)
- Entity lexicon rebuild: fires on INSERT/UPDATE/DELETE to people/locations/inventory (triggers)
- No pg_cron. Everything reacts to data changes.
