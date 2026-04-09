// Pipeline stages
export { extract, lemmatizeVerb } from './pipeline/extract';
export { resolve, findCandidates } from './pipeline/resolve';
export { classify } from './pipeline/classify';
export { assemble } from './pipeline/assemble';
export { validate, TOOL_SCHEMAS } from './pipeline/validate';
export { executeTool, rejectTool } from './pipeline/execute';
export { runPipeline } from './pipeline/router';
export { applyCorrection } from './pipeline/train';
export { createEntity } from './pipeline/create-entity';

// Supabase factory
export { createSupabaseClient, isLocalDev } from './supabase';

// Types
export type {
  EntityType, PipelinePath, UserVerdict, TrainingSource,
  EntityMention, ParsedDate, ParsedQuantity,
  ResolvedEntity, ContextItem, ToolCallParam, ToolCall,
  KnowledgeTriple,
  ExtractInput, ExtractOutput,
  ResolveInput, ResolveOutput,
  ClassifyInput, ClassifyOutput,
  AssembleInput, AssembleOutput,
  RetrieveInput, RetrieveOutput,
  GenerateInput, GenerateOutput,
  ValidateInput, ValidateOutput,
  StageName, StageExecution, PipelineTrace,
  CorrectionStage, Correction,
  ExtractCorrection, ResolveCorrection, ClassifyCorrection, AssembleCorrection,
  PipelineResult,
} from './pipeline/types';

export type { LexiconEntry, ExtractOptions } from './pipeline/extract';
export type { ResolveOptions, ResolveCandidate } from './pipeline/resolve';
export type { ClassifyOptions } from './pipeline/classify';
export type { ToolCallExample, AssembleOptions } from './pipeline/assemble';
export type { ToolSchema, ValidateOptions } from './pipeline/validate';
export type { ExecuteOptions, ExecuteResult } from './pipeline/execute';
export type { PipelineOptions } from './pipeline/router';
export type { TrainOptions } from './pipeline/train';
export type { CreateEntityOptions, CreatedEntity } from './pipeline/create-entity';
export type { SupabaseConfig } from './supabase';
