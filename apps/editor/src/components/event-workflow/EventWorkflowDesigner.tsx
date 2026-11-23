import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, MouseEvent as ReactMouseEvent } from 'react';
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow
} from '@xyflow/react';
import type { Connection, Edge, OnNodesChange, Viewport } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type {
  AppDefinition,
  WorkflowDefinition,
  WorkflowEventNodeType,
  WorkflowGraph,
  WorkflowGraphEdge,
  WorkflowGraphNode,
  WorkflowOutcome
} from '@nova/spec';
import { layoutWithDagre } from '../database-designer/pro-features/layoutAlgorithms';
import type { EditorSessionLike, InspectorContract, Toast, WorkflowRef } from '../../types';
import { Icon } from '../Icons';
import {
  buildGuidedActionContext,
  configureGuidedNode as applyGuidedConfiguration,
  createGuidedNode,
  friendlyIssueMessage,
  GUIDED_ACTIONS,
  guidedConfigurationIssues,
  type GuidedActionConfig,
  type GuidedActionContext,
  type GuidedActionId
} from './guided-authoring';
import { loadWorkflowLayout, saveWorkflowLayout } from './layout';
import type { WorkflowLayout, WorkflowPoint } from './layout';
import {
  canConnect,
  createEventNode,
  duplicateEventNode,
  graphToSteps,
  OUTCOME_META,
  resolveWorkflow,
  upsertWorkflow,
  WORKFLOW_OUTCOMES
} from './model';
import { WorkflowEventNode } from './WorkflowEventNode';
import type {
  WorkflowEventFlowNode,
  WorkflowExecutionState,
  WorkflowNodeAction
} from './WorkflowEventNode';
import { WorkflowInspector } from './WorkflowInspector';
import type { WorkflowConfigMode } from './WorkflowInspector';
import {
  EVENT_NODE_DRAG_TYPE,
  GUIDED_ACTION_DRAG_TYPE,
  WorkflowNodeLibrary
} from './WorkflowNodeLibrary';
import { createTemplateGraph, type GuidedWorkflowTemplateId } from './workflow-templates';
import type { WorkflowDesignerIssue } from './validation';
import { validateWorkflowDefinition, workflowIssueCounts } from './validation';

const nodeTypes = { workflowEvent: WorkflowEventNode };

const OUTCOME_COLORS: Record<WorkflowOutcome, string> = {
  success: '#14855a',
  failure: '#cf3b4e',
  warning: '#c27a12'
};

interface EventWorkflowDesignerProps {
  appId: string;
  definition: AppDefinition;
  contracts: readonly InspectorContract[];
  session: EditorSessionLike;
  target: WorkflowRef;
  onClose: () => void;
  onSave: () => Promise<void>;
  onToast: (kind: Toast['kind'], message: string) => void;
}

interface DesignerSnapshot {
  workflow: WorkflowDefinition;
  layout: WorkflowLayout;
}

interface ContextMenuState {
  x: number;
  y: number;
  nodeId: string;
  label: string;
}

type DesignerTheme = 'light' | 'dark';
type BottomTab = 'validation' | 'configuration' | 'execution';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isOutcome(value: string | null | undefined): value is WorkflowOutcome {
  return (
    value !== null && value !== undefined && WORKFLOW_OUTCOMES.includes(value as WorkflowOutcome)
  );
}

function defaultPosition(index: number): WorkflowPoint {
  return { x: 80 + (index % 3) * 330, y: 80 + Math.floor(index / 3) * 220 };
}

function severityRank(value: 'valid' | 'warning' | 'error'): number {
  return value === 'error' ? 2 : value === 'warning' ? 1 : 0;
}

export function EventWorkflowDesigner(props: EventWorkflowDesignerProps) {
  return (
    <ReactFlowProvider>
      <EventWorkflowDesignerInner {...props} />
    </ReactFlowProvider>
  );
}

function EventWorkflowDesignerInner({
  appId,
  definition,
  contracts,
  session,
  target,
  onClose,
  onSave,
  onToast
}: EventWorkflowDesignerProps) {
  const [workflow, setWorkflow] = useState<WorkflowDefinition>(() =>
    resolveWorkflow(definition, target)
  );
  const [layout, setLayout] = useState<WorkflowLayout>(() =>
    loadWorkflowLayout(appId, workflow.id)
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(undefined);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | undefined>(undefined);
  const [mode, setMode] = useState<WorkflowConfigMode>('simple');
  const [bottomTab, setBottomTab] = useState<BottomTab>('validation');
  const [theme, setTheme] = useState<DesignerTheme>(() => {
    if (typeof localStorage === 'undefined') {
      return 'light';
    }
    return localStorage.getItem('nova.event-workflow.theme') === 'dark' ? 'dark' : 'light';
  });
  const [menu, setMenu] = useState<ContextMenuState | undefined>(undefined);
  const [historyVersion, setHistoryVersion] = useState(0);
  const { fitView, screenToFlowPosition } = useReactFlow();
  const pastRef = useRef<DesignerSnapshot[]>([]);
  const futureRef = useRef<DesignerSnapshot[]>([]);
  const workflowRef = useRef(workflow);
  const layoutRef = useRef(layout);
  workflowRef.current = workflow;
  layoutRef.current = layout;

  const graph = workflow.graph ?? { nodes: [], edges: [] };
  const guidedContext = useMemo<GuidedActionContext>(
    () => buildGuidedActionContext(definition, contracts),
    [contracts, definition]
  );
  const canonicalIssues = useMemo(() => validateWorkflowDefinition(workflow), [workflow]);
  const guidedIssues = useMemo<WorkflowDesignerIssue[]>(
    () =>
      graph.nodes.flatMap((node) =>
        guidedConfigurationIssues(node, guidedContext).map((issue) => ({
          code: issue.code,
          message: issue.message,
          path: `workflow.graph.nodes[${node.id}].${issue.field ?? 'event'}`,
          severity: issue.severity,
          nodeId: node.id
        }))
      ),
    [graph.nodes, guidedContext]
  );
  const issues = useMemo(
    () => [...canonicalIssues, ...guidedIssues],
    [canonicalIssues, guidedIssues]
  );
  const counts = useMemo(() => workflowIssueCounts(issues), [issues]);

  useEffect(() => {
    saveWorkflowLayout(appId, workflow.id, layout);
  }, [appId, layout, workflow.id]);

  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('nova.event-workflow.theme', theme);
    }
  }, [theme]);

  const recordHistory = useCallback(() => {
    pastRef.current.push({
      workflow: clone(workflowRef.current),
      layout: clone(layoutRef.current)
    });
    if (pastRef.current.length > 100) {
      pastRef.current.shift();
    }
    futureRef.current = [];
    setHistoryVersion((current) => current + 1);
  }, []);

  const restoreSnapshot = useCallback((snapshot: DesignerSnapshot) => {
    setWorkflow(snapshot.workflow);
    setLayout(snapshot.layout);
    setSelectedNodeId(undefined);
    setSelectedEdgeId(undefined);
  }, []);

  const undo = useCallback(() => {
    const previous = pastRef.current.pop();
    if (previous === undefined) {
      return;
    }
    futureRef.current.push({
      workflow: clone(workflowRef.current),
      layout: clone(layoutRef.current)
    });
    restoreSnapshot(previous);
    setHistoryVersion((current) => current + 1);
  }, [restoreSnapshot]);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (next === undefined) {
      return;
    }
    pastRef.current.push({
      workflow: clone(workflowRef.current),
      layout: clone(layoutRef.current)
    });
    restoreSnapshot(next);
    setHistoryVersion((current) => current + 1);
  }, [restoreSnapshot]);

  const commitGraph = useCallback(
    (update: (current: WorkflowGraph) => WorkflowGraph) => {
      recordHistory();
      setWorkflow((current) => {
        const currentGraph = current.graph ?? { nodes: [], edges: [] };
        const nextGraph = update(currentGraph);
        return { ...current, graph: nextGraph, steps: graphToSteps(nextGraph) };
      });
    },
    [recordHistory]
  );

  const updateNode = useCallback(
    (nodeId: string, update: (node: WorkflowGraphNode) => WorkflowGraphNode) => {
      commitGraph((current) => ({
        ...current,
        nodes: current.nodes.map((node) => (node.id === nodeId ? update(node) : node))
      }));
    },
    [commitGraph]
  );

  const addNode = useCallback(
    (type: WorkflowEventNodeType, position?: WorkflowPoint) => {
      const node = createEventNode(type, target);
      const index = workflowRef.current.graph?.nodes.length ?? 0;
      setLayout((current) => ({
        ...current,
        positions: { ...current.positions, [node.id]: position ?? defaultPosition(index) }
      }));
      commitGraph((current) => ({ ...current, nodes: [...current.nodes, node] }));
      setSelectedNodeId(node.id);
      setSelectedEdgeId(undefined);
      setMenu(undefined);
    },
    [commitGraph, target]
  );

  const collectUsedIdentifiers = useCallback(() => {
    const used = new Set<string>();
    for (const node of workflowRef.current.graph?.nodes ?? []) {
      used.add(node.event.identifier);
      if (node.event.incomingIdentifier !== undefined) {
        used.add(node.event.incomingIdentifier);
      }
    }
    return used;
  }, []);

  const targetForAction = useCallback(
    (id: GuidedActionId): WorkflowRef | undefined =>
      id === 'start-from-component' || id === 'listen-event' || id === 'raise-event'
        ? target
        : undefined,
    [target]
  );

  const addGuidedNode = useCallback(
    (id: GuidedActionId, position?: WorkflowPoint) => {
      const node = createGuidedNode(id, guidedContext, {
        target: targetForAction(id),
        usedIdentifiers: collectUsedIdentifiers()
      });
      const index = workflowRef.current.graph?.nodes.length ?? 0;
      setLayout((current) => ({
        ...current,
        positions: { ...current.positions, [node.id]: position ?? defaultPosition(index) }
      }));
      commitGraph((current) => ({ ...current, nodes: [...current.nodes, node] }));
      setSelectedNodeId(node.id);
      setSelectedEdgeId(undefined);
      setMenu(undefined);
    },
    [collectUsedIdentifiers, commitGraph, guidedContext, targetForAction]
  );

  const configureGuided = useCallback(
    (nodeId: string, id: GuidedActionId, patch: GuidedActionConfig) => {
      updateNode(nodeId, (current) =>
        applyGuidedConfiguration(current, id, patch, guidedContext, targetForAction(id))
      );
    },
    [guidedContext, targetForAction, updateNode]
  );

  const applyTemplate = useCallback(
    (id: GuidedWorkflowTemplateId) => {
      const currentGraph = workflowRef.current.graph;
      if (
        (currentGraph?.nodes.length ?? 0) > 0 &&
        !window.confirm('Replace the current workflow graph with this guided template?')
      ) {
        return;
      }
      const graph = createTemplateGraph(id, { context: guidedContext, target });
      recordHistory();
      setLayout((current) => ({
        ...current,
        positions: Object.fromEntries(
          graph.nodes.map((node, index) => [node.id, defaultPosition(index)])
        )
      }));
      setWorkflow((current) => ({ ...current, graph, steps: graphToSteps(graph) }));
      setSelectedNodeId(undefined);
      setSelectedEdgeId(undefined);
      setMenu(undefined);
      window.setTimeout(() => void fitView({ padding: 0.2, duration: 350 }), 0);
    },
    [fitView, guidedContext, recordHistory, target]
  );

  const addSuggestedAction = useCallback(
    (nodeId: string, outcome: WorkflowOutcome, id: GuidedActionId) => {
      const currentGraph = workflowRef.current.graph;
      if (currentGraph === undefined) {
        return;
      }
      const node = createGuidedNode(id, guidedContext, {
        target: targetForAction(id),
        usedIdentifiers: collectUsedIdentifiers()
      });
      const candidateGraph: WorkflowGraph = {
        ...currentGraph,
        nodes: [...currentGraph.nodes, node]
      };
      if (!canConnect(candidateGraph, nodeId, node.id, outcome)) {
        onToast('error', 'That outcome is already connected or the connection is invalid');
        return;
      }
      const edge: WorkflowGraphEdge = {
        id: crypto.randomUUID(),
        source: nodeId,
        target: node.id,
        outcome,
        label: OUTCOME_META[outcome].label
      };
      recordHistory();
      setLayout((current) => ({
        ...current,
        positions: {
          ...current.positions,
          [node.id]: defaultPosition(currentGraph.nodes.length)
        }
      }));
      setWorkflow((current) => {
        const currentGraph = current.graph ?? { nodes: [], edges: [] };
        const nextGraph = {
          nodes: [...currentGraph.nodes, node],
          edges: [...currentGraph.edges, edge]
        };
        return { ...current, graph: nextGraph, steps: graphToSteps(nextGraph) };
      });
      setSelectedNodeId(node.id);
      setSelectedEdgeId(undefined);
    },
    [collectUsedIdentifiers, guidedContext, onToast, recordHistory, targetForAction]
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      commitGraph((current) => ({
        nodes: current.nodes.filter((node) => node.id !== nodeId),
        edges: current.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId)
      }));
      setSelectedNodeId(undefined);
      setMenu(undefined);
    },
    [commitGraph]
  );

  const duplicateNode = useCallback(
    (nodeId: string) => {
      const currentGraph = workflowRef.current.graph;
      const node = currentGraph?.nodes.find((candidate) => candidate.id === nodeId);
      if (node === undefined) {
        return;
      }
      const result = duplicateEventNode(node, currentGraph?.edges ?? []);
      const sourcePosition = layoutRef.current.positions[nodeId] ?? defaultPosition(0);
      setLayout((current) => ({
        ...current,
        positions: {
          ...current.positions,
          [result.node.id]: { x: sourcePosition.x + 48, y: sourcePosition.y + 48 }
        }
      }));
      commitGraph((current) => ({
        nodes: [...current.nodes, result.node],
        edges: [...current.edges, ...result.edges]
      }));
      setSelectedNodeId(result.node.id);
      setMenu(undefined);
    },
    [commitGraph]
  );

  const deleteEdge = useCallback(
    (edgeId: string) => {
      commitGraph((current) => ({
        ...current,
        edges: current.edges.filter((edge) => edge.id !== edgeId)
      }));
      setSelectedEdgeId(undefined);
    },
    [commitGraph]
  );

  const handleNodeAction = useCallback(
    (nodeId: string, action: WorkflowNodeAction) => {
      if (action === 'configure') {
        setSelectedNodeId(nodeId);
        setSelectedEdgeId(undefined);
      } else if (action === 'duplicate') {
        duplicateNode(nodeId);
      } else if (action === 'delete') {
        deleteNode(nodeId);
      } else if (action === 'toggle') {
        updateNode(nodeId, (node) => ({ ...node, disabled: node.disabled !== true }));
      }
    },
    [deleteNode, duplicateNode, updateNode]
  );

  const deleteSelection = useCallback(() => {
    if (selectedNodeId !== undefined) {
      deleteNode(selectedNodeId);
    } else if (selectedEdgeId !== undefined) {
      deleteEdge(selectedEdgeId);
    }
  }, [deleteEdge, deleteNode, selectedEdgeId, selectedNodeId]);

  const onConnect = useCallback(
    (connection: Connection) => {
      const source = connection.source;
      const target = connection.target;
      const outcome = connection.sourceHandle;
      if (source === null || target === null || !isOutcome(outcome)) {
        onToast('error', 'Connect an event outcome to another event node');
        return;
      }
      const currentGraph = workflowRef.current.graph;
      if (currentGraph === undefined || !canConnect(currentGraph, source, target, outcome)) {
        onToast('error', 'That outcome is already connected or the connection is invalid');
        return;
      }
      const edge: WorkflowGraphEdge = {
        id: crypto.randomUUID(),
        source,
        target,
        outcome,
        label: OUTCOME_META[outcome].label
      };
      commitGraph((current) => ({ ...current, edges: [...current.edges, edge] }));
      setSelectedEdgeId(edge.id);
      setSelectedNodeId(undefined);
    },
    [commitGraph, onToast]
  );

  const onNodesChange = useCallback<OnNodesChange<WorkflowEventFlowNode>>((changes) => {
    const positions: Record<string, WorkflowPoint> = {};
    for (const change of [...changes]) {
      if (change.type === 'position' && change.position !== undefined) {
        positions[change.id] = change.position;
      }
    }
    if (Object.keys(positions).length > 0) {
      setLayout((current) => ({
        ...current,
        positions: { ...current.positions, ...positions }
      }));
    }
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const guidedId = event.dataTransfer.getData(GUIDED_ACTION_DRAG_TYPE) as GuidedActionId;
      if (guidedId.length > 0 && Object.prototype.hasOwnProperty.call(GUIDED_ACTIONS, guidedId)) {
        addGuidedNode(guidedId, position);
        return;
      }
      const type = event.dataTransfer.getData(EVENT_NODE_DRAG_TYPE) as WorkflowEventNodeType;
      if (!['rise', 'listen', 'riseListen'].includes(type)) {
        return;
      }
      addNode(type, position);
    },
    [addGuidedNode, addNode, screenToFlowPosition]
  );

  const autoLayout = useCallback(() => {
    const currentGraph = workflowRef.current.graph;
    if (currentGraph === undefined) {
      return;
    }
    const positions = layoutWithDagre(
      currentGraph.nodes.map((node, index) => ({
        id: node.id,
        position: layoutRef.current.positions[node.id] ?? defaultPosition(index),
        width: 260,
        height: 180
      })),
      currentGraph.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target
      })),
      'LR'
    );
    recordHistory();
    setLayout((current) => ({ ...current, positions }));
    window.setTimeout(() => void fitView({ padding: 0.2, duration: 350 }), 0);
  }, [fitView, recordHistory]);

  const save = useCallback(async () => {
    if (workflow.name.trim().length === 0) {
      onToast('error', 'Give the workflow a name before saving');
      return;
    }
    const currentIssues = validateWorkflowDefinition(workflowRef.current);
    const validation = workflowIssueCounts(currentIssues);
    if (validation.errors > 0) {
      setBottomTab('validation');
      onToast(
        'error',
        `Fix ${validation.errors} workflow issue${validation.errors === 1 ? '' : 's'} before saving`
      );
      return;
    }
    const nextWorkflow: WorkflowDefinition = {
      ...workflowRef.current,
      steps: graphToSteps(workflowRef.current.graph ?? { nodes: [], edges: [] })
    };
    session.replaceDefinition(upsertWorkflow(definition, nextWorkflow));
    session.setWorkflowEvent(target.nodeId, target.eventName, nextWorkflow.id);
    saveWorkflowLayout(appId, nextWorkflow.id, layoutRef.current);
    await onSave();
    onToast('success', `Saved ${nextWorkflow.name}`);
  }, [appId, definition, onSave, onToast, session, target.eventName, target.nodeId]);

  const validateWorkflow = useCallback(() => {
    setBottomTab('validation');
    if (counts.errors > 0) {
      onToast('error', `Found ${counts.errors} workflow error${counts.errors === 1 ? '' : 's'}`);
    } else if (counts.warnings > 0) {
      onToast('info', `Workflow has ${counts.warnings} warning${counts.warnings === 1 ? '' : 's'}`);
    } else {
      onToast('success', 'Workflow configuration is complete');
    }
  }, [counts.errors, counts.warnings, onToast]);

  useEffect(() => {
    const closeMenu = () => setMenu(undefined);
    window.addEventListener('mousedown', closeMenu);
    return () => window.removeEventListener('mousedown', closeMenu);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const targetElement = event.target;
      if (
        targetElement instanceof HTMLElement &&
        (targetElement.tagName === 'INPUT' ||
          targetElement.tagName === 'TEXTAREA' ||
          targetElement.tagName === 'SELECT' ||
          targetElement.isContentEditable)
      ) {
        return;
      }
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (key === 'escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      } else if (modifier && key === 'z' && event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        redo();
      } else if (modifier && key === 'z') {
        event.preventDefault();
        event.stopPropagation();
        undo();
      } else if (modifier && key === 'y') {
        event.preventDefault();
        event.stopPropagation();
        redo();
      } else if (modifier && key === 'd' && selectedNodeId !== undefined) {
        event.preventDefault();
        event.stopPropagation();
        duplicateNode(selectedNodeId);
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        event.stopPropagation();
        deleteSelection();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [deleteSelection, duplicateNode, onClose, redo, selectedNodeId, undo]);

  const validationByNode = useMemo(() => {
    const result = new Map<string, 'valid' | 'warning' | 'error'>();
    for (const issue of issues) {
      if (issue.nodeId === undefined) {
        continue;
      }
      const severity = issue.severity === 'error' ? 'error' : 'warning';
      const current = result.get(issue.nodeId);
      if (current === undefined || severityRank(severity) > severityRank(current)) {
        result.set(issue.nodeId, severity);
      }
    }
    return result;
  }, [issues]);

  const nodes = useMemo<WorkflowEventFlowNode[]>(
    () =>
      graph.nodes.map((node, index) => ({
        id: node.id,
        type: 'workflowEvent',
        position: layout.positions[node.id] ?? defaultPosition(index),
        selected: selectedNodeId === node.id,
        data: {
          node,
          selected: selectedNodeId === node.id,
          validation: validationByNode.get(node.id) ?? 'valid',
          execution: 'idle' as WorkflowExecutionState,
          connectedOutcomes: graph.edges
            .filter((edge) => edge.source === node.id)
            .map((edge) => edge.outcome),
          onAction: handleNodeAction
        }
      })),
    [graph.edges, graph.nodes, handleNodeAction, layout.positions, selectedNodeId, validationByNode]
  );

  const edges = useMemo<Edge[]>(
    () =>
      graph.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.outcome,
        targetHandle: 'in',
        type: 'smoothstep',
        label: edge.label ?? OUTCOME_META[edge.outcome].label,
        selected: selectedEdgeId === edge.id,
        className: `workflow-edge outcome-${edge.outcome}`,
        style: { stroke: OUTCOME_COLORS[edge.outcome], strokeWidth: 2 },
        labelStyle: { fill: OUTCOME_COLORS[edge.outcome], fontWeight: 600 },
        markerEnd: { type: MarkerType.ArrowClosed, color: OUTCOME_COLORS[edge.outcome] }
      })),
    [graph.edges, selectedEdgeId]
  );

  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId);
  const selectedEdge = graph.edges.find((edge) => edge.id === selectedEdgeId);
  const canUndo = pastRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;
  void historyVersion;

  const focusNode = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(undefined);
    void fitView({ nodes: [{ id: nodeId }], padding: 0.6, duration: 350 });
  };

  return (
    <div
      className="event-workflow-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Event workflow designer"
      data-theme={theme}
    >
      <div className="event-workflow-designer">
        <header className="event-workflow-toolbar">
          <div className="event-workflow-toolbar-title">
            <Icon name="workflow" size={17} />
            <div>
              <small>Event workflow designer</small>
              <input
                aria-label="Workflow name"
                onChange={(event) =>
                  setWorkflow((current) => ({ ...current, name: event.target.value }))
                }
                value={workflow.name}
              />
            </div>
          </div>
          <div className="event-workflow-context">
            <span className="event-workflow-context-pill">
              <Icon name="box" size={12} /> {target.eventName}
            </span>
            <label className="event-workflow-enabled">
              <input
                aria-label="Workflow enabled"
                checked={workflow.enabled}
                onChange={(event) =>
                  setWorkflow((current) => ({ ...current, enabled: event.target.checked }))
                }
                type="checkbox"
              />
              Enabled
            </label>
          </div>
          <div className="event-workflow-toolbar-actions">
            <button
              aria-label="Undo"
              disabled={!canUndo}
              onClick={undo}
              title="Undo (Ctrl+Z)"
              type="button"
            >
              <Icon name="undo" size={15} />
            </button>
            <button
              aria-label="Redo"
              disabled={!canRedo}
              onClick={redo}
              title="Redo (Ctrl+Shift+Z)"
              type="button"
            >
              <Icon name="redo" size={15} />
            </button>
            <button aria-label="Auto layout" onClick={autoLayout} title="Auto layout" type="button">
              <Icon name="layout" size={15} />
            </button>
            <button
              aria-label="Fit workflow to view"
              onClick={() => void fitView({ padding: 0.2, duration: 350 })}
              title="Fit view"
              type="button"
            >
              <Icon name="maximize" size={15} />
            </button>
            <button
              aria-label="Switch to dark theme"
              onClick={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
              title={theme === 'light' ? 'Dark theme' : 'Light theme'}
              type="button"
            >
              <Icon name="palette" size={15} />
            </button>
            <button
              aria-label="Validate workflow"
              onClick={validateWorkflow}
              title="Validate workflow"
              type="button"
            >
              <Icon name="shield" size={15} />
            </button>
            <button aria-label="Close workflow designer" onClick={onClose} type="button">
              <Icon name="x" size={16} />
            </button>
            <button className="button-primary" onClick={() => void save()} type="button">
              <Icon name="save" size={14} /> Save workflow
            </button>
          </div>
        </header>

        <div className="event-workflow-body">
          <WorkflowNodeLibrary
            context={guidedContext}
            onAdd={(type) => addNode(type)}
            onAddGuided={(id) => addGuidedNode(id)}
            onApplyTemplate={applyTemplate}
          />
          <div
            className="event-workflow-canvas"
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
            }}
            onDrop={onDrop}
          >
            <ReactFlow<WorkflowEventFlowNode, Edge>
              defaultViewport={layout.viewport}
              edges={edges}
              fitView={layout.viewport === undefined}
              nodeTypes={nodeTypes}
              nodes={nodes}
              onConnect={onConnect}
              onEdgeClick={(_event, edge) => {
                setSelectedEdgeId(edge.id);
                setSelectedNodeId(undefined);
              }}
              onMoveEnd={(_event: unknown, viewport: Viewport) => {
                setLayout((current) => ({ ...current, viewport }));
              }}
              onNodeClick={(_event, node) => {
                setSelectedNodeId(node.id);
                setSelectedEdgeId(undefined);
              }}
              onNodeContextMenu={(event: ReactMouseEvent, node) => {
                event.preventDefault();
                setMenu({
                  x: event.clientX,
                  y: event.clientY,
                  nodeId: node.id,
                  label: node.data.node.label
                });
              }}
              onNodeDragStart={() => recordHistory()}
              onNodesChange={onNodesChange}
              onPaneClick={() => {
                setSelectedNodeId(undefined);
                setSelectedEdgeId(undefined);
                setMenu(undefined);
              }}
              selectionOnDrag
              multiSelectionKeyCode="Shift"
            >
              <Background />
              <Controls />
              <MiniMap
                nodeColor={(node) =>
                  node.type === 'workflowEvent'
                    ? `var(--workflow-minimap-color, #5b50e6)`
                    : '#cbd5e1'
                }
              />
            </ReactFlow>
            {graph.nodes.length === 0 ? (
              <div className="event-workflow-canvas-empty">
                <Icon name="workflow" size={20} />
                <span>Add an event node to start the workflow.</span>
              </div>
            ) : null}
            {menu !== undefined ? (
              <div
                className="event-workflow-menu"
                role="menu"
                style={{ left: menu.x, top: menu.y }}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="event-workflow-menu-title">{menu.label}</div>
                <button
                  onClick={() => handleNodeAction(menu.nodeId, 'configure')}
                  role="menuitem"
                  type="button"
                >
                  <Icon name="settings" size={13} /> Configure
                </button>
                <button
                  onClick={() => handleNodeAction(menu.nodeId, 'duplicate')}
                  role="menuitem"
                  type="button"
                >
                  <Icon name="duplicate" size={13} /> Duplicate
                </button>
                <button
                  onClick={() => handleNodeAction(menu.nodeId, 'toggle')}
                  role="menuitem"
                  type="button"
                >
                  <Icon name="eye" size={13} /> Disable / enable
                </button>
                <button
                  className="danger"
                  onClick={() => handleNodeAction(menu.nodeId, 'delete')}
                  role="menuitem"
                  type="button"
                >
                  <Icon name="trash" size={13} /> Delete
                </button>
              </div>
            ) : null}
          </div>
          <WorkflowInspector
            context={guidedContext}
            edge={selectedEdge}
            mode={mode}
            node={selectedNode}
            onClose={() => {
              setSelectedNodeId(undefined);
              setSelectedEdgeId(undefined);
            }}
            onConfigureGuided={configureGuided}
            onDeleteEdge={deleteEdge}
            onEdgeChange={(edgeId, patch) =>
              commitGraph((current) => ({
                ...current,
                edges: current.edges.map((edge) =>
                  edge.id === edgeId ? { ...edge, ...patch } : edge
                )
              }))
            }
            onModeChange={setMode}
            onNodeAction={handleNodeAction}
            onNodeChange={updateNode}
            onSuggestion={addSuggestedAction}
          />
        </div>

        <footer className="event-workflow-bottom">
          <div
            className="event-workflow-bottom-tabs"
            role="tablist"
            aria-label="Workflow diagnostics"
          >
            <button
              aria-selected={bottomTab === 'validation'}
              onClick={() => setBottomTab('validation')}
              role="tab"
              type="button"
            >
              Validation
              {counts.errors > 0 || counts.warnings > 0 ? (
                <span className="event-workflow-issue-count">
                  {counts.errors > 0 ? `${counts.errors} errors` : `${counts.warnings} warnings`}
                </span>
              ) : null}
            </button>
            <button
              aria-selected={bottomTab === 'configuration'}
              onClick={() => setBottomTab('configuration')}
              role="tab"
              type="button"
            >
              Configuration
              {guidedIssues.length > 0 ? (
                <span className="event-workflow-issue-count">{guidedIssues.length}</span>
              ) : null}
            </button>
            <button
              aria-selected={bottomTab === 'execution'}
              onClick={() => setBottomTab('execution')}
              role="tab"
              type="button"
            >
              Execution log
            </button>
          </div>
          <div className="event-workflow-bottom-content">
            {bottomTab === 'validation' ? (
              issues.length === 0 ? (
                <p className="event-workflow-clean">
                  <Icon name="circle-check" size={14} /> No validation issues. This workflow can be
                  saved.
                </p>
              ) : (
                <div className="event-workflow-issues">
                  {issues.map((issue, index) => (
                    <button
                      className={`event-workflow-issue severity-${issue.severity}`}
                      key={`${issue.code}-${index}`}
                      onClick={() => {
                        const nodeId = issue.nodeId ?? workflow.graph?.nodes[0]?.id;
                        if (nodeId !== undefined) {
                          focusNode(nodeId);
                        }
                        if (issue.edgeId !== undefined) {
                          setSelectedEdgeId(issue.edgeId);
                        }
                      }}
                      type="button"
                    >
                      <Icon name={issue.severity === 'error' ? 'x' : 'help'} size={12} />
                      <span>{friendlyIssueMessage(issue)}</span>
                      <small>{issue.code}</small>
                    </button>
                  ))}
                </div>
              )
            ) : bottomTab === 'configuration' ? (
              guidedIssues.length === 0 ? (
                <p className="event-workflow-clean">
                  <Icon name="circle-check" size={14} /> Guided configuration is complete.
                </p>
              ) : (
                <div className="event-workflow-issues">
                  {guidedIssues.map((issue, index) => (
                    <button
                      className={`event-workflow-issue severity-${issue.severity}`}
                      key={`${issue.code}-${index}`}
                      onClick={() => {
                        if (issue.nodeId !== undefined) {
                          focusNode(issue.nodeId);
                        }
                      }}
                      type="button"
                    >
                      <Icon name={issue.severity === 'error' ? 'x' : 'help'} size={12} />
                      <span>{issue.message}</span>
                      <small>{issue.code}</small>
                    </button>
                  ))}
                </div>
              )
            ) : (
              <div className="event-workflow-dependency">
                <Icon name="activity" size={16} />
                <div>
                  <strong>Execution visualization requires a backend dependency</strong>
                  <p>
                    Rise, listen, correlated response and outcome-branch execution are not
                    implemented in the NOVA runtime. This designer saves and validates definitions
                    only; no execution is simulated.
                  </p>
                </div>
              </div>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
