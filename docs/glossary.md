# Glossary

Terms specific to the HouseOps pipeline architecture.

## Pipeline Stages
- **EXTRACT**: Deterministic stage. Finds verbs (compromise.js), entity mentions (entity_lexicon scan), dates (chrono-node), quantities (regex). No LLM.
- **RESOLVE**: Deterministic stage. Maps extracted entity mentions to database IDs using pg_trgm fuzzy matching, alias tables, and verb-context rules. If an entity can't be resolved, the pipeline halts and asks the user.
- **CLASSIFY**: Deterministic stage. Maps verb + resolved entity types to a tool name using the verb_tool_lookup table. Decides if the deterministic path can handle this input or if the LLM is needed.
- **ASSEMBLE**: Deterministic sub-step of the confident path. Fills tool call parameters from resolved entities, dates, and quantities using entity-type-to-parameter-type mapping.
- **RETRIEVE**: LLM path only. Pulls context from the knowledge graph scoped by the classified intent. Filters by context_relevance_weights.
- **GENERATE**: LLM path only. ONE Groq API call that receives pre-resolved entities + context + scoped tool schemas and produces tool calls.
- **VALIDATE**: Runs on both paths. Schema validation, FK existence checks, business rules, confidence scoring.

## Database Concepts
- **entity_lexicon**: Table of pre-generated surface forms for known entities. "theo", "theos" (possessive stripped), "the kids" (group alias). Built by triggers on people/locations/inventory/products tables.
- **verb_tool_lookup**: Table mapping verb + entity_type array to a tool name. The deterministic classifier. Grows from LLM fallback results confirmed by user.
- **quantity_units / quantity_unit_aliases**: Tables for unit vocabulary. "box", "boxes", "bocks" (STT error). Regex for quantity extraction is generated from this table.
- **stage_executions**: Logs every stage's input and output for every pipeline run. Training data and debugging data.
- **resolution_context_rules**: Learned rules for verb-context entity disambiguation. "feed" + "Charlie" prefers Charlie-the-cat over Charlie-the-person.
- **context_relevance_weights**: Beta distribution (alpha/beta) per (intent, edge_type). Learned from user feedback on context item relevance.
- **edge_type_registry**: Hierarchical registry of relationship types in the knowledge graph. ~28 leaf types.
- **edge_type_synonyms**: Maps non-canonical edge type names to canonical ones. In DB, trainable.

## Patterns
- **LLM trains deterministic**: Every LLM fallback result that the user confirms becomes a new row in the deterministic tables. The system gets more deterministic over time.
- **source column**: Every trainable table has source: 'seed' | 'llm_candidate' | 'user_confirmed'. Only seed and user_confirmed used in production.
- **Structural confidence**: Confidence measured from measurable signals (param completeness, fuzzy match scores, historical acceptance rate), never by asking the LLM.
- **Event-driven**: All reactions are Postgres triggers or Supabase Realtime events. No cron jobs.

## Technology
- **Deno**: JavaScript/TypeScript runtime that Supabase Edge Functions run on. Like Node.js with built-in TypeScript.
- **pg_trgm**: Postgres extension for trigram-based fuzzy string matching. Used for entity resolution.
- **chrono-node**: TypeScript library for parsing natural language dates ("next Thursday" -> 2026-04-02).
- **compromise.js**: Lightweight TypeScript NLP library (250KB). Does verb/noun extraction and POS tagging. Does NOT do dependency parsing.
- **Dependency parsing**: Determining which words in a sentence relate to which (subject, object, prepositional attachment). No JS library does this. spaCy (Python) does. Deferred for HouseOps.
- **Groq**: LLM inference API. HouseOps uses gpt-oss-20b (primary) and gpt-oss-120b (escalation).
- **Edge Function**: Supabase's serverless function runtime (Deno). Where the pipeline runs server-side.
