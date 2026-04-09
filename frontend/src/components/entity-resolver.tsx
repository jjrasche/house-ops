import { useState, useCallback } from 'react';
import type { EntityType } from '@house-ops/core';
import { Input } from './ui/input';
import { Select } from './ui/select';
import { Button } from './ui/button';

// --- Public types ---

export interface EntityResolverProps {
  readonly mentions: readonly string[];
  readonly onResolve: (mention: string, entityType: EntityType, entityName: string) => void;
  readonly isResolving?: boolean;
}

// --- Constants ---

const ENTITY_TYPE_OPTIONS: readonly { readonly value: EntityType; readonly label: string }[] = [
  { value: 'item', label: 'Item' },
  { value: 'person', label: 'Person' },
  { value: 'location', label: 'Location' },
  { value: 'store', label: 'Store' },
] as const;

// --- Orchestrator ---

export function EntityResolver({ mentions, onResolve, isResolving }: EntityResolverProps) {
  const [expandedMention, setExpandedMention] = useState<string | null>(null);

  const toggleMention = useCallback((mention: string) => {
    setExpandedMention(prev => prev === mention ? null : mention);
  }, []);

  return (
    <div className="space-y-2" role="region" aria-label="Unresolved entities">
      <div className="rounded-md bg-yellow-500/10 px-3 py-2 text-xs text-yellow-500" role="alert">
        Unknown: {mentions.map(m => `"${m}"`).join(', ')} — tap to add
      </div>
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
    </div>
  );
}

// --- Concept: single unresolved mention with expandable form ---

interface EntityResolveRowProps {
  readonly mention: string;
  readonly isExpanded: boolean;
  readonly onToggle: () => void;
  readonly onResolve: (mention: string, entityType: EntityType, entityName: string) => void;
  readonly isResolving?: boolean;
}

function EntityResolveRow({ mention, isExpanded, onToggle, onResolve, isResolving }: EntityResolveRowProps) {
  return (
    <div className="rounded-md border border-yellow-500/30 text-sm">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-left text-yellow-500 hover:bg-yellow-500/5"
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        <span>"{mention}" — not in the database</span>
        <span className="text-xs">{isExpanded ? '▾' : '▸'}</span>
      </button>
      {isExpanded && (
        <EntityForm
          mention={mention}
          onSubmit={(entityType, entityName) => onResolve(mention, entityType, entityName)}
          isResolving={isResolving}
        />
      )}
    </div>
  );
}

// --- Concept: form to create a new entity ---

interface EntityFormProps {
  readonly mention: string;
  readonly onSubmit: (entityType: EntityType, entityName: string) => void;
  readonly isResolving?: boolean;
}

function EntityForm({ mention, onSubmit, isResolving }: EntityFormProps) {
  const [entityName, setEntityName] = useState(mention);
  const [entityType, setEntityType] = useState<EntityType>('item');

  const handleSubmit = useCallback(() => {
    const trimmed = entityName.trim();
    if (trimmed === '') return;
    onSubmit(entityType, trimmed);
  }, [entityName, entityType, onSubmit]);

  return (
    <div className="space-y-2 border-t border-yellow-500/20 px-3 py-2" role="form" aria-label={`Add ${mention}`}>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground" htmlFor={`name-${mention}`}>Name</label>
        <Input
          id={`name-${mention}`}
          value={entityName}
          onChange={e => setEntityName(e.target.value)}
          disabled={isResolving}
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground" htmlFor={`type-${mention}`}>Type</label>
        <Select
          id={`type-${mention}`}
          value={entityType}
          onChange={e => setEntityType(e.target.value as EntityType)}
          disabled={isResolving}
        >
          {ENTITY_TYPE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>
      </div>
      <Button
        size="sm"
        onClick={handleSubmit}
        disabled={isResolving || entityName.trim() === ''}
      >
        {isResolving ? 'Adding...' : 'Add to database'}
      </Button>
    </div>
  );
}
