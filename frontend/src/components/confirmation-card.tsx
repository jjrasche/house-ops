import type { PipelineResult, ToolCall } from '../lib/pipeline/types';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

// --- Public types ---

export interface ConfirmationCardProps {
  readonly result: PipelineResult;
  readonly onConfirm: (toolCall: ToolCall) => void;
  readonly onReject: (toolCall: ToolCall) => void;
}

// --- Constants ---

const TOOL_LABELS: Record<string, string> = {
  update_item_status: 'Update item',
  create_action: 'Create action',
  update_action: 'Update action',
};

const PARAM_LABELS: Record<string, string> = {
  item_id: 'Item',
  person_id: 'Person',
  location_id: 'Location',
  store_id: 'Store',
  action_id: 'Action',
  status: 'Status',
  quantity: 'Quantity',
  quantity_needed: 'Quantity needed',
  quantity_delta: 'Quantity change',
  unit: 'Unit',
  starts_at: 'Starts at',
  due_at: 'Due',
  title: 'Title',
};

// --- Orchestrator ---

export function ConfirmationCard({ result, onConfirm, onReject }: ConfirmationCardProps) {
  if (result.toolCalls.length === 0) {
    return <EmptyCard path={result.path} />;
  }

  const toolCall = result.toolCalls[0]!;

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{formatToolLabel(toolCall.tool)}</CardTitle>
          <ConfidenceBadge confidence={result.confidence} />
        </div>
      </CardHeader>
      <CardContent>
        <ParamList params={toolCall.params} />
      </CardContent>
      <CardFooter className="gap-2">
        <Button variant="default" onClick={() => onConfirm(toolCall)}>Confirm</Button>
        <Button variant="ghost" onClick={() => onReject(toolCall)}>Reject</Button>
      </CardFooter>
    </Card>
  );
}

// --- Concept: empty state when no tool calls produced ---

function EmptyCard({ path }: { readonly path: string }) {
  const message = path === 'llm'
    ? "I'm not sure what to do with that. Could you rephrase?"
    : 'Could not validate that action. Please try again.';

  return (
    <Card className="w-full max-w-md">
      <CardContent className="pt-6">
        <p className="text-muted-foreground text-sm">{message}</p>
      </CardContent>
    </Card>
  );
}

// --- Concept: render confidence as colored badge ---

function ConfidenceBadge({ confidence }: { readonly confidence: number }) {
  const variant = selectConfidenceVariant(confidence);
  const label = `${Math.round(confidence * 100)}%`;

  return <Badge variant={variant}>{label}</Badge>;
}

// --- Concept: render param key-value pairs ---

function ParamList({ params }: { readonly params: Record<string, unknown> }) {
  const entries = Object.entries(params);

  if (entries.length === 0) {
    return <p className="text-muted-foreground text-sm">No parameters</p>;
  }

  return (
    <dl className="space-y-1 text-sm">
      {entries.map(([key, value]) => (
        <div key={key} className="flex justify-between">
          <dt className="text-muted-foreground">{formatParamLabel(key)}</dt>
          <dd className="font-medium">{String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

// --- Leaf: tool name to human label ---

function formatToolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? toolName.replaceAll('_', ' ');
}

// --- Leaf: param key to human label ---

function formatParamLabel(paramKey: string): string {
  return PARAM_LABELS[paramKey] ?? paramKey.replaceAll('_', ' ');
}

// --- Leaf: confidence to badge variant ---

function selectConfidenceVariant(confidence: number): 'default' | 'secondary' | 'destructive' {
  if (confidence >= 0.85) return 'default';
  if (confidence >= 0.5) return 'secondary';
  return 'destructive';
}
