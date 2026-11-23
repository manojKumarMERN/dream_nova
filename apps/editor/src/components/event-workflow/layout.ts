export interface WorkflowPoint {
  x: number;
  y: number;
}

export interface WorkflowLayout {
  positions: Record<string, WorkflowPoint>;
  viewport?: { x: number; y: number; zoom: number };
}

const STORAGE_PREFIX = 'nova.event-workflow.layout.';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPoint(value: unknown): value is WorkflowPoint {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const point = value as { x?: unknown; y?: unknown };
  return isFiniteNumber(point.x) && isFiniteNumber(point.y);
}

function storageKey(appId: string, workflowId: string): string {
  return `${STORAGE_PREFIX}${appId}.${workflowId}`;
}

export function emptyWorkflowLayout(): WorkflowLayout {
  return { positions: {} };
}

export function loadWorkflowLayout(appId: string, workflowId: string): WorkflowLayout {
  const fallback = emptyWorkflowLayout();
  if (typeof localStorage === 'undefined') {
    return fallback;
  }
  try {
    const raw = localStorage.getItem(storageKey(appId, workflowId));
    if (raw === null) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as Partial<WorkflowLayout>;
    const positions: Record<string, WorkflowPoint> = {};
    for (const [id, value] of Object.entries(parsed.positions ?? {})) {
      if (isPoint(value)) {
        positions[id] = value;
      }
    }
    const viewport = parsed.viewport;
    return {
      positions,
      ...(viewport !== undefined &&
      isFiniteNumber(viewport.x) &&
      isFiniteNumber(viewport.y) &&
      isFiniteNumber(viewport.zoom)
        ? { viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom } }
        : {})
    };
  } catch {
    return fallback;
  }
}

export function saveWorkflowLayout(
  appId: string,
  workflowId: string,
  layout: WorkflowLayout
): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(storageKey(appId, workflowId), JSON.stringify(layout));
  } catch {
    return;
  }
}
