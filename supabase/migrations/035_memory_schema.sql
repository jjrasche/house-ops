-- Memory schema from unified-memory, adapted for local Supabase dev.
-- Source: workspace/unified-memory/migrations/001_memory_schema.sql
-- Only tables the agent loop needs: entities, claims, current_claims view.
-- Embeddings deferred (no local embedding model yet) — columns kept nullable.

BEGIN;

CREATE SCHEMA IF NOT EXISTS memory;
CREATE EXTENSION IF NOT EXISTS vector;

-- Entities: people, orgs, knowledge components
CREATE TABLE IF NOT EXISTS memory.entities (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type     text NOT NULL,
    name            text NOT NULL,
    aliases         text[] DEFAULT '{}',
    description     text,
    embedding       vector(768),
    metadata        jsonb DEFAULT '{}',
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entities_type ON memory.entities (entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_name ON memory.entities (name);
CREATE INDEX IF NOT EXISTS idx_entities_aliases ON memory.entities USING gin (aliases);

-- Entity edges: typed relationships between entities
CREATE TABLE IF NOT EXISTS memory.entity_edges (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_entity_id    uuid NOT NULL REFERENCES memory.entities(id) ON DELETE CASCADE,
    target_entity_id    uuid NOT NULL REFERENCES memory.entities(id) ON DELETE CASCADE,
    relationship_type   text NOT NULL,
    proposed_by         text,
    confirmed_by        text,
    created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entity_edges_source ON memory.entity_edges (source_entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_edges_target ON memory.entity_edges (target_entity_id);

-- Chunks: source-defined processing units
CREATE TABLE IF NOT EXISTS memory.chunks (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES auth.users(id),
    source_id       text NOT NULL,
    source_type     text NOT NULL,
    ordinal         integer NOT NULL,
    content         text NOT NULL,
    speaker         text,
    embedding       vector(768),
    source_metadata jsonb DEFAULT '{}',
    occurred_at     timestamptz,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chunks_source ON memory.chunks (source_id);
CREATE INDEX IF NOT EXISTS idx_chunks_source_type ON memory.chunks (source_type);
CREATE INDEX IF NOT EXISTS idx_chunks_user ON memory.chunks (user_id);

-- Claims: sentence-level fact nodes. Append-only, valid_from/valid_to.
CREATE TABLE IF NOT EXISTS memory.claims (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES auth.users(id),
    chunk_id        uuid REFERENCES memory.chunks(id) ON DELETE SET NULL,
    description     text NOT NULL,
    raw_text        text,
    embedding       vector(768),
    entity_names    jsonb DEFAULT '[]',
    valid_from      timestamptz DEFAULT now(),
    valid_to        timestamptz DEFAULT 'infinity',
    occurred_at     timestamptz,
    memory_status   text DEFAULT 'working',
    extracted_by    text,
    metadata        jsonb DEFAULT '{}',
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_claims_current ON memory.claims (valid_to) WHERE valid_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_claims_status ON memory.claims (memory_status);
CREATE INDEX IF NOT EXISTS idx_claims_chunk ON memory.claims (chunk_id);
CREATE INDEX IF NOT EXISTS idx_claims_user ON memory.claims (user_id);

-- View the agent loop queries: only current (not-superseded) claims
CREATE OR REPLACE VIEW memory.current_claims AS
    SELECT * FROM memory.claims WHERE valid_to = 'infinity';

-- Claim-entity join
CREATE TABLE IF NOT EXISTS memory.claim_entities (
    claim_id        uuid NOT NULL REFERENCES memory.claims(id) ON DELETE CASCADE,
    entity_id       uuid NOT NULL REFERENCES memory.entities(id) ON DELETE CASCADE,
    role            text DEFAULT 'mentioned',
    PRIMARY KEY (claim_id, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_claim_entities_entity ON memory.claim_entities (entity_id);

-- Claim-claim links: NLI-detected entailment or contradiction
CREATE TABLE IF NOT EXISTS memory.claim_links (
    source_claim_id uuid NOT NULL REFERENCES memory.claims(id) ON DELETE CASCADE,
    target_claim_id uuid NOT NULL REFERENCES memory.claims(id) ON DELETE CASCADE,
    link_type       text NOT NULL,
    nli_score       float NOT NULL,
    created_at      timestamptz DEFAULT now(),
    PRIMARY KEY (source_claim_id, target_claim_id)
);

CREATE INDEX IF NOT EXISTS idx_claim_links_target ON memory.claim_links (target_claim_id);

-- Signals: universal review log for curation actions
CREATE TABLE IF NOT EXISTS memory.signals (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type     text NOT NULL,
    target_id       uuid NOT NULL,
    action          text NOT NULL,
    reviewer        text NOT NULL,
    reviewer_class  text NOT NULL,
    context         text,
    related_id      uuid,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signals_target ON memory.signals (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_signals_action ON memory.signals (action);

-- Full-text search index on claim descriptions for keyword matching
CREATE INDEX IF NOT EXISTS idx_claims_description_trgm
    ON memory.claims USING gin (description gin_trgm_ops);

-- RLS: local dev disables RLS (see migration 006), but define policies
-- so the schema matches production when deployed via Ansible.
ALTER TABLE memory.chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory.claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory.claim_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory.claim_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory.signals ENABLE ROW LEVEL SECURITY;

COMMIT;
