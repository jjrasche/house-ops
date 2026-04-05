# HouseOps

Household operations platform. Natural language input → deterministic pipeline → tool calls.
75% of commands handled with zero LLM calls. LLM fallback trains the deterministic system.

## Stack
- Language: TypeScript
- Framework: React (PWA)
- Database: PostgreSQL via Supabase (self-hosted)
- AI: Groq API (gpt-oss-20b primary, gpt-oss-120b escalation)
- Deployment: Ansible → Hetzner VPS, Docker Compose for Supabase

## Commands
```bash
supabase start                    # Local Supabase stack
cd frontend && npm run dev        # Frontend dev
supabase db reset                 # Apply migrations + seed
supabase functions serve --env-file supabase/.env.local --no-verify-jwt  # Edge Functions
cd frontend && npx vitest run     # Run tests
```

## Architecture

See `docs/` for full architecture:
- `docs/architecture-pipeline.md` — THE source of truth (pipeline, tables, entity model)
- `docs/architecture-knowledge-graph.md` — kg tables, edge types, traversal
- `docs/architecture-training.md` — per-stage training, feedback loops
- `docs/glossary.md` — term definitions
- `docs/pipeline-test-cases.md` — 20 test inputs traced through stages

### Core Tables (4)
people, items, actions, locations. Everything else is knowledge graph or recipes.

### Pipeline
EXTRACT → RESOLVE → CLASSIFY → (deterministic path or LLM fallback) → VALIDATE

### Key Directories
- `supabase/migrations/` — Postgres schema (001 core tables, 002 pipeline infra, 003 seed data)
- `supabase/functions/chat/` — Edge Function (Groq proxy, will become pipeline host)
- `frontend/src/` — React PWA (minimal shell, to be rebuilt)
- `docs/` — Architecture documentation

## Testing Standards

- **Assert identity, not just counts.** `toHaveLength(2)` is necessary but insufficient. Assert `text`, `typeHint`, `entityId`, `entityType` — the values downstream stages depend on.
- **Order-independent matching.** Use `toContainEqual` when output order isn't guaranteed. Don't assert `[0]` index unless order is part of the contract.
- **Data-driven tests.** Use `it.each` with test case arrays for repetitive assertions. One row per scenario, columns map to inputs + expected outputs.
- **Negative assertions.** Test that unwanted outputs are excluded (function words, non-entity nouns, wrong entity types). Missing a negative case is how bugs hide.
- **Mock at boundaries only.** Mock Supabase client, not internal functions. Shared mocks live in `__tests__/pipeline/mock-supabase.ts`. Seed data in `seed.ts`.
- **Three test levels.** Unit tests for concept functions, integration tests for orchestrators (wire real stages), E2E for external APIs (Groq). Pipeline tests must not require Supabase running.
- **DRY test infrastructure.** Shared helpers (`createMockSupabase`, `resolvedEntity`, seed constants) prevent duplication. Extract after 2 similar implementations.

## Global References

Read from `~/.claude/references/` **before writing code**, not after. These define the patterns this codebase follows — skipping them leads to rework.

| Reference | Read before | Why |
|---|---|---|
| `coding-standards.md` | Any implementation | Three-tier hierarchy, one verb per function, beacon names. Every module follows this. |
| `supabase-local-dev.md` | Supabase mutations, migrations, env switching | Client patterns, DI setup, local vs prod switching |
| `agent-web-dev.md` | Any UI work | shadcn/ui vocabulary, Playwright testing, PostHog analytics |
| `docs/architecture-pipeline.md` | Pipeline or entity model changes | Tool schemas, parameter mapping, routing logic, stage contracts |

## Project-Specific Notes
- Entity model: everything in DB or unknown. No inference. User confirms novel entities.
- LLM fallback is a training mechanism — confirmed results become deterministic rules.
- Event-driven architecture (Postgres triggers), not cron.
- Actions: starts_at + due_at + duration. No trigger_at. Type is emergent from filled columns.
- Items: status column for state transitions (stocked/needed/on_list/purchased).
