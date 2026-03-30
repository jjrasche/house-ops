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
- `supabase/migrations/` — Postgres schema (TBD — being rewritten)
- `supabase/functions/chat/` — Edge Function (Groq proxy, will become pipeline host)
- `frontend/src/` — React PWA (minimal shell, to be rebuilt)
- `docs/` — Architecture documentation

## Global References

Read from `~/.claude/references/` when relevant:
- `coding-standards.md` — Full coding standards with examples
- `supabase-local-dev.md` — Supabase local dev workflow

## Project-Specific Notes
- Entity model: everything in DB or unknown. No inference. User confirms novel entities.
- LLM fallback is a training mechanism — confirmed results become deterministic rules.
- Event-driven architecture (Postgres triggers), not cron.
- Actions: starts_at + due_at + duration. No trigger_at. Type is emergent from filled columns.
- Items: status column for state transitions (stocked/needed/on_list/purchased).
