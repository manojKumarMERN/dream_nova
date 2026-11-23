import dagre from '@dagrejs/dagre';
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';
import type { SimulationNodeDatum } from 'd3-force';
import type { DesignerPoint } from '../model';

export type DesignerLayoutDirection = 'LR' | 'TB';

export interface LayoutInputNode {
  id: string;
  position: DesignerPoint;
  width?: number;
  height?: number;
}

export interface LayoutInputEdge {
  id: string;
  source: string;
  target: string;
}

interface ForceNode extends SimulationNodeDatum {
  id: string;
  width: number;
  height: number;
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function layoutWithDagre(
  nodes: readonly LayoutInputNode[],
  edges: readonly LayoutInputEdge[],
  direction: DesignerLayoutDirection
): Record<string, DesignerPoint> {
  if (nodes.length === 0) {
    return {};
  }
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: direction, nodesep: 70, ranksep: 150, marginx: 40, marginy: 40 });
  const sizes = new Map<string, { width: number; height: number }>();
  for (const node of nodes) {
    const size = { width: node.width ?? 220, height: node.height ?? 180 };
    sizes.set(node.id, size);
    graph.setNode(node.id, size);
  }
  const ids = new Set(nodes.map((node) => node.id));
  for (const edge of edges) {
    if (ids.has(edge.source) && ids.has(edge.target)) {
      graph.setEdge(edge.source, edge.target, { id: edge.id });
    }
  }
  dagre.layout(graph);
  const positions: Record<string, DesignerPoint> = {};
  for (const node of nodes) {
    const point = graph.node(node.id) as { x: number; y: number } | undefined;
    const size = sizes.get(node.id);
    if (point === undefined || size === undefined) {
      continue;
    }
    positions[node.id] = { x: point.x - size.width / 2, y: point.y - size.height / 2 };
  }
  return positions;
}

export function layoutWithForce(
  nodes: readonly LayoutInputNode[],
  edges: readonly LayoutInputEdge[]
): Record<string, DesignerPoint> {
  if (nodes.length === 0) {
    return {};
  }
  const forceNodes: ForceNode[] = nodes.map((node) => ({
    id: node.id,
    x: node.position.x,
    y: node.position.y,
    width: node.width ?? 220,
    height: node.height ?? 180
  }));
  const ids = new Set(forceNodes.map((node) => node.id));
  const forceLinks = edges
    .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
    .map((edge) => ({ source: edge.source, target: edge.target }));
  const centerX = average(forceNodes.map((node) => node.x ?? 0));
  const centerY = average(forceNodes.map((node) => node.y ?? 0));
  const simulation = forceSimulation(forceNodes)
    .force('charge', forceManyBody().strength(-900))
    .force(
      'link',
      forceLink(forceLinks)
        .id((node) => (node as ForceNode).id)
        .distance(280)
        .strength(0.08)
    )
    .force(
      'collide',
      forceCollide<ForceNode>().radius((node) => Math.max(node.width, node.height) / 2 + 30)
    )
    .force('x', forceX(centerX).strength(0.05))
    .force('y', forceY(centerY).strength(0.05))
    .stop();
  simulation.tick(320);
  const positions: Record<string, DesignerPoint> = {};
  for (const node of forceNodes) {
    positions[node.id] = { x: node.x ?? 0, y: node.y ?? 0 };
  }
  return positions;
}
