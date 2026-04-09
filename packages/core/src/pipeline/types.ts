// Pipeline stage input/output contracts.
// Source of truth: docs/architecture-pipeline.md

// --- Shared primitives ---

export type EntityType = 'person' | 'item' | 'location' | 'action' | 'store' | 'activity';

export type PipelinePath = 'deterministic' | 'llm';

export type UserVerdict = 'correct' | 'incorrect' | null;

export type TrainingSource = 'seed' | 'llm_candidate' | 'user_confirmed';

export interface EntityMention {
  readonly text: string;
  readonly typeHint: EntityType | 'unknown';
}

export interface ParsedDate {
  readonly raw: string;
  readonly parsed: string; // ISO 8601
}

export interface ParsedQuantity {
  readonly value: number;
  readonly unit: string;
}

export interface ResolvedEntity {
  readonly mention: string;
  readonly entityId: number;
  readonly entityType: EntityType;
  readonly score: number; // pg_trgm similarity, 0-1
}

export interface ContextItem {
  readonly content: string;
  readonly edgeType: string;
  readonly relevance: number;
}

export interface ToolCallParam {
  readonly [key: string]: unknown;
}

export interface ToolCall {
  readonly tool: string;
  readonly params: ToolCallParam;
}

export interface KnowledgeTriple {
  readonly subjectId: number;
  readonly edgeType: string;
  readonly objectId: number;
  readonly confidence: number;
}

// --- EXTRACT ---

export interface ExtractInput {
  readonly text: string;
  readonly householdId: number;
}

export interface ExtractOutput {
  readonly verb: string;
  readonly entityMentions: readonly EntityMention[];
  readonly dates: readonly ParsedDate[];
  readonly quantities: readonly ParsedQuantity[];
}

// --- RESOLVE ---

export interface ResolveInput {
  readonly entityMentions: readonly EntityMention[];
  readonly householdId: number;
  readonly verb: string;
}

export interface ResolveOutput {
  readonly resolved: readonly ResolvedEntity[];
  readonly unresolved: readonly string[];
}

// --- CLASSIFY ---

export interface ClassifyInput {
  readonly verb: string;
  readonly entityTypes: readonly EntityType[];
  readonly resolvedCount: number;
  readonly unresolvedCount: number;
}

export interface ClassifyOutput {
  readonly toolName: string | null;
  readonly confidence: number;
  readonly needsLlm: boolean;
  readonly canShowCard: boolean;
}

// --- ASSEMBLE (deterministic sub-step, not a logged stage) ---

export interface AssembleInput {
  readonly toolName: string;
  readonly verb: string;
  readonly resolved: readonly ResolvedEntity[];
  readonly unresolved: readonly string[];
  readonly dates: readonly ParsedDate[];
  readonly quantities: readonly ParsedQuantity[];
}

export interface AssembleOutput {
  readonly toolCalls: readonly ToolCall[];
}

// --- RETRIEVE ---

export interface RetrieveInput {
  readonly intent: string;
  readonly entityIds: readonly number[];
  readonly householdId: number;
}

export interface RetrieveOutput {
  readonly contextItems: readonly ContextItem[];
}

// --- GENERATE ---

export interface GenerateInput {
  readonly text: string;
  readonly resolvedEntities: readonly ResolvedEntity[];
  readonly context: readonly ContextItem[];
  readonly toolSchemas: readonly object[];
}

export interface GenerateOutput {
  readonly toolCalls: readonly ToolCall[];
  readonly knowledgeTriples: readonly KnowledgeTriple[];
}

// --- VALIDATE ---

export interface ValidateInput {
  readonly toolCall: ToolCall;
}

export interface ValidateOutput {
  readonly isValid: boolean;
  readonly errors: readonly string[];
  readonly confidence: number;
}

// --- Stage execution record (logged to stage_executions table) ---

export type StageName =
  | 'extract'
  | 'resolve'
  | 'classify'
  | 'retrieve'
  | 'generate'
  | 'validate';

export interface StageExecution {
  readonly stage: StageName;
  readonly inputPayload: object;
  readonly outputPayload: object;
  readonly confidence: number;
  readonly durationMs: number;
  readonly modelVersion: string;
  readonly userVerdict: UserVerdict;
  readonly conversationId: number;
  readonly householdId: number;
}

// --- Pipeline trace (what each stage did, for user review + correction) ---

export interface PipelineTrace {
  readonly inputText: string;
  readonly verb: string;
  readonly entityMentions: readonly EntityMention[];
  readonly resolved: readonly ResolvedEntity[];
  readonly unresolved: readonly string[];
  readonly toolName: string | null;
  readonly params: Readonly<Record<string, unknown>>;
}

// --- Correction types (user edits to pipeline output) ---

export type CorrectionStage = 'extract' | 'resolve' | 'classify' | 'assemble';

export interface ExtractCorrection {
  readonly stage: 'extract';
  readonly verb?: string;
  readonly addedAlias?: { readonly surfaceForm: string; readonly entityType: EntityType; readonly entityId: number };
}

export interface ResolveCorrection {
  readonly stage: 'resolve';
  readonly mention: string;
  readonly preferredId: number;
  readonly preferredType: EntityType;
}

export interface ClassifyCorrection {
  readonly stage: 'classify';
  readonly toolName: string;
}

export interface AssembleCorrection {
  readonly stage: 'assemble';
  readonly params: Readonly<Record<string, unknown>>;
}

export type Correction =
  | ExtractCorrection
  | ResolveCorrection
  | ClassifyCorrection
  | AssembleCorrection;

// --- Pipeline result ---

export interface PipelineResult {
  readonly toolCalls: readonly ToolCall[];
  readonly resolvedEntities: readonly ResolvedEntity[];
  readonly unresolved: readonly string[];
  readonly trace: PipelineTrace;
  readonly path: PipelinePath;
  readonly stageExecutions: readonly StageExecution[];
  readonly confidence: number;
  readonly validationErrors: readonly string[];
}
