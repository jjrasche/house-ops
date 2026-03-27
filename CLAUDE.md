# HouseOps

Household operations platform that makes invisible family work visible and actionable.
Single text input + swipeable read-only panels. LLM parses natural language into structured tool calls against shared Postgres tables. Features are filtered views + scoped injection into shared tables.

## Stack
- Language: TypeScript
- Framework: React (PWA)
- Database: PostgreSQL via Supabase (self-hosted)
- AI: Groq API (tool calling — small model first, escalate on rejection)
- Deployment: Ansible → Hetzner VPS, Docker Compose for Supabase

## Commands
```bash
# Supabase local dev
supabase start

# Frontend dev
cd frontend && npm run dev

# Run migrations
supabase db push

# Edge Functions local
supabase functions serve

# NLI eval suite
cd nli && npx promptfoo eval
```

## Architecture

### Key Directories
- `supabase/migrations/` — Postgres schema migrations
- `supabase/functions/` — Edge Functions (Groq chat proxy)
- `nli/` — Promptfoo NLI eval suite
- `frontend/` — React PWA (not yet scaffolded)

### Data Flow
User types into omnibox → Edge Function proxies to Groq → LLM returns tool calls → confirmation card shown → user approves → frontend executes via Supabase REST API → Postgres triggers handle cascading effects (inventory depletion → shopping list). pg_cron handles time-based checks (overdue tasks, maintenance reminders). Panels are read-only queries against shared tables. All conversations persisted to messages table.

### Shared Tables (features are views on these)
people, locations, inventory, tasks, events, recipes, recipe_steps, recipe_ingredients, meal_plan, shopping_list_items, person_attributes, relationship_dates, action_log, households, profiles, conversations, messages

### Automation Tiers
1. Postgres triggers — data-to-data reactions (inventory → shopping list, task recurrence)
2. pg_cron — scheduled checks (overdue tasks, maintenance due dates)
3. Edge Function → Groq — LLM chat proxy (thin pass-through, no business logic)

## Global References

Read these from `~/.claude/references/` when relevant:
- `coding-standards.md` — Full coding standards with examples

## Project-Specific Notes
- One Edge Function: Groq chat proxy (`supabase/functions/chat/`). All other logic stays in Postgres.
- Calendar panel is read-only (no Google Calendar write integration yet)
- LLM never touches DB directly — produces structured tool calls, app executes
- Plan-validate-execute: every LLM action gets confirmation card, logged to action_log
- Person attributes use EAV pattern (small, variable attribute set with history)
- Location hierarchy via parent_location_id — LLM receives plain strings, API resolves
