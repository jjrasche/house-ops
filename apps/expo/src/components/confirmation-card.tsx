import { View, Text, StyleSheet } from 'react-native';
import { useState, useCallback } from 'react';
import type { PipelineResult, ResolvedEntity, ToolCall, EntityType, Correction } from '@house-ops/core';
import type { ResolveCandidate } from '@house-ops/core';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { StageSummary } from './stage-summary';
import { EntityResolver } from './entity-resolver';
import { colors, fontSize, spacing, radius } from '../lib/theme';

// --- Public types ---

export type FetchCandidates = (mention: string) => Promise<ResolveCandidate[]>;

export interface ConfirmationCardProps {
  readonly result: PipelineResult;
  readonly onConfirm: (toolCalls: readonly ToolCall[]) => void;
  readonly onReject: (toolCalls: readonly ToolCall[]) => void;
  readonly onResolveEntity?: (mention: string, entityType: EntityType, entityName: string) => void;
  readonly isResolvingEntity?: boolean;
}

// --- Constants ---

const TOOL_LABELS: Record<string, string> = {
  update_item: 'Update item',
  create_item: 'Create item',
  create_action: 'Create action',
  update_action: 'Update action',
  create_recipe: 'Create recipe',
};

const PARAM_LABELS: Record<string, string> = {
  item_id: 'Item', person_id: 'Person', location_id: 'Location',
  store_id: 'Store', action_id: 'Action', status: 'Status',
  quantity: 'Quantity', quantity_needed: 'Qty needed',
  quantity_delta: 'Qty change', unit: 'Unit',
  starts_at: 'Starts at', due_at: 'Due', title: 'Title',
};

export function ConfirmationCard({
  result, onConfirm, onReject, onResolveEntity, isResolvingEntity,
}: ConfirmationCardProps) {
  if (result.toolCalls.length === 0) {
    return <EmptyCard path={result.path} />;
  }

  const toolCalls = result.toolCalls;
  const hasUnresolved = result.unresolved.length > 0;
  const hasErrors = result.validationErrors.length > 0;

  return (
    <Card>
      <CardHeader>
        <View style={styles.headerRow}>
          <CardTitle>
            {formatToolLabel(toolCalls[0]!.tool)}
            {toolCalls.length > 1 ? ` (x${toolCalls.length})` : ''}
          </CardTitle>
          <ConfidenceBadge confidence={result.confidence} />
        </View>
      </CardHeader>
      <CardContent>
        <StageSummary trace={result.trace} />
        {hasUnresolved && onResolveEntity && (
          <EntityResolver
            mentions={result.unresolved}
            onResolve={onResolveEntity}
            isResolving={isResolvingEntity}
          />
        )}
        {hasUnresolved && !onResolveEntity && (
          <UnresolvedWarning mentions={result.unresolved} />
        )}
        <View style={styles.divider} />
        {toolCalls.map((tc, i) => (
          <ParamList key={i} params={tc.params} resolvedEntities={result.resolvedEntities} />
        ))}
      </CardContent>
      <CardFooter>
        <Button variant="default" onPress={() => onConfirm(toolCalls)} disabled={hasErrors}>
          {hasErrors ? 'Needs resolution' : 'Confirm'}
        </Button>
        <Button variant="ghost" onPress={() => onReject(toolCalls)}>Reject</Button>
      </CardFooter>
    </Card>
  );
}

function EmptyCard({ path }: { readonly path: string }) {
  const message = path === 'llm'
    ? "I'm not sure what to do with that. Could you rephrase?"
    : 'Could not validate that action. Please try again.';

  return (
    <Card>
      <CardContent>
        <Text style={styles.emptyText}>{message}</Text>
      </CardContent>
    </Card>
  );
}

function ConfidenceBadge({ confidence }: { readonly confidence: number }) {
  const variant = confidence >= 0.85 ? 'default' : confidence >= 0.5 ? 'secondary' : 'destructive';
  return <Badge variant={variant}>{`${Math.round(confidence * 100)}%`}</Badge>;
}

function UnresolvedWarning({ mentions }: { readonly mentions: readonly string[] }) {
  return (
    <View style={styles.warning}>
      <Text style={styles.warningText}>
        Unknown: {mentions.map(m => `"${m}"`).join(', ')} — not in the database yet
      </Text>
    </View>
  );
}

function ParamList({ params, resolvedEntities }: {
  readonly params: Record<string, unknown>;
  readonly resolvedEntities: readonly ResolvedEntity[];
}) {
  const entries = Object.entries(params);
  if (entries.length === 0) {
    return <Text style={styles.emptyText}>No parameters</Text>;
  }

  return (
    <View style={styles.paramList}>
      {entries.map(([key, value]) => (
        <View key={key} style={styles.paramRow}>
          <Text style={styles.paramLabel}>{PARAM_LABELS[key] ?? key.replaceAll('_', ' ')}</Text>
          <Text style={styles.paramValue}>{resolveDisplayValue(key, value, resolvedEntities)}</Text>
        </View>
      ))}
    </View>
  );
}

function formatToolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? toolName.replaceAll('_', ' ');
}

function resolveDisplayValue(paramKey: string, value: unknown, entities: readonly ResolvedEntity[]): string {
  if (!paramKey.endsWith('_id') || typeof value !== 'number') return String(value);
  const entityType = paramKey.slice(0, -3);
  const matched = entities.find(e => e.entityType === entityType && e.entityId === value);
  return matched?.mention ?? String(value);
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  divider: { height: 1, backgroundColor: colors.border },
  paramList: { gap: spacing.xs },
  paramRow: { flexDirection: 'row', justifyContent: 'space-between' },
  paramLabel: { fontSize: fontSize.sm, color: colors.mutedForeground },
  paramValue: { fontSize: fontSize.sm, fontWeight: '500', color: colors.foreground },
  emptyText: { fontSize: fontSize.sm, color: colors.mutedForeground },
  warning: {
    backgroundColor: colors.warningMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm,
  },
  warningText: { fontSize: fontSize.xs, color: colors.warning },
});
