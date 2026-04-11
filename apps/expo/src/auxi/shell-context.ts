import type { PipelineResult, EntityMention, ResolvedEntity } from "@house-ops/core";

/**
 * Builds the shell data context for spec binding resolution.
 * The spec references these via "{shell.fieldName}" bindings.
 * All pipeline display logic lives here — the spec is pure data.
 */

interface FeedbackState {
  kind: "success" | "error";
  message?: string;
}

interface ShellContextInput {
  inputText: string;
  isProcessing: boolean;
  pipelineResult: PipelineResult | null;
  feedback: FeedbackState | null;
  voiceActive: boolean;
}

export function buildShellContext(input: ShellContextInput): Record<string, unknown> {
  const { pipelineResult, feedback, isProcessing, voiceActive } = input;

  return {
    shell: {
      isProcessing,
      voiceActive,
      hasResult: pipelineResult !== null && pipelineResult.toolCalls.length > 0,
      resultTitle: formatResultTitle(pipelineResult),
      confidenceLabel: formatConfidence(pipelineResult),
      stageHeard: formatStageHeard(pipelineResult),
      stageMatched: formatStageMatched(pipelineResult),
      stageTool: formatStageTool(pipelineResult),
      hasTool: pipelineResult?.trace.toolName != null,
      paramsSummary: formatParamsSummary(pipelineResult),
      hasUnresolved: (pipelineResult?.unresolved.length ?? 0) > 0,
      unresolvedWarning: formatUnresolvedWarning(pipelineResult),
      feedbackSuccess: feedback?.kind === "success",
      hasFeedbackError: feedback?.kind === "error",
      feedbackError: feedback?.kind === "error" ? feedback.message ?? "Unknown error" : "",
    },
  };
}

// --- Formatting helpers ---

const TOOL_LABELS: Record<string, string> = {
  update_item: "Update item",
  create_item: "Create item",
  create_action: "Create action",
  update_action: "Update action",
  create_recipe: "Create recipe",
};

function formatResultTitle(result: PipelineResult | null): string {
  if (!result || result.toolCalls.length === 0) return "";
  const label = TOOL_LABELS[result.toolCalls[0]!.tool] ?? result.toolCalls[0]!.tool.replaceAll("_", " ");
  return result.toolCalls.length > 1 ? `${label} (x${result.toolCalls.length})` : label;
}

function formatConfidence(result: PipelineResult | null): string {
  if (!result) return "";
  return `${Math.round(result.confidence * 100)}%`;
}

function formatStageHeard(result: PipelineResult | null): string {
  if (!result) return "";
  const entities = result.trace.entityMentions
    .map((m: EntityMention) => `"${m.text}"`)
    .join(", ");
  return entities
    ? `Heard: verb="${result.trace.verb}", ${entities}`
    : `Heard: verb="${result.trace.verb}"`;
}

function formatStageMatched(result: PipelineResult | null): string {
  if (!result) return "";
  const parts: string[] = [];
  for (const entity of result.trace.resolved) {
    parts.push(`${(entity as ResolvedEntity).mention} → ${(entity as ResolvedEntity).entityType} #${(entity as ResolvedEntity).entityId}`);
  }
  for (const mention of result.trace.unresolved) {
    parts.push(`${mention} → unresolved`);
  }
  return `Matched: ${parts.join(", ") || "none"}`;
}

function formatStageTool(result: PipelineResult | null): string {
  if (!result?.trace.toolName) return "";
  return `Tool: ${result.trace.toolName}`;
}

function formatUnresolvedWarning(result: PipelineResult | null): string {
  if (!result || result.unresolved.length === 0) return "";
  const names = result.unresolved.map((m) => `"${m}"`).join(", ");
  return `Unknown: ${names} — tap to add`;
}

function formatParamsSummary(result: PipelineResult | null): string {
  if (!result || result.toolCalls.length === 0) return "";
  const params = result.toolCalls[0]!.params;
  return Object.entries(params)
    .map(([k, v]) => `${k.replaceAll("_", " ")}: ${String(v)}`)
    .join("\n");
}
