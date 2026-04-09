import type { PipelineTrace, EntityMention, ResolvedEntity } from '@house-ops/core';

// --- Public types ---

export interface StageSummaryProps {
  readonly trace: PipelineTrace;
}

// --- Orchestrator ---

export function StageSummary({ trace }: StageSummaryProps) {
  return (
    <div className="space-y-1 text-xs" role="list" aria-label="Pipeline stages">
      <ExtractRow verb={trace.verb} entityMentions={trace.entityMentions} />
      <ResolveRow resolved={trace.resolved} unresolved={trace.unresolved} />
      {trace.toolName && <ClassifyRow toolName={trace.toolName} />}
      {Object.keys(trace.params).length > 0 && <AssembleRow params={trace.params} />}
    </div>
  );
}

// --- Concept: extract stage summary ---

function ExtractRow({
  verb,
  entityMentions,
}: {
  readonly verb: string;
  readonly entityMentions: readonly EntityMention[];
}) {
  const entityList = formatEntityList(entityMentions);
  return (
    <div className="flex gap-2 text-muted-foreground" role="listitem" data-stage="extract">
      <span className="shrink-0">Heard:</span>
      <span>verb="{verb}"{entityList && `, ${entityList}`}</span>
    </div>
  );
}

// --- Concept: resolve stage summary ---

function ResolveRow({
  resolved,
  unresolved,
}: {
  readonly resolved: readonly ResolvedEntity[];
  readonly unresolved: readonly string[];
}) {
  if (resolved.length === 0 && unresolved.length === 0) return null;

  const parts: string[] = [];
  for (const entity of resolved) {
    parts.push(`${entity.mention} → ${entity.entityType} #${entity.entityId} (${formatScore(entity.score)})`);
  }
  for (const mention of unresolved) {
    parts.push(`${mention} → unresolved`);
  }

  return (
    <div className="flex gap-2 text-muted-foreground" role="listitem" data-stage="resolve">
      <span className="shrink-0">Matched:</span>
      <span>{parts.join(', ')}</span>
    </div>
  );
}

// --- Concept: classify stage summary ---

function ClassifyRow({ toolName }: { readonly toolName: string }) {
  return (
    <div className="flex gap-2 text-muted-foreground" role="listitem" data-stage="classify">
      <span className="shrink-0">Tool:</span>
      <span>{toolName}</span>
    </div>
  );
}

// --- Concept: assemble stage summary ---

function AssembleRow({ params }: { readonly params: Readonly<Record<string, unknown>> }) {
  return (
    <div className="flex gap-2 text-muted-foreground" role="listitem" data-stage="assemble">
      <span className="shrink-0">Params:</span>
      <span>{formatParamSummary(params)}</span>
    </div>
  );
}

// --- Leaf: format entity mentions as readable list ---

function formatEntityList(mentions: readonly EntityMention[]): string {
  if (mentions.length === 0) return '';
  return mentions
    .map(m => `"${m.text}" (${m.typeHint})`)
    .join(', ');
}

// --- Leaf: format score as percentage ---

function formatScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}

// --- Leaf: format params as key=value summary ---

function formatParamSummary(params: Readonly<Record<string, unknown>>): string {
  return Object.entries(params)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(', ');
}
