import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useState, useCallback } from 'react';
import type { EntityType } from '@house-ops/core';
import { Input } from './ui/input';
import { Select } from './ui/select';
import { Button } from './ui/button';
import { colors, fontSize, spacing, radius } from '../lib/theme';

interface EntityResolverProps {
  readonly mentions: readonly string[];
  readonly onResolve: (mention: string, entityType: EntityType, entityName: string) => void;
  readonly isResolving?: boolean;
}

const ENTITY_TYPE_OPTIONS = [
  { value: 'item', label: 'Item' },
  { value: 'person', label: 'Person' },
  { value: 'location', label: 'Location' },
  { value: 'store', label: 'Store' },
] as const;

export function EntityResolver({ mentions, onResolve, isResolving }: EntityResolverProps) {
  const [expandedMention, setExpandedMention] = useState<string | null>(null);

  const toggleMention = useCallback((mention: string) => {
    setExpandedMention(prev => prev === mention ? null : mention);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.warning}>
        <Text style={styles.warningText}>
          Unknown: {mentions.map(m => `"${m}"`).join(', ')} — tap to add
        </Text>
      </View>
      {mentions.map(mention => (
        <EntityResolveRow
          key={mention}
          mention={mention}
          isExpanded={expandedMention === mention}
          onToggle={() => toggleMention(mention)}
          onResolve={onResolve}
          isResolving={isResolving}
        />
      ))}
    </View>
  );
}

function EntityResolveRow({
  mention, isExpanded, onToggle, onResolve, isResolving,
}: {
  readonly mention: string;
  readonly isExpanded: boolean;
  readonly onToggle: () => void;
  readonly onResolve: (mention: string, entityType: EntityType, entityName: string) => void;
  readonly isResolving?: boolean;
}) {
  const [entityName, setEntityName] = useState(mention);
  const [entityType, setEntityType] = useState<EntityType>('item');

  const handleSubmit = useCallback(() => {
    const trimmed = entityName.trim();
    if (trimmed === '') return;
    onResolve(mention, entityType, trimmed);
  }, [entityName, entityType, mention, onResolve]);

  return (
    <View style={styles.resolveRow}>
      <Pressable onPress={onToggle} style={styles.resolveTrigger}>
        <Text style={styles.resolveTriggerText}>"{mention}" — not in the database</Text>
        <Text style={styles.chevron}>{isExpanded ? '▾' : '▸'}</Text>
      </Pressable>
      {isExpanded && (
        <View style={styles.form}>
          <Text style={styles.formLabel}>Name</Text>
          <Input value={entityName} onChangeText={setEntityName} disabled={isResolving} />
          <Text style={styles.formLabel}>Type</Text>
          <Select
            value={entityType}
            options={ENTITY_TYPE_OPTIONS}
            onValueChange={v => setEntityType(v as EntityType)}
            disabled={isResolving}
          />
          <Button size="sm" onPress={handleSubmit} disabled={isResolving || entityName.trim() === ''}>
            {isResolving ? 'Adding...' : 'Add to database'}
          </Button>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  warning: {
    backgroundColor: colors.warningMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm,
  },
  warningText: { fontSize: fontSize.xs, color: colors.warning },
  resolveRow: {
    borderWidth: 1,
    borderColor: 'rgba(234, 179, 8, 0.3)',
    borderRadius: radius.md,
  },
  resolveTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm,
  },
  resolveTriggerText: { fontSize: fontSize.sm, color: colors.warning },
  chevron: { fontSize: fontSize.xs, color: colors.warning },
  form: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(234, 179, 8, 0.2)',
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  formLabel: { fontSize: fontSize.xs, color: colors.mutedForeground },
});
