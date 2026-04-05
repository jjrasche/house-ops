import { useState, useCallback, useEffect } from 'react';
import type {
  PipelineTrace, Correction, ResolveCorrection, ResolvedEntity,
  ExtractCorrection, ClassifyCorrection, AssembleCorrection,
} from '../lib/pipeline/types';
import type { ResolveCandidate } from '../lib/pipeline/resolve';
import { TOOL_SCHEMAS } from '../lib/pipeline/validate';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Select } from './ui/select';

// --- Public types ---

export type FetchCandidates = (mention: string) => Promise<ResolveCandidate[]>;

export interface StageCorrectionProps {
  readonly trace: PipelineTrace;
  readonly onCorrect: (correction: Correction) => void;
  readonly fetchCandidates?: FetchCandidates;
}

// --- Constants ---

const AVAILABLE_TOOLS = Object.keys(TOOL_SCHEMAS);

// --- Orchestrator ---

export function StageCorrection({ trace, onCorrect, fetchCandidates }: StageCorrectionProps) {
  const [editingStage, setEditingStage] = useState<string | null>(null);

  const toggleStage = useCallback((stage: string) => {
    setEditingStage(prev => prev === stage ? null : stage);
  }, []);

  const hasResolvedEntities = trace.resolved.length > 0;

  return (
    <div className="space-y-1 text-xs" role="list" aria-label="Stage corrections">
      <CorrectionRow
        label="Heard"
        summary={formatExtractSummary(trace)}
        isEditing={editingStage === 'extract'}
        onToggle={() => toggleStage('extract')}
      >
        <ExtractCorrectionForm trace={trace} onCorrect={onCorrect} />
      </CorrectionRow>
      {hasResolvedEntities && fetchCandidates && (
        <CorrectionRow
          label="Resolve"
          summary={formatResolveSummary(trace)}
          isEditing={editingStage === 'resolve'}
          onToggle={() => toggleStage('resolve')}
        >
          <ResolveCorrectionForm
            resolved={trace.resolved}
            fetchCandidates={fetchCandidates}
            onCorrect={onCorrect}
          />
        </CorrectionRow>
      )}
      {trace.toolName && (
        <CorrectionRow
          label="Tool"
          summary={trace.toolName}
          isEditing={editingStage === 'classify'}
          onToggle={() => toggleStage('classify')}
        >
          <ClassifyCorrectionForm currentTool={trace.toolName} onCorrect={onCorrect} />
        </CorrectionRow>
      )}
      {Object.keys(trace.params).length > 0 && (
        <CorrectionRow
          label="Params"
          summary={formatParamSummary(trace.params)}
          isEditing={editingStage === 'assemble'}
          onToggle={() => toggleStage('assemble')}
        >
          <AssembleCorrectionForm currentParams={trace.params} onCorrect={onCorrect} />
        </CorrectionRow>
      )}
    </div>
  );
}

// --- Concept: expandable correction row ---

interface CorrectionRowProps {
  readonly label: string;
  readonly summary: string;
  readonly isEditing: boolean;
  readonly onToggle: () => void;
  readonly children: React.ReactNode;
}

function CorrectionRow({ label, summary, isEditing, onToggle, children }: CorrectionRowProps) {
  return (
    <div role="listitem" data-stage={label.toLowerCase()}>
      <button
        type="button"
        className="flex w-full gap-2 text-muted-foreground hover:text-foreground text-left"
        onClick={onToggle}
        aria-expanded={isEditing}
      >
        <span className="shrink-0">{isEditing ? '▾' : '▸'} {label}:</span>
        <span className="truncate">{summary}</span>
      </button>
      {isEditing && (
        <div className="mt-1 ml-4 space-y-2 rounded border border-border p-2">
          {children}
        </div>
      )}
    </div>
  );
}

// --- Concept: resolve correction form (pick from fuzzy match candidates) ---

function ResolveCorrectionForm({
  resolved,
  fetchCandidates,
  onCorrect,
}: {
  readonly resolved: readonly ResolvedEntity[];
  readonly fetchCandidates: FetchCandidates;
  readonly onCorrect: (correction: ResolveCorrection) => void;
}) {
  const [candidateMap, setCandidateMap] = useState<Record<string, ResolveCandidate[]>>({});
  const [selectedMention, setSelectedMention] = useState<string | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<ResolveCandidate | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    const mentions = resolved.map(r => r.mention);
    Promise.all(mentions.map(m => fetchCandidates(m).then(c => [m, c] as const)))
      .then(entries => {
        if (cancelled) return;
        setCandidateMap(Object.fromEntries(entries));
        setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [resolved, fetchCandidates]);

  const handleSelectMention = useCallback((mention: string) => {
    setSelectedMention(mention);
    setSelectedCandidate(null);
  }, []);

  const handleSelectCandidate = useCallback((candidateIndex: string) => {
    if (!selectedMention) return;
    const candidates = candidateMap[selectedMention] ?? [];
    const candidate = candidates[Number(candidateIndex)];
    if (candidate) setSelectedCandidate(candidate);
  }, [selectedMention, candidateMap]);

  const handleSubmit = useCallback(() => {
    if (!selectedMention || !selectedCandidate) return;
    onCorrect({
      stage: 'resolve',
      mention: selectedMention,
      preferredId: selectedCandidate.entityId,
      preferredType: selectedCandidate.entityType,
    });
  }, [selectedMention, selectedCandidate, onCorrect]);

  if (isLoading) {
    return <span className="text-xs text-muted-foreground">Loading candidates...</span>;
  }

  const currentEntity = selectedMention
    ? resolved.find(r => r.mention === selectedMention)
    : null;

  const candidates = selectedMention ? (candidateMap[selectedMention] ?? []) : [];
  const isNewSelection = selectedCandidate !== null
    && currentEntity !== null
    && (selectedCandidate.entityId !== currentEntity?.entityId
      || selectedCandidate.entityType !== currentEntity?.entityType);

  return (
    <>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground" htmlFor="resolve-mention">Entity</label>
        <Select
          id="resolve-mention"
          value={selectedMention ?? ''}
          onChange={e => handleSelectMention(e.target.value)}
        >
          <option value="" disabled>Select entity...</option>
          {resolved.map(r => (
            <option key={r.mention} value={r.mention}>
              {r.mention} → {r.entityType}(#{r.entityId})
            </option>
          ))}
        </Select>
      </div>
      {selectedMention && candidates.length > 0 && (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor="resolve-candidate">Match</label>
          <Select
            id="resolve-candidate"
            value={selectedCandidate ? String(candidates.indexOf(selectedCandidate)) : ''}
            onChange={e => handleSelectCandidate(e.target.value)}
          >
            <option value="" disabled>Pick match...</option>
            {candidates.map((c, i) => (
              <option key={`${c.entityType}-${c.entityId}`} value={String(i)}>
                {c.entityType}(#{c.entityId}) — score {c.score.toFixed(2)}
              </option>
            ))}
          </Select>
        </div>
      )}
      <Button size="sm" onClick={handleSubmit} disabled={!isNewSelection}>
        Apply
      </Button>
    </>
  );
}

// --- Concept: extract correction form (verb + optional alias) ---

function ExtractCorrectionForm({
  trace,
  onCorrect,
}: {
  readonly trace: PipelineTrace;
  readonly onCorrect: (correction: ExtractCorrection) => void;
}) {
  const [verb, setVerb] = useState(trace.verb);

  const handleSubmit = useCallback(() => {
    if (verb.trim() === '' || verb === trace.verb) return;
    onCorrect({ stage: 'extract', verb: verb.trim() });
  }, [verb, trace.verb, onCorrect]);

  return (
    <>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground" htmlFor="correction-verb">Verb</label>
        <Input
          id="correction-verb"
          value={verb}
          onChange={e => setVerb(e.target.value)}
        />
      </div>
      <Button size="sm" onClick={handleSubmit} disabled={verb.trim() === '' || verb === trace.verb}>
        Apply
      </Button>
    </>
  );
}

// --- Concept: classify correction form (tool name select) ---

function ClassifyCorrectionForm({
  currentTool,
  onCorrect,
}: {
  readonly currentTool: string;
  readonly onCorrect: (correction: ClassifyCorrection) => void;
}) {
  const [toolName, setToolName] = useState(currentTool);

  const handleSubmit = useCallback(() => {
    if (toolName === currentTool) return;
    onCorrect({ stage: 'classify', toolName });
  }, [toolName, currentTool, onCorrect]);

  return (
    <>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground" htmlFor="correction-tool">Tool</label>
        <Select
          id="correction-tool"
          value={toolName}
          onChange={e => setToolName(e.target.value)}
        >
          {AVAILABLE_TOOLS.map(tool => (
            <option key={tool} value={tool}>{tool}</option>
          ))}
        </Select>
      </div>
      <Button size="sm" onClick={handleSubmit} disabled={toolName === currentTool}>
        Apply
      </Button>
    </>
  );
}

// --- Concept: assemble correction form (editable key-value params) ---

function AssembleCorrectionForm({
  currentParams,
  onCorrect,
}: {
  readonly currentParams: Readonly<Record<string, unknown>>;
  readonly onCorrect: (correction: AssembleCorrection) => void;
}) {
  const [editedParams, setEditedParams] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(currentParams).map(([k, v]) => [k, String(v)])),
  );

  const updateParam = useCallback((key: string, value: string) => {
    setEditedParams(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = useCallback(() => {
    const parsed = parseParamValues(editedParams);
    onCorrect({ stage: 'assemble', params: parsed });
  }, [editedParams, onCorrect]);

  const hasChanges = Object.entries(editedParams).some(
    ([key, value]) => String(currentParams[key]) !== value,
  );

  return (
    <>
      {Object.entries(editedParams).map(([key, value]) => (
        <div key={key} className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor={`param-${key}`}>{key}</label>
          <Input
            id={`param-${key}`}
            value={value}
            onChange={e => updateParam(key, e.target.value)}
          />
        </div>
      ))}
      <Button size="sm" onClick={handleSubmit} disabled={!hasChanges}>
        Apply
      </Button>
    </>
  );
}

// --- Leaf: format resolve summary ---

function formatResolveSummary(trace: PipelineTrace): string {
  return trace.resolved
    .map(r => `"${r.mention}" → ${r.entityType}(#${r.entityId})`)
    .join(', ');
}

// --- Leaf: format extract summary ---

function formatExtractSummary(trace: PipelineTrace): string {
  const entities = trace.entityMentions.map(m => `"${m.text}"`).join(', ');
  return entities ? `verb="${trace.verb}", ${entities}` : `verb="${trace.verb}"`;
}

// --- Leaf: format params as key=value ---

function formatParamSummary(params: Readonly<Record<string, unknown>>): string {
  return Object.entries(params)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(', ');
}

// --- Leaf: parse string values back to numbers where appropriate ---

function parseParamValues(params: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    const asNumber = Number(value);
    result[key] = !Number.isNaN(asNumber) && value.trim() !== '' ? asNumber : value;
  }
  return result;
}
