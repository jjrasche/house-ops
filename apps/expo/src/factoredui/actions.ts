import type { ActionRegistry } from "@factoredui/core";
import type { PipelineOptions, PipelineResult, ExecuteResult } from "@house-ops/core";
import { runPipeline, executeTool, rejectTool, handleAutomationIntent } from "@house-ops/core";
import { supabase } from "../lib/supabase";
import { HOUSEHOLD_ID } from "../lib/constants";

/**
 * Action registry for house-ops SDUI.
 * Specs reference these by name (e.g. action: "submit").
 * The shell provides mutable state via the shell context.
 */

export interface ShellState {
  inputText: string;
  pipelineResult: PipelineResult | null;
  isProcessing: boolean;
  voiceActive: boolean;
  pipelineOptions: PipelineOptions;
  setInputText: (text: string) => void;
  setPipelineResult: (result: PipelineResult | null) => void;
  setIsProcessing: (processing: boolean) => void;
  setFeedback: (feedback: { kind: "success" } | { kind: "error"; message: string } | null) => void;
  toggleVoice: () => void;
  refreshSources: () => void;
  showEntityResolver: () => void;
}

export function buildActionRegistry(shell: ShellState): ActionRegistry {
  return {
    submit: createSubmitAction(shell),
    confirm: createConfirmAction(shell),
    reject: createRejectAction(shell),
    toggle_voice: createToggleVoiceAction(shell),
    resolve_entity: createResolveEntityAction(shell),
  };
}

const LOCAL_DEV_USER_ID = "00000000-0000-0000-0000-000000000000";

async function resolveUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? LOCAL_DEV_USER_ID;
}

function createSubmitAction(shell: ShellState) {
  return async (params: Record<string, unknown>) => {
    const text = (params.text as string) ?? shell.inputText;
    const trimmed = text.trim();
    if (trimmed === "" || shell.isProcessing) return;

    shell.setIsProcessing(true);
    shell.setPipelineResult(null);
    shell.setFeedback(null);

    const userId = await resolveUserId();
    const intentResult = await handleAutomationIntent(trimmed, userId, supabase);

    if (intentResult.handled) {
      const allSucceeded = intentResult.actions.every(a => a.success);
      shell.setFeedback(allSucceeded
        ? { kind: "success" }
        : { kind: "error", message: "Failed to write agent action" });
      shell.setInputText("");
      shell.setIsProcessing(false);
      return;
    }

    const result = await runPipeline(trimmed, shell.pipelineOptions);
    shell.setPipelineResult(result);
    shell.setIsProcessing(false);
  };
}

function createConfirmAction(shell: ShellState) {
  return async (_params: Record<string, unknown>) => {
    const result = shell.pipelineResult;
    if (!result) return;

    const options = { supabase, householdId: HOUSEHOLD_ID };
    for (const toolCall of result.toolCalls) {
      const execResult: ExecuteResult = await executeTool(toolCall, result, options);
      if (!execResult.success) {
        shell.setFeedback({ kind: "error", message: execResult.error ?? "Execution failed" });
        return;
      }
    }

    shell.setPipelineResult(null);
    shell.setFeedback({ kind: "success" });
    shell.setInputText("");
    shell.refreshSources();
  };
}

function createRejectAction(shell: ShellState) {
  return async (_params: Record<string, unknown>) => {
    const result = shell.pipelineResult;
    if (!result) return;

    const options = { supabase, householdId: HOUSEHOLD_ID };
    for (const toolCall of result.toolCalls) {
      await rejectTool(toolCall, result, options);
    }

    shell.setPipelineResult(null);
    shell.setFeedback(null);
    shell.setInputText("");
  };
}

function createToggleVoiceAction(shell: ShellState) {
  return async (_params: Record<string, unknown>) => {
    shell.toggleVoice();
  };
}

function createResolveEntityAction(shell: ShellState) {
  return async (_params: Record<string, unknown>) => {
    shell.showEntityResolver();
  };
}

