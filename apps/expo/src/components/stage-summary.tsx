import { View, Text, StyleSheet } from 'react-native';
import type { PipelineTrace, EntityMention, ResolvedEntity } from '@house-ops/core';
import { colors, fontSize, spacing } from '../lib/theme';

interface StageSummaryProps {
  readonly trace: PipelineTrace;
}

export function StageSummary({ trace }: StageSummaryProps) {
  return (
    <View style={styles.container}>
      <StageRow label="Heard" value={formatExtractSummary(trace)} />
      <StageRow label="Matched" value={formatResolveSummary(trace.resolved, trace.unresolved)} />
      {trace.toolName && <StageRow label="Tool" value={trace.toolName} />}
      {Object.keys(trace.params).length > 0 && (
        <StageRow label="Params" value={formatParamSummary(trace.params)} />
      )}
    </View>
  );
}

function StageRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}:</Text>
      <Text style={styles.value} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function formatExtractSummary(trace: PipelineTrace): string {
  const entities = trace.entityMentions.map((m: EntityMention) => `"${m.text}"`).join(', ');
  return entities ? `verb="${trace.verb}", ${entities}` : `verb="${trace.verb}"`;
}

function formatResolveSummary(resolved: readonly ResolvedEntity[], unresolved: readonly string[]): string {
  const parts: string[] = [];
  for (const entity of resolved) {
    parts.push(`${entity.mention} → ${entity.entityType} #${entity.entityId}`);
  }
  for (const mention of unresolved) {
    parts.push(`${mention} → unresolved`);
  }
  return parts.join(', ') || 'none';
}

function formatParamSummary(params: Readonly<Record<string, unknown>>): string {
  return Object.entries(params).map(([k, v]) => `${k}=${String(v)}`).join(', ');
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.sm },
  label: { fontSize: fontSize.xs, color: colors.mutedForeground, flexShrink: 0 },
  value: { fontSize: fontSize.xs, color: colors.mutedForeground, flex: 1 },
});
