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
import '@xyflow/react/dist/style.css';
import type { Connection, Edge, OnNodeDrag, OnNodesChange, Viewport } from '@xyflow/react';
import type { DataMigrationPlanValue } from '@nova/sdk';
import { validateAppDefinition } from '@nova/spec-validator';
import type { ValidationResult } from '@nova/spec-validator';
import type {
  AppDefinition,
  DataFieldDefinition,
  DataFieldType,
  DataModelDefinition,
  DataReferentialAction,
  DataRelationshipCardinality,
  DataRelationshipDefinition
} from '@nova/spec';
import { applyDataMigration, getDataMigrationPlan } from '../../sdk';
import type { EditorSessionLike, Toast } from '../../types';
import { Icon } from '../Icons';
import { loadDesignerLayout, saveDesignerLayout } from './layout';
import type { DesignerGroup, DesignerLayout } from './layout';
import {
  addDataField,
  addDataModel,
  addDataRelationship,
  CARDINALITIES,
  collapsedFieldId,
  fieldIdFromHandle,
  FIELD_TYPES,
  normalizeSchemaName,
  REFERENTIAL_ACTIONS,
  removeDataField,
  removeDataModel,
  removeDataRelationship,
  sourceHandleId,
  targetHandleId,
  updateDataField,
  updateDataModel,
  updateDataRelationship
} from './model';
import type { DesignerPoint } from './model';
import { TableNode } from './TableNode';
import type { TableFlowNode } from './TableNode';
import { createClipboard, pasteClipboard } from './pro-features/clipboard';
import type { DesignerClipboard } from './pro-features/clipboard';
import { HelperLines } from './pro-features/HelperLines';
import { getHelperLines } from './pro-features/helperLinesUtils';
import { layoutWithDagre, layoutWithForce } from './pro-features/layoutAlgorithms';
import { GroupNode, groupNodeId } from './pro-features/GroupNode';
import type { GroupFlowNode } from './pro-features/GroupNode';
import { useDesignerShortcuts } from './pro-features/useDesignerShortcuts';
import { createUniqueId } from '../../id';

const nodeTypes = { dataModel: TableNode, designerGroup: GroupNode };

type DesignerFlowNode = TableFlowNode | GroupFlowNode;

interface DesignerSnapshot {
  definition: AppDefinition;
  layout: DesignerLayout;
}

type DesignerSelection =
  | { kind: 'model'; modelId: string }
  | { kind: 'field'; modelId: string; fieldId: string }
  | { kind: 'relationship'; modelId: string; relationshipId: string };

type BottomTab = 'validation' | 'migration';

interface DatabaseDesignerProps {
  appId: string;
  definition: AppDefinition;
  session: EditorSessionLike;
  onClose: () => void;
  onSave: () => Promise<void>;
  onToast: (kind: Toast['kind'], message: string) => void;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function findRelationship(
  definition: AppDefinition,
  relationshipId: string | undefined
): { model: DataModelDefinition; relationship: DataRelationshipDefinition } | undefined {
  if (relationshipId === undefined) {
    return undefined;
  }
  for (const model of definition.dataModels) {
    const relationship = (model.relationships ?? []).find((item) => item.id === relationshipId);
    if (relationship !== undefined) {
      return { model, relationship };
    }
  }
  return undefined;
}

export function DatabaseDesigner(props: DatabaseDesignerProps) {
  return (
    <ReactFlowProvider>
      <DatabaseDesignerInner {...props} />
    </ReactFlowProvider>
  );
}

function DatabaseDesignerInner({
  appId,
  definition,
  session,
  onClose,
  onSave,
  onToast
}: DatabaseDesignerProps) {
  const { fitView, screenToFlowPosition, zoomIn, zoomOut, getNodes } = useReactFlow<
    DesignerFlowNode,
    Edge
  >();
  const [selected, setSelected] = useState<DesignerSelection | undefined>(undefined);
  const [newModelName, setNewModelName] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<DataFieldType>('string');
  const [layout, setLayout] = useState<DesignerLayout>(() => loadDesignerLayout(appId));
  const [bottomTab, setBottomTab] = useState<BottomTab>('validation');
  const [migrationPlan, setMigrationPlan] = useState<DataMigrationPlanValue | undefined>(undefined);
  const [migrationError, setMigrationError] = useState<string | undefined>(undefined);
  const [confirmDestructive, setConfirmDestructive] = useState(false);
  const [migrationBusy, setMigrationBusy] = useState(false);
  const [clipboard, setClipboard] = useState<DesignerClipboard | undefined>(undefined);
  const [helperLines, setHelperLines] = useState<{
    horizontal?: number;
    vertical?: number;
  }>({});
  const [historyVersion, setHistoryVersion] = useState(0);
  const layoutRef = useRef(layout);
  const pastRef = useRef<DesignerSnapshot[]>([]);
  const futureRef = useRef<DesignerSnapshot[]>([]);
  const dragStartLayoutRef = useRef<DesignerLayout | undefined>(undefined);
  const mousePositionRef = useRef<{ x: number; y: number } | undefined>(undefined);

  const models = definition.dataModels;
  const validation = useMemo<ValidationResult>(
    () => validateAppDefinition(definition),
    [definition]
  );
  const errorCount = validation.issues.filter((issue) => issue.severity === 'error').length;
  const warningCount = validation.issues.filter((issue) => issue.severity === 'warning').length;

  useEffect(() => {
    const next = loadDesignerLayout(appId);
    layoutRef.current = next;
    pastRef.current = [];
    futureRef.current = [];
    setLayout(next);
    setSelected(undefined);
    setClipboard(undefined);
    setHelperLines({});
    setConfirmDestructive(false);
    setHistoryVersion((version) => version + 1);
  }, [appId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  const refreshMigration = useCallback(async () => {
    try {
      setMigrationPlan(await getDataMigrationPlan(appId));
      setMigrationError(undefined);
      setConfirmDestructive(false);
    } catch (error) {
      setMigrationPlan(undefined);
      setMigrationError(messageOf(error));
    }
  }, [appId]);

  useEffect(() => {
    void refreshMigration();
  }, [refreshMigration]);

  const updateLayout = useCallback((next: DesignerLayout) => {
    layoutRef.current = next;
    setLayout(next);
  }, []);

  const persistLayout = useCallback(
    (next: DesignerLayout) => {
      updateLayout(next);
      saveDesignerLayout(appId, next);
    },
    [appId, updateLayout]
  );

  const currentSnapshot = useCallback<() => DesignerSnapshot>(
    () => ({ definition: session.getDefinition(), layout: layoutRef.current }),
    [session]
  );

  const recordHistory = useCallback(
    (snapshot?: DesignerSnapshot) => {
      pastRef.current = [...pastRef.current, snapshot ?? currentSnapshot()].slice(-100);
      futureRef.current = [];
      setHistoryVersion((version) => version + 1);
    },
    [currentSnapshot]
  );

  const restoreSnapshot = useCallback(
    (snapshot: DesignerSnapshot) => {
      session.replaceDefinition(snapshot.definition);
      persistLayout(snapshot.layout);
    },
    [persistLayout, session]
  );

  const undo = useCallback(() => {
    const snapshot = pastRef.current.pop();
    if (snapshot === undefined) {
      return;
    }
    futureRef.current = [currentSnapshot(), ...futureRef.current].slice(0, 100);
    restoreSnapshot(snapshot);
    setHistoryVersion((version) => version + 1);
  }, [currentSnapshot, restoreSnapshot]);

  const redo = useCallback(() => {
    const snapshot = futureRef.current.shift();
    if (snapshot === undefined) {
      return;
    }
    pastRef.current = [...pastRef.current, currentSnapshot()].slice(-100);
    restoreSnapshot(snapshot);
    setHistoryVersion((version) => version + 1);
  }, [currentSnapshot, restoreSnapshot]);

  const selectedModelId =
    selected?.modelId ??
    (selected?.kind === 'relationship' ? selected.modelId : undefined) ??
    models[0]?.id;
  const activeModel = models.find((model) => model.id === selectedModelId) ?? models[0];
  const selectedField =
    selected?.kind === 'field'
      ? activeModel?.fields.find((field) => field.id === selected.fieldId)
      : undefined;
  const selectedRelationshipResult = findRelationship(
    definition,
    selected?.kind === 'relationship' ? selected.relationshipId : undefined
  );
  const selectedRelationship = selectedRelationshipResult?.relationship;

  const commit = (next: AppDefinition) => {
    recordHistory();
    session.replaceDefinition(next);
  };

  const onSelectField = useCallback((modelId: string, fieldId: string) => {
    setSelected({ kind: 'field', modelId, fieldId });
  }, []);

  const toggleCollapse = useCallback(
    (modelId: string) => {
      recordHistory();
      const current = layoutRef.current;
      const collapsed = current.collapsedModelIds.includes(modelId);
      persistLayout({
        ...current,
        collapsedModelIds: collapsed
          ? current.collapsedModelIds.filter((id) => id !== modelId)
          : [...current.collapsedModelIds, modelId]
      });
    },
    [persistLayout, recordHistory]
  );

  const groupNodes = useMemo<GroupFlowNode[]>(
    () =>
      layout.groups.map((group) => ({
        id: groupNodeId(group.id),
        type: 'designerGroup',
        position: group.position,
        style: { width: group.width, height: group.height },
        zIndex: 0,
        data: { name: group.name, modelCount: group.modelIds.length }
      })),
    [layout.groups]
  );

  const tableNodes = useMemo<TableFlowNode[]>(
    () =>
      models.map((model, index) => ({
        id: model.id,
        type: 'dataModel',
        position: layout.positions[model.id] ?? {
          x: 80 + (index % 3) * 320,
          y: 80 + Math.floor(index / 3) * 280
        },
        zIndex: 2,
        data: {
          model,
          selected: selected?.modelId === model.id,
          collapsed: layout.collapsedModelIds.includes(model.id),
          ...(selected?.kind === 'field' && selected.modelId === model.id
            ? { selectedFieldId: selected.fieldId }
            : {}),
          onSelectField,
          onToggleCollapse: toggleCollapse
        }
      })),
    [models, layout.positions, layout.collapsedModelIds, selected, onSelectField, toggleCollapse]
  );

  const nodes = useMemo<DesignerFlowNode[]>(
    () => [...groupNodes, ...tableNodes],
    [groupNodes, tableNodes]
  );

  const edges = useMemo<Edge[]>(() => {
    const result: Edge[] = [];
    for (const model of models) {
      for (const relationship of model.relationships ?? []) {
        const target = models.find((candidate) => candidate.id === relationship.targetModelId);
        const targetFieldId =
          relationship.targetFieldId ?? target?.fields.find((field) => field.name === 'id')?.id;
        const isSelected =
          selected?.kind === 'relationship' && selected.relationshipId === relationship.id;
        const sourceHandle = layout.collapsedModelIds.includes(relationship.sourceModelId)
          ? collapsedFieldId(relationship.sourceModelId)
          : relationship.sourceFieldId;
        const targetHandle = layout.collapsedModelIds.includes(relationship.targetModelId)
          ? collapsedFieldId(relationship.targetModelId)
          : targetFieldId;
        result.push({
          id: relationship.id,
          source: relationship.sourceModelId,
          target: relationship.targetModelId,
          sourceHandle: sourceHandleId(sourceHandle),
          ...(targetHandle === undefined ? {} : { targetHandle: targetHandleId(targetHandle) }),
          type: 'smoothstep',
          label: relationship.cardinality,
          animated: isSelected,
          style: { stroke: isSelected ? '#5b50e6' : '#9aa0b2', strokeWidth: isSelected ? 2 : 1 },
          labelStyle: { fill: isSelected ? '#4338ca' : '#4c5266', fontSize: 10 },
          markerEnd: { type: MarkerType.ArrowClosed, color: isSelected ? '#5b50e6' : '#9aa0b2' }
        });
      }
    }
    return result;
  }, [models, selected, layout.collapsedModelIds]);

  const onNodesChange = useCallback<OnNodesChange<DesignerFlowNode>>(
    (changes) => {
      const changeList = [...changes];
      const positionChanges = changeList.flatMap((change) =>
        change.type === 'position' && change.position !== undefined
          ? [
              {
                id: change.id,
                type: change.type,
                position: change.position,
                dragging: change.dragging
              }
            ]
          : []
      );
      const rfNodes = getNodes();
      const helper = getHelperLines(positionChanges, rfNodes);
      setHelperLines({ horizontal: helper.horizontal, vertical: helper.vertical });
      if (positionChanges.length === 0) {
        return;
      }
      const current = layoutRef.current;
      let positions: Record<string, DesignerPoint> | undefined;
      let groups: DesignerGroup[] | undefined;
      for (const change of positionChanges) {
        const point =
          positionChanges.length === 1 && helper.snapPosition !== undefined
            ? helper.snapPosition
            : change.position;
        if (rfNodes.find((node) => node.id === change.id)?.type === 'designerGroup') {
          groups ??= current.groups.map((group) => ({ ...group }));
          groups = groups.map((group) =>
            groupNodeId(group.id) === change.id ? { ...group, position: point } : group
          );
        } else {
          positions ??= { ...current.positions };
          positions[change.id] = point;
        }
      }
      updateLayout({
        ...current,
        ...(positions === undefined ? {} : { positions }),
        ...(groups === undefined ? {} : { groups })
      });
    },
    [getNodes, updateLayout]
  );

  const onNodeDragStart = useCallback<OnNodeDrag<DesignerFlowNode>>(() => {
    dragStartLayoutRef.current = layoutRef.current;
  }, []);

  const onNodeDragStop = useCallback<OnNodeDrag<DesignerFlowNode>>(
    (_event, node) => {
      const start = dragStartLayoutRef.current ?? layoutRef.current;
      dragStartLayoutRef.current = undefined;
      setHelperLines({});
      recordHistory({ definition: session.getDefinition(), layout: start });
      if (node.type === 'designerGroup') {
        const group = start.groups.find((item) => groupNodeId(item.id) === node.id);
        if (group === undefined) {
          persistLayout(start);
          return;
        }
        const deltaX = node.position.x - group.position.x;
        const deltaY = node.position.y - group.position.y;
        const positions = { ...start.positions };
        for (const modelId of group.modelIds) {
          const point = positions[modelId];
          if (point !== undefined) {
            positions[modelId] = { x: point.x + deltaX, y: point.y + deltaY };
          }
        }
        persistLayout({
          ...start,
          positions,
          groups: start.groups.map((item) =>
            item.id === group.id
              ? { ...item, position: { x: node.position.x, y: node.position.y } }
              : item
          )
        });
        return;
      }
      const positions = {
        ...start.positions,
        [node.id]: { x: node.position.x, y: node.position.y }
      };
      const rfNode = getNodes().find((item) => item.id === node.id);
      const width = rfNode?.measured?.width ?? rfNode?.width ?? 220;
      const height = rfNode?.measured?.height ?? rfNode?.height ?? 180;
      const centerX = node.position.x + width / 2;
      const centerY = node.position.y + height / 2;
      const containing = start.groups.find(
        (group) =>
          centerX >= group.position.x &&
          centerX <= group.position.x + group.width &&
          centerY >= group.position.y &&
          centerY <= group.position.y + group.height
      );
      const groups = start.groups.map((group) => {
        const member = group.modelIds.includes(node.id);
        if (group.id === containing?.id && !member) {
          return { ...group, modelIds: [...group.modelIds, node.id] };
        }
        if (group.id !== containing?.id && member) {
          return { ...group, modelIds: group.modelIds.filter((id) => id !== node.id) };
        }
        return group;
      });
      persistLayout({ ...start, positions, groups });
    },
    [getNodes, persistLayout, recordHistory, session]
  );

  const onMoveEnd = useCallback(
    (_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
      persistLayout({ ...layoutRef.current, viewport });
    },
    [persistLayout]
  );

  const addModel = (name: string, position?: DesignerPoint) => {
    const clean = normalizeSchemaName(name);
    if (clean.length === 0) {
      onToast('error', 'Enter a model name');
      return;
    }
    const result = addDataModel(session.getDefinition(), clean);
    const current = layoutRef.current;
    const nextPosition = position ?? {
      x: 80 + (models.length % 3) * 320,
      y: 80 + Math.floor(models.length / 3) * 280
    };
    commit(result.definition);
    persistLayout({
      ...current,
      positions: { ...current.positions, [result.model.id]: nextPosition }
    });
    setNewModelName('');
    setSelected({ kind: 'model', modelId: result.model.id });
    onToast('success', `Data model “${clean}” added`);
  };

  const removeModel = () => {
    if (activeModel === undefined || !window.confirm(`Delete data model “${activeModel.name}”?`)) {
      return;
    }
    commit(removeDataModel(session.getDefinition(), activeModel.id));
    const current = layoutRef.current;
    const positions = { ...current.positions };
    delete positions[activeModel.id];
    persistLayout({
      ...current,
      positions,
      collapsedModelIds: current.collapsedModelIds.filter((id) => id !== activeModel.id),
      groups: current.groups.map((group) => ({
        ...group,
        modelIds: group.modelIds.filter((id) => id !== activeModel.id)
      }))
    });
    setSelected(undefined);
    onToast('info', 'Data model removed');
  };

  const addField = () => {
    const name = normalizeSchemaName(newFieldName);
    if (activeModel === undefined || name.length === 0) {
      onToast('error', 'Enter a field name');
      return;
    }
    const result = addDataField(session.getDefinition(), activeModel.id, name, newFieldType);
    commit(result.definition);
    setNewFieldName('');
    setSelected({ kind: 'field', modelId: activeModel.id, fieldId: result.field.id });
    onToast('success', `Field “${name}” added`);
  };

  const updateField = (fieldId: string, patch: Partial<DataFieldDefinition>) => {
    if (activeModel === undefined) {
      return;
    }
    commit(updateDataField(session.getDefinition(), activeModel.id, fieldId, patch));
  };

  const removeField = () => {
    if (activeModel === undefined || selectedField === undefined) {
      return;
    }
    if (selectedField.system === true) {
      onToast('error', 'System fields cannot be deleted');
      return;
    }
    commit(removeDataField(session.getDefinition(), activeModel.id, selectedField.id));
    setSelected({ kind: 'model', modelId: activeModel.id });
    onToast('info', 'Field removed');
  };

  const onConnect = (connection: Connection) => {
    if (
      connection.source === null ||
      connection.source === undefined ||
      connection.target === null ||
      connection.target === undefined
    ) {
      return;
    }
    const sourceFieldId = fieldIdFromHandle(connection.sourceHandle);
    const targetFieldId = fieldIdFromHandle(connection.targetHandle);
    if (sourceFieldId === undefined || targetFieldId === undefined) {
      onToast('error', 'Connect two field handles to create a relationship');
      return;
    }
    const sourceModel = models.find((model) => model.id === connection.source);
    const sourceField = sourceModel?.fields.find((field) => field.id === sourceFieldId);
    if (sourceModel === undefined || sourceField === undefined) {
      onToast('error', 'Select a valid source field');
      return;
    }
    let current = session.getDefinition();
    if (sourceField.type !== 'reference') {
      current = updateDataField(current, sourceModel.id, sourceField.id, { type: 'reference' });
    }
    try {
      const result = addDataRelationship(current, {
        sourceModelId: sourceModel.id,
        sourceFieldId,
        targetModelId: connection.target,
        targetFieldId
      });
      commit(result.definition);
      setSelected({
        kind: 'relationship',
        modelId: sourceModel.id,
        relationshipId: result.relationship.id
      });
      onToast('success', 'Relationship created');
    } catch (error) {
      onToast('error', messageOf(error));
    }
  };

  const updateRelationship = (patch: Partial<DataRelationshipDefinition>) => {
    if (selectedRelationshipResult === undefined) {
      return;
    }
    commit(
      updateDataRelationship(
        session.getDefinition(),
        selectedRelationshipResult.model.id,
        selectedRelationshipResult.relationship.id,
        patch
      )
    );
  };

  const removeRelationship = () => {
    if (selectedRelationshipResult === undefined) {
      return;
    }
    commit(
      removeDataRelationship(
        session.getDefinition(),
        selectedRelationshipResult.model.id,
        selectedRelationshipResult.relationship.id
      )
    );
    setSelected({ kind: 'model', modelId: selectedRelationshipResult.model.id });
    onToast('info', 'Relationship removed');
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const name =
      event.dataTransfer.getData('application/nova-model') ||
      event.dataTransfer.getData('text/plain');
    if (name.trim().length === 0) {
      return;
    }
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    addModel(name, position);
  };

  const copySelection = () => {
    if (activeModel === undefined) {
      onToast('error', 'Select a table to copy');
      return;
    }
    const next = createClipboard(
      session.getDefinition(),
      [activeModel.id],
      layoutRef.current.positions
    );
    if (next === undefined) {
      onToast('error', 'Select a table to copy');
      return;
    }
    setClipboard(next);
    onToast('success', `Copied “${activeModel.name}”`);
  };

  const cutSelection = () => {
    if (activeModel === undefined) {
      onToast('error', 'Select a table to cut');
      return;
    }
    copySelection();
    removeModel();
  };

  const pasteAt = (point?: DesignerPoint) => {
    if (clipboard === undefined) {
      onToast('error', 'Copy a table first');
      return;
    }
    const current = layoutRef.current;
    const activePosition =
      activeModel === undefined ? undefined : current.positions[activeModel.id];
    const origin =
      point ??
      mousePositionRef.current ??
      (activePosition === undefined
        ? { x: 120, y: 120 }
        : { x: activePosition.x + 48, y: activePosition.y + 48 });
    const result = pasteClipboard(session.getDefinition(), clipboard, origin, current.positions);
    const firstModelId = result.modelIds[0];
    if (firstModelId === undefined) {
      onToast('error', 'Nothing to paste');
      return;
    }
    recordHistory();
    session.replaceDefinition(result.definition);
    persistLayout({ ...current, positions: result.positions });
    setSelected({ kind: 'model', modelId: firstModelId });
    onToast(
      'success',
      `Pasted ${result.modelIds.length} table${result.modelIds.length === 1 ? '' : 's'}`
    );
  };

  const deleteSelection = () => {
    if (selected === undefined) {
      return;
    }
    if (selected.kind === 'relationship') {
      removeRelationship();
    } else if (selected.kind === 'field') {
      removeField();
    } else {
      removeModel();
    }
  };

  const createGroup = () => {
    if (activeModel === undefined) {
      onToast('error', 'Select a table to group');
      return;
    }
    const current = layoutRef.current;
    const position = current.positions[activeModel.id] ??
      getNodes().find((node) => node.id === activeModel.id)?.position ?? { x: 80, y: 80 };
    const name = newGroupName.trim() || `Group ${current.groups.length + 1}`;
    const group: DesignerGroup = {
      id: createUniqueId('group'),
      name,
      position: { x: position.x - 40, y: position.y - 60 },
      width: 360,
      height: 280,
      modelIds: [activeModel.id]
    };
    recordHistory();
    persistLayout({
      ...current,
      positions: { ...current.positions, [activeModel.id]: position },
      groups: [...current.groups, group]
    });
    setNewGroupName('');
    onToast('success', `Group “${name}” created`);
  };

  const ungroup = (groupId: string) => {
    const current = layoutRef.current;
    const group = current.groups.find((item) => item.id === groupId);
    if (group === undefined) {
      return;
    }
    recordHistory();
    persistLayout({ ...current, groups: current.groups.filter((item) => item.id !== groupId) });
    onToast('info', `Group “${group.name}” removed`);
  };

  const applyLayout = (algorithm: 'dagre' | 'force') => {
    const current = layoutRef.current;
    const rfNodes = getNodes();
    const inputNodes = models.map((model, index) => {
      const rfNode = rfNodes.find((item) => item.id === model.id);
      return {
        id: model.id,
        position: current.positions[model.id] ?? {
          x: 80 + (index % 3) * 320,
          y: 80 + Math.floor(index / 3) * 280
        },
        width: rfNode?.measured?.width ?? rfNode?.width ?? 220,
        height: rfNode?.measured?.height ?? rfNode?.height ?? 180
      };
    });
    const inputEdges = edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target
    }));
    const positions =
      algorithm === 'dagre'
        ? layoutWithDagre(inputNodes, inputEdges, current.layoutDirection ?? 'LR')
        : layoutWithForce(inputNodes, inputEdges);
    recordHistory();
    persistLayout({ ...current, positions });
    window.setTimeout(() => void fitView({ padding: 0.2 }), 0);
  };

  const applyAutoLayout = () => applyLayout('dagre');

  const onCanvasMouseMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    mousePositionRef.current = screenToFlowPosition({ x: event.clientX, y: event.clientY });
  };

  useDesignerShortcuts({
    onCopy: copySelection,
    onCut: cutSelection,
    onPaste: () => pasteAt(),
    onDelete: deleteSelection,
    onUndo: undo,
    onRedo: redo
  });

  const save = async () => {
    await onSave();
    await refreshMigration();
    onToast('success', 'Saved');
  };

  const applyMigration = async () => {
    if (migrationPlan === undefined) {
      onToast('error', 'Migration plan is unavailable');
      return;
    }
    if (migrationPlan.operations.length === 0) {
      onToast('info', 'Schema is up to date');
      return;
    }
    if (migrationPlan.destructive && !confirmDestructive) {
      setBottomTab('migration');
      onToast('error', 'Confirm the destructive migration before applying it');
      return;
    }
    setMigrationBusy(true);
    try {
      await applyDataMigration(appId, migrationPlan.destructive);
      await refreshMigration();
      onToast('success', 'Data schema migration applied');
    } catch (error) {
      onToast('error', messageOf(error));
    } finally {
      setMigrationBusy(false);
    }
  };

  const canUndo = useMemo(() => pastRef.current.length > 0, [historyVersion]);
  const canRedo = useMemo(() => futureRef.current.length > 0, [historyVersion]);
  const fieldCount = models.reduce((total, model) => total + model.fields.length, 0);
  const relationshipCount = models.reduce(
    (total, model) => total + (model.relationships?.length ?? 0),
    0
  );

  return (
    <div
      aria-label="Database designer"
      aria-modal="true"
      className="designer-overlay"
      role="dialog"
    >
      <div className="designer-shell">
        <header className="designer-toolbar">
          <div className="designer-heading">
            <strong>
              <Icon name="database" size={15} /> Database designer
            </strong>
            <span>
              {models.length} tables · {fieldCount} fields · {relationshipCount} relations
            </span>
          </div>
          <div className="designer-toolbar-actions">
            <button type="button" onClick={() => void save()}>
              <Icon name="save" size={13} /> Save
            </button>
            <button type="button" disabled={!canUndo} onClick={undo}>
              <Icon name="undo" size={13} /> Undo
            </button>
            <button type="button" disabled={!canRedo} onClick={redo}>
              <Icon name="redo" size={13} /> Redo
            </button>
            <button type="button" onClick={copySelection}>
              <Icon name="copy" size={13} /> Copy table
            </button>
            <button type="button" onClick={cutSelection}>
              <Icon name="cut" size={13} /> Cut table
            </button>
            <button type="button" onClick={() => pasteAt()}>
              <Icon name="paste" size={13} /> Paste here
            </button>
            <button
              type="button"
              onClick={() => {
                setBottomTab('validation');
                onToast(
                  errorCount === 0 ? 'success' : 'error',
                  errorCount === 0
                    ? 'Schema validation passed'
                    : `Schema has ${errorCount} validation error${errorCount === 1 ? '' : 's'}`
                );
              }}
            >
              <Icon name="shield" size={13} /> Validate
            </button>
            <button
              type="button"
              onClick={() => {
                setBottomTab('migration');
                void refreshMigration();
              }}
            >
              <Icon name="activity" size={13} /> Preview migration
            </button>
            <button type="button" disabled={migrationBusy} onClick={() => void applyMigration()}>
              <Icon name="rocket" size={13} /> Apply migration
            </button>
            <span className="designer-toolbar-divider" />
            <button type="button" aria-label="Zoom in" onClick={() => void zoomIn()}>
              <Icon name="zoom-in" size={13} />
            </button>
            <button type="button" aria-label="Zoom out" onClick={() => void zoomOut()}>
              <Icon name="zoom-out" size={13} />
            </button>
            <button type="button" onClick={() => void fitView({ padding: 0.2 })}>
              <Icon name="maximize" size={13} /> Fit view
            </button>
            <select
              aria-label="Layout direction"
              onChange={(event) => {
                const layoutDirection = event.target.value as 'LR' | 'TB';
                persistLayout({ ...layoutRef.current, layoutDirection });
              }}
              value={layout.layoutDirection ?? 'LR'}
            >
              <option value="LR">Left to right</option>
              <option value="TB">Top to bottom</option>
            </select>
            <button type="button" onClick={applyAutoLayout}>
              <Icon name="layout" size={13} /> Auto layout
            </button>
            <button type="button" onClick={() => applyLayout('dagre')}>
              <Icon name="workflow" size={13} /> Dagre layout
            </button>
            <button type="button" onClick={() => applyLayout('force')}>
              <Icon name="activity" size={13} /> Force layout
            </button>
            <button type="button" onClick={onClose}>
              <Icon name="x" size={13} /> Close designer
            </button>
          </div>
        </header>

        <div className="designer-body">
          <aside aria-label="Database designer tools" className="designer-left">
            <section className="designer-section">
              <h3>
                <Icon name="table" size={13} /> Tables
              </h3>
              <div className="designer-create-row">
                <input
                  aria-label="New data model name"
                  onChange={(event) => setNewModelName(event.target.value)}
                  placeholder="New table"
                  value={newModelName}
                />
                <button type="button" onClick={() => addModel(newModelName)}>
                  <Icon name="plus" size={12} /> Add model
                </button>
              </div>
              <div
                className="designer-drag-table"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData(
                    'application/nova-model',
                    normalizeSchemaName(newModelName) || 'New model'
                  );
                  event.dataTransfer.effectAllowed = 'copy';
                }}
              >
                <Icon name="move" size={12} /> Drag table to canvas
              </div>
              <div className="designer-model-list">
                {models.map((model) => (
                  <button
                    className={selected?.modelId === model.id ? 'active' : ''}
                    key={model.id}
                    onClick={() => setSelected({ kind: 'model', modelId: model.id })}
                    type="button"
                  >
                    <span className="designer-model-label">
                      <Icon name="table" size={12} /> {model.name}
                    </span>
                    <span>{model.fields.length} fields</span>
                  </button>
                ))}
              </div>
            </section>
            <section className="designer-section">
              <h3>
                <Icon name="layers" size={13} /> Groups
              </h3>
              <div className="designer-create-row">
                <input
                  aria-label="New group name"
                  onChange={(event) => setNewGroupName(event.target.value)}
                  placeholder="New group"
                  value={newGroupName}
                />
                <button type="button" onClick={createGroup}>
                  <Icon name="layers" size={12} /> Group selected table
                </button>
              </div>
              <div className="designer-group-list">
                {layout.groups.length === 0 ? (
                  <p className="designer-help">Group controls appear here.</p>
                ) : (
                  layout.groups.map((group) => (
                    <div className="designer-group-row" key={group.id}>
                      <span>{group.name}</span>
                      <span>{group.modelIds.length} tables</span>
                      <button
                        aria-label={`Ungroup ${group.name}`}
                        onClick={() => ungroup(group.id)}
                        type="button"
                      >
                        <Icon name="layers" size={12} /> Ungroup
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>
            <section className="designer-section">
              <h3>
                <Icon name="list" size={13} /> Field types
              </h3>
              <div className="designer-field-palette">
                {FIELD_TYPES.map((type) => (
                  <button
                    className={newFieldType === type ? 'active' : ''}
                    key={type}
                    onClick={() => setNewFieldType(type)}
                    type="button"
                  >
                    {type}
                  </button>
                ))}
              </div>
            </section>
            <section className="designer-section">
              <h3>
                <Icon name="link" size={13} /> Relationships
              </h3>
              <p className="designer-help">
                Drag from a source field handle to a target field handle. Field types are promoted
                to <code>reference</code> automatically.
              </p>
              <div className="designer-relation-list">
                {models.flatMap((model) =>
                  (model.relationships ?? []).map((relationship) => (
                    <button
                      className={
                        selected?.kind === 'relationship' &&
                        selected.relationshipId === relationship.id
                          ? 'active'
                          : ''
                      }
                      key={relationship.id}
                      onClick={() =>
                        setSelected({
                          kind: 'relationship',
                          modelId: model.id,
                          relationshipId: relationship.id
                        })
                      }
                      type="button"
                    >
                      <span>{relationship.name}</span>
                      <span>{relationship.cardinality}</span>
                    </button>
                  ))
                )}
              </div>
            </section>
          </aside>

          <div
            className="designer-canvas"
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
            }}
            onDragLeave={() => {
              mousePositionRef.current = undefined;
            }}
            onDrop={onDrop}
            onMouseMove={onCanvasMouseMove}
          >
            <ReactFlow<DesignerFlowNode, Edge>
              defaultViewport={layout.viewport}
              edges={edges}
              fitView={layout.viewport === undefined}
              nodeTypes={nodeTypes}
              nodes={nodes}
              onConnect={onConnect}
              onEdgeClick={(_event, edge) => {
                const found = findRelationship(definition, edge.id);
                if (found !== undefined) {
                  setSelected({
                    kind: 'relationship',
                    modelId: found.model.id,
                    relationshipId: found.relationship.id
                  });
                }
              }}
              onMoveEnd={onMoveEnd}
              onNodeClick={(_event, node) => {
                if (node.type === 'designerGroup') {
                  return;
                }
                setSelected({ kind: 'model', modelId: node.id });
              }}
              onNodeDragStart={onNodeDragStart}
              onNodeDragStop={onNodeDragStop}
              onNodesChange={onNodesChange}
              onPaneClick={() => {
                setSelected(undefined);
                setHelperLines({});
              }}
            >
              <HelperLines {...helperLines} />
              <Background />
              <Controls />
              <MiniMap
                nodeColor={(node) => (node.type === 'designerGroup' ? '#e0e7ff' : '#5b50e6')}
              />
            </ReactFlow>
            {models.length === 0 ? (
              <div className="designer-canvas-empty">
                <Icon name="database" size={18} />
                <span>
                  Add a table or drag one onto the canvas to start designing the data model.
                </span>
              </div>
            ) : null}
          </div>

          <aside aria-label="Database designer properties" className="designer-right">
            <h3>
              <Icon name="sliders" size={13} /> Properties
            </h3>
            {activeModel === undefined ? (
              <p className="designer-help">Select a table to edit its properties.</p>
            ) : selectedRelationship !== undefined ? (
              <div className="designer-properties">
                <label>
                  Name
                  <input
                    aria-label="Relationship name"
                    onChange={(event) => updateRelationship({ name: event.target.value })}
                    value={selectedRelationship.name}
                  />
                </label>
                <label>
                  Cardinality
                  <select
                    aria-label="Relationship cardinality"
                    onChange={(event) => {
                      const cardinality = event.target.value as DataRelationshipCardinality;
                      updateRelationship({
                        cardinality,
                        ...(cardinality === 'many-to-many' ? {} : { junctionModelId: undefined })
                      });
                    }}
                    value={selectedRelationship.cardinality}
                  >
                    {CARDINALITIES.map((cardinality) => (
                      <option key={cardinality} value={cardinality}>
                        {cardinality}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  On delete
                  <select
                    aria-label="Relationship delete behavior"
                    onChange={(event) =>
                      updateRelationship({ onDelete: event.target.value as DataReferentialAction })
                    }
                    value={selectedRelationship.onDelete}
                  >
                    {REFERENTIAL_ACTIONS.map((action) => (
                      <option key={action} value={action}>
                        {action}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  On update
                  <select
                    aria-label="Relationship update behavior"
                    onChange={(event) =>
                      updateRelationship({ onUpdate: event.target.value as DataReferentialAction })
                    }
                    value={selectedRelationship.onUpdate}
                  >
                    {REFERENTIAL_ACTIONS.map((action) => (
                      <option key={action} value={action}>
                        {action}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedRelationship.cardinality === 'many-to-many' ? (
                  <label>
                    Junction model
                    <select
                      aria-label="Junction model"
                      onChange={(event) =>
                        updateRelationship({ junctionModelId: event.target.value || undefined })
                      }
                      value={selectedRelationship.junctionModelId ?? ''}
                    >
                      <option value="">Select junction model…</option>
                      {models
                        .filter(
                          (model) =>
                            model.id !== selectedRelationship.sourceModelId &&
                            model.id !== selectedRelationship.targetModelId
                        )
                        .map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.name}
                          </option>
                        ))}
                    </select>
                  </label>
                ) : null}
                <button className="designer-danger" onClick={removeRelationship} type="button">
                  <Icon name="trash" size={12} /> Delete relationship
                </button>
              </div>
            ) : (
              <div className="designer-properties">
                {selectedField === undefined ? (
                  <>
                    <label>
                      Table name
                      <input
                        aria-label="Table name"
                        onChange={(event) => {
                          const name = normalizeSchemaName(event.target.value);
                          if (name.length > 0) {
                            commit(
                              updateDataModel(session.getDefinition(), activeModel.id, (model) => ({
                                ...model,
                                name
                              }))
                            );
                          }
                        }}
                        value={activeModel.name}
                      />
                    </label>
                    <label>
                      Display name
                      <input
                        aria-label="Table display name"
                        onChange={(event) =>
                          commit(
                            updateDataModel(session.getDefinition(), activeModel.id, (model) => ({
                              ...model,
                              ...(event.target.value.length === 0
                                ? { displayName: undefined }
                                : { displayName: event.target.value })
                            }))
                          )
                        }
                        value={activeModel.displayName ?? ''}
                      />
                    </label>
                    <label>
                      Description
                      <textarea
                        aria-label="Table description"
                        onChange={(event) =>
                          commit(
                            updateDataModel(session.getDefinition(), activeModel.id, (model) => ({
                              ...model,
                              ...(event.target.value.length === 0
                                ? { description: undefined }
                                : { description: event.target.value })
                            }))
                          )
                        }
                        value={activeModel.description ?? ''}
                      />
                    </label>
                    <button className="designer-danger" onClick={removeModel} type="button">
                      <Icon name="trash" size={12} /> Delete table
                    </button>
                  </>
                ) : (
                  <>
                    <div className="designer-property-title">Field: {selectedField.name}</div>
                    <label>
                      Name
                      <input
                        aria-label="Field name"
                        disabled={selectedField.system === true}
                        onChange={(event) =>
                          updateField(selectedField.id, {
                            name: normalizeSchemaName(event.target.value)
                          })
                        }
                        value={selectedField.name}
                      />
                    </label>
                    <label>
                      Type
                      <select
                        aria-label="Field type"
                        onChange={(event) =>
                          updateField(selectedField.id, {
                            type: event.target.value as DataFieldType
                          })
                        }
                        value={selectedField.type}
                      >
                        {FIELD_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="designer-check">
                      <input
                        checked={selectedField.required}
                        onChange={(event) =>
                          updateField(selectedField.id, { required: event.target.checked })
                        }
                        type="checkbox"
                      />
                      Required
                    </label>
                    <label className="designer-check">
                      <input
                        checked={selectedField.unique}
                        onChange={(event) =>
                          updateField(selectedField.id, { unique: event.target.checked })
                        }
                        type="checkbox"
                      />
                      Unique
                    </label>
                    <label className="designer-check">
                      <input
                        checked={selectedField.indexed === true}
                        onChange={(event) =>
                          updateField(selectedField.id, { indexed: event.target.checked })
                        }
                        type="checkbox"
                      />
                      Indexed
                    </label>
                    <label>
                      Description
                      <textarea
                        aria-label="Field description"
                        onChange={(event) =>
                          updateField(selectedField.id, {
                            description:
                              event.target.value.length === 0 ? undefined : event.target.value
                          })
                        }
                        value={selectedField.description ?? ''}
                      />
                    </label>
                    {selectedField.type === 'enum' ? (
                      <label>
                        Enum values
                        <textarea
                          aria-label="Enum values"
                          onChange={(event) =>
                            updateField(selectedField.id, {
                              enumValues: event.target.value
                                .split('\n')
                                .map((value) => value.trim())
                                .filter((value) => value.length > 0)
                            })
                          }
                          value={(selectedField.enumValues ?? []).join('\n')}
                        />
                      </label>
                    ) : null}
                    <button className="designer-danger" onClick={removeField} type="button">
                      <Icon name="trash" size={12} /> Delete field
                    </button>
                  </>
                )}
                <div className="designer-add-field">
                  <h4>Add field</h4>
                  <input
                    aria-label="New field name"
                    onChange={(event) => setNewFieldName(event.target.value)}
                    placeholder="Field name"
                    value={newFieldName}
                  />
                  <select
                    aria-label="New field type"
                    onChange={(event) => setNewFieldType(event.target.value as DataFieldType)}
                    value={newFieldType}
                  >
                    {FIELD_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                  <button onClick={addField} type="button">
                    <Icon name="plus" size={12} /> Add field
                  </button>
                </div>
              </div>
            )}
          </aside>
        </div>

        <footer className="designer-status">
          <div className="designer-status-tabs">
            <button
              className={bottomTab === 'validation' ? 'active' : ''}
              onClick={() => setBottomTab('validation')}
              type="button"
            >
              <Icon name="shield" size={12} /> Validation ({errorCount} errors, {warningCount}{' '}
              warnings)
            </button>
            <button
              className={bottomTab === 'migration' ? 'active' : ''}
              onClick={() => {
                setBottomTab('migration');
                void refreshMigration();
              }}
              type="button"
            >
              <Icon name="rocket" size={12} /> Migration preview
            </button>
          </div>
          <div className="designer-status-body">
            {bottomTab === 'validation' ? (
              validation.issues.length === 0 ? (
                <div className="designer-status-ok">No validation issues.</div>
              ) : (
                <ul className="designer-issue-list">
                  {validation.issues.map((issue, index) => (
                    <li className={issue.severity} key={`${issue.code}-${issue.path}-${index}`}>
                      <span>{issue.severity}</span>
                      <code>{issue.path}</code>
                      <span>{issue.message}</span>
                    </li>
                  ))}
                </ul>
              )
            ) : migrationPlan === undefined ? (
              <div className="designer-status-error">
                {migrationError ?? 'No migration preview.'}
              </div>
            ) : (
              <div className="designer-migration-preview">
                <div className="designer-migration-summary">
                  {migrationPlan.fromVersion} → {migrationPlan.toVersion} ·{' '}
                  {migrationPlan.operations.length} operations ·{' '}
                  {migrationPlan.destructive ? 'destructive' : 'non-destructive'}
                </div>
                {migrationPlan.operations.length === 0 ? (
                  <div className="designer-status-ok">Schema is up to date.</div>
                ) : (
                  <ul className="designer-issue-list">
                    {migrationPlan.operations.map((operation, index) => (
                      <li key={`${operation.type}-${operation.modelId}-${index}`}>
                        <span>{operation.type}</span>
                        <code>
                          {operation.modelName}
                          {operation.fieldName === undefined ? '' : `.${operation.fieldName}`}
                        </code>
                        <span>{operation.destructive ? 'destructive' : 'safe'}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {migrationPlan.destructive && migrationPlan.operations.length > 0 ? (
                  <label className="designer-check">
                    <input
                      checked={confirmDestructive}
                      onChange={(event) => setConfirmDestructive(event.target.checked)}
                      type="checkbox"
                    />
                    I understand this migration is destructive
                  </label>
                ) : null}
              </div>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
