import type { DesignerPoint } from '../model';

export interface HelperLineChange {
  id: string;
  type: string;
  position?: DesignerPoint;
  dragging?: boolean;
}

export interface HelperLineNode {
  id: string;
  type?: string;
  position: DesignerPoint;
  measured?: { width?: number; height?: number };
  width?: number;
  height?: number;
}

export interface HelperLinesResult {
  horizontal?: number;
  vertical?: number;
  snapPosition?: DesignerPoint;
}

interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function boundsOf(node: HelperLineNode): Bounds {
  const width = node.measured?.width ?? node.width ?? 220;
  const height = node.measured?.height ?? node.height ?? 180;
  return {
    left: node.position.x,
    right: node.position.x + width,
    top: node.position.y,
    bottom: node.position.y + height
  };
}

function nearest(
  current: number,
  candidates: readonly { line: number; position: number }[],
  distance: number
): { line: number; position: number } | undefined {
  let best: { line: number; position: number } | undefined;
  let bestDelta = distance + 1;
  for (const candidate of candidates) {
    const delta = Math.abs(candidate.position - current);
    if (delta <= distance && delta < bestDelta) {
      best = candidate;
      bestDelta = delta;
    }
  }
  return best;
}

export function getHelperLines(
  changes: readonly HelperLineChange[],
  nodes: readonly HelperLineNode[],
  distance = 6
): HelperLinesResult {
  if (changes.length !== 1) {
    return {};
  }
  const change = changes[0];
  if (change === undefined || change.type !== 'position' || change.position === undefined) {
    return {};
  }
  if (change.dragging !== true) {
    return {};
  }
  const moving = nodes.find((node) => node.id === change.id);
  if (moving === undefined || moving.type !== 'dataModel') {
    return {};
  }
  const movingBounds = boundsOf({ ...moving, position: change.position });
  const movingWidth = movingBounds.right - movingBounds.left;
  const movingHeight = movingBounds.bottom - movingBounds.top;
  const verticalCandidates: { line: number; position: number }[] = [];
  const horizontalCandidates: { line: number; position: number }[] = [];
  for (const node of nodes) {
    if (node.id === change.id || node.type !== 'dataModel') {
      continue;
    }
    const bounds = boundsOf(node);
    verticalCandidates.push(
      { line: bounds.left, position: bounds.left },
      { line: bounds.right, position: bounds.right - movingWidth },
      { line: bounds.left, position: bounds.left - movingWidth },
      { line: bounds.right, position: bounds.right }
    );
    horizontalCandidates.push(
      { line: bounds.top, position: bounds.top },
      { line: bounds.bottom, position: bounds.bottom - movingHeight },
      { line: bounds.top, position: bounds.top - movingHeight },
      { line: bounds.bottom, position: bounds.bottom }
    );
  }
  const vertical = nearest(change.position.x, verticalCandidates, distance);
  const horizontal = nearest(change.position.y, horizontalCandidates, distance);
  return {
    ...(horizontal === undefined ? {} : { horizontal: horizontal.line }),
    ...(vertical === undefined ? {} : { vertical: vertical.line }),
    snapPosition: {
      x: vertical?.position ?? change.position.x,
      y: horizontal?.position ?? change.position.y
    }
  };
}
