import type { DesignerPoint } from './model';

export interface DesignerGroup {
  id: string;
  name: string;
  position: DesignerPoint;
  width: number;
  height: number;
  modelIds: string[];
}

export interface DesignerLayout {
  positions: Record<string, DesignerPoint>;
  groups: DesignerGroup[];
  collapsedModelIds: string[];
  layoutDirection?: 'LR' | 'TB';
  viewport?: { x: number; y: number; zoom: number };
}

const STORAGE_PREFIX = 'nova.data-designer.layout.';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPoint(value: unknown): value is DesignerPoint {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const point = value as { x?: unknown; y?: unknown };
  return isFiniteNumber(point.x) && isFiniteNumber(point.y);
}

function isGroup(value: unknown): value is DesignerGroup {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const group = value as {
    id?: unknown;
    name?: unknown;
    position?: unknown;
    width?: unknown;
    height?: unknown;
    modelIds?: unknown;
  };
  return (
    typeof group.id === 'string' &&
    typeof group.name === 'string' &&
    isPoint(group.position) &&
    isFiniteNumber(group.width) &&
    group.width > 0 &&
    isFiniteNumber(group.height) &&
    group.height > 0 &&
    Array.isArray(group.modelIds) &&
    group.modelIds.every((id) => typeof id === 'string')
  );
}

export function loadDesignerLayout(appId: string): DesignerLayout {
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${appId}`);
    if (raw === null) {
      return { positions: {}, groups: [], collapsedModelIds: [] };
    }
    const parsed = JSON.parse(raw) as {
      positions?: unknown;
      groups?: unknown;
      collapsedModelIds?: unknown;
      layoutDirection?: unknown;
      viewport?: unknown;
    };
    const positions: Record<string, DesignerPoint> = {};
    if (parsed.positions !== null && typeof parsed.positions === 'object') {
      for (const [modelId, point] of Object.entries(parsed.positions ?? {})) {
        if (isPoint(point)) {
          positions[modelId] = { x: point.x, y: point.y };
        }
      }
    }
    const groups = Array.isArray(parsed.groups) ? parsed.groups.filter(isGroup) : [];
    const collapsedModelIds = Array.isArray(parsed.collapsedModelIds)
      ? parsed.collapsedModelIds.filter((id): id is string => typeof id === 'string')
      : [];
    const layoutDirection =
      parsed.layoutDirection === 'LR' || parsed.layoutDirection === 'TB'
        ? parsed.layoutDirection
        : undefined;
    const viewport = parsed.viewport;
    return {
      positions,
      groups,
      collapsedModelIds,
      ...(layoutDirection === undefined ? {} : { layoutDirection }),
      ...(viewport !== null &&
      typeof viewport === 'object' &&
      isFiniteNumber((viewport as { x?: unknown }).x) &&
      isFiniteNumber((viewport as { y?: unknown }).y) &&
      isFiniteNumber((viewport as { zoom?: unknown }).zoom)
        ? { viewport: viewport as { x: number; y: number; zoom: number } }
        : {})
    };
  } catch {
    return { positions: {}, groups: [], collapsedModelIds: [] };
  }
}

export function saveDesignerLayout(appId: string, layout: DesignerLayout): void {
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${appId}`, JSON.stringify(layout));
  } catch {
    return;
  }
}
