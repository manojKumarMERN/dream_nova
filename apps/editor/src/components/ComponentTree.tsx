import { useRef, useState } from 'react';
import type { DragEvent, MouseEvent } from 'react';
import type { ComponentNode } from '@nova/spec';
import { findContract } from '../contracts';
import { displayName, isHidden, isLocked, locateNode } from '../tree';
import type { DropTarget, EditorState, InspectorContract } from '../types';
import { Icon } from './Icons';
import type { IconName } from './Icons';

interface ComponentTreeProps {
  state: EditorState;
  contracts: readonly InspectorContract[];
  onSelect: (id: string, additive: boolean) => void;
  onMove: (id: string, target: DropTarget) => void;
  onMoveMany: (ids: readonly string[], target: DropTarget) => void;
  onDropComponent: (type: string, target: DropTarget) => void;
  onRename: (id: string, name: string) => void;
  onToggleHidden: (id: string) => void;
  onToggleLock: (id: string) => void;
  onContextMenu: (id: string, x: number, y: number) => void;
}

type Placement = 'before' | 'inside' | 'after';

function draggedNodes(event: DragEvent): string[] {
  const raw = event.dataTransfer.getData('application/x-nova-nodes');
  if (raw.length === 0) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : [];
  } catch {
    return [];
  }
}

interface RowProps extends ComponentTreeProps {
  node: ComponentNode;
  depth: number;
  expanded: Record<string, boolean>;
  toggleExpanded: (id: string) => void;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  draft: string;
  setDraft: (value: string) => void;
  dropHint: string | null;
  setDropHint: (value: string | null) => void;
  placement: (event: DragEvent<HTMLDivElement>, node: ComponentNode) => Placement;
  targetFor: (node: ComponentNode, placement: Placement) => DropTarget;
}

function TreeRow(props: RowProps) {
  const {
    node,
    depth,
    state,
    contracts,
    expanded,
    toggleExpanded,
    editingId,
    setEditingId,
    draft,
    setDraft,
    dropHint,
    setDropHint,
    placement,
    targetFor,
    onSelect,
    onMove,
    onMoveMany,
    onDropComponent,
    onRename,
    onToggleHidden,
    onToggleLock,
    onContextMenu
  } = props;
  const contract = findContract(contracts, node.type);
  const children = node.children ?? [];
  const slots = Object.entries(node.slots ?? {}).flatMap(([slot, nodes]) =>
    nodes.map((child) => ({ child, slot }))
  );
  const nested = [...children.map((child) => ({ child, slot: 'children' })), ...slots];
  const isOpen = expanded[node.id] !== false;
  const selected = state.selectedNodeIds.includes(node.id);
  const hidden = isHidden(node);
  const locked = isLocked(state.definition, node);
  const placementRef = useRef<Placement>('inside');
  const hint = dropHint === node.id ? placementRef.current : null;

  const commitRename = () => {
    if (draft.trim().length > 0) {
      onRename(node.id, draft.trim());
    }
    setEditingId(null);
  };

  return (
    <>
      <div
        className={`tree-row${selected ? ' selected' : ''}${hidden ? ' hidden-node' : ''}${
          hint ? ` drop-${hint}` : ''
        }`}
        style={{ paddingLeft: 8 + depth * 14 }}
        data-testid={`tree-node-${node.id}`}
        draggable={editingId !== node.id}
        onDragStart={(event) => {
          const ids = state.selectedNodeIds.includes(node.id) ? state.selectedNodeIds : [node.id];
          event.dataTransfer.setData('application/x-nova-nodes', JSON.stringify(ids));
          event.dataTransfer.setData('application/x-nova-node', node.id);
          event.dataTransfer.setData('text/plain', node.id);
          event.dataTransfer.effectAllowed = 'move';
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          placementRef.current = placement(event, node);
          setDropHint(node.id);
        }}
        onDragLeave={() => setDropHint(null)}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const target = targetFor(node, placementRef.current);
          const ids = draggedNodes(event);
          const movedId = event.dataTransfer.getData('application/x-nova-node');
          const componentType = event.dataTransfer.getData('application/x-nova-component');
          if (ids.length > 1) {
            onMoveMany(ids, target);
          } else if (movedId && movedId !== node.id) {
            onMove(movedId, target);
          } else if (componentType) {
            onDropComponent(componentType, target);
          }
          setDropHint(null);
        }}
        onClick={(event) => onSelect(node.id, event.metaKey || event.ctrlKey)}
        onDoubleClick={() => {
          setEditingId(node.id);
          setDraft(displayName(node, contract?.displayName ?? node.type));
        }}
        onContextMenu={(event: MouseEvent<HTMLDivElement>) => {
          event.preventDefault();
          event.stopPropagation();
          onContextMenu(node.id, event.clientX, event.clientY);
        }}
      >
        <button
          type="button"
          className={`tree-caret${nested.length === 0 ? ' placeholder' : ''}`}
          aria-label={isOpen ? 'Collapse node' : 'Expand node'}
          onClick={(event) => {
            event.stopPropagation();
            toggleExpanded(node.id);
          }}
        >
          <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} size={12} />
        </button>
        <span className="tree-icon">
          <Icon name={(contract?.icon as unknown as IconName) ?? 'box'} size={13} />
        </span>
        {editingId === node.id ? (
          <input
            className="tree-rename"
            aria-label="Rename component"
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                commitRename();
              }
              if (event.key === 'Escape') {
                setEditingId(null);
              }
            }}
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          <span className="tree-name">{displayName(node, contract?.displayName ?? node.type)}</span>
        )}
        <span className="tree-type">{node.type}</span>
        <span className="tree-actions">
          <button
            type="button"
            aria-label={hidden ? 'Show component' : 'Hide component'}
            onClick={(event) => {
              event.stopPropagation();
              onToggleHidden(node.id);
            }}
          >
            <Icon name={hidden ? 'eye-off' : 'eye'} size={13} />
          </button>
          <button
            type="button"
            aria-label={locked ? 'Unlock component' : 'Lock component'}
            onClick={(event) => {
              event.stopPropagation();
              onToggleLock(node.id);
            }}
          >
            <Icon name={locked ? 'lock' : 'unlock'} size={13} />
          </button>
        </span>
      </div>
      {isOpen
        ? nested.map(({ child, slot }) => (
            <TreeRow key={`${slot}-${child.id}`} {...props} node={child} depth={depth + 1} />
          ))
        : null}
    </>
  );
}

export function ComponentTree(props: ComponentTreeProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [dropHint, setDropHint] = useState<string | null>(null);

  const placement = (event: DragEvent<HTMLDivElement>, node: ComponentNode): Placement => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientY - rect.top) / Math.max(rect.height, 1);
    const contract = findContract(props.contracts, node.type);
    const nestable =
      Object.keys(contract?.slots ?? {}).length > 0 || (node.children?.length ?? 0) > 0;
    if (ratio < 0.25) {
      return 'before';
    }
    if (ratio > 0.75 || !nestable) {
      return 'after';
    }
    return 'inside';
  };

  const targetFor = (node: ComponentNode, position: Placement): DropTarget => {
    const location = locateNode(props.state.definition, node.id);
    if (position === 'inside') {
      const contract = findContract(props.contracts, node.type);
      const slot = Object.keys(contract?.slots ?? {})[0] ?? 'children';
      const container = slot === 'children' ? (node.children ?? []) : (node.slots?.[slot] ?? []);
      return { parentId: node.id, slot, index: container.length };
    }
    if (!location) {
      return { parentId: null, slot: 'root', index: 0 };
    }
    return {
      parentId: location.parent?.id ?? null,
      slot: location.parent ? location.slot : 'root',
      index: position === 'before' ? location.index : location.index + 1
    };
  };

  return (
    <section className="panel-section tree-panel" aria-label="Component tree">
      <header className="panel-header">
        <span>Layers</span>
        <span className="panel-count">{props.state.definition.components.length}</span>
      </header>
      <div
        className="tree-list"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          const componentType = event.dataTransfer.getData('application/x-nova-component');
          const ids = draggedNodes(event);
          const movedId = event.dataTransfer.getData('application/x-nova-node');
          const target: DropTarget = {
            parentId: null,
            slot: 'root',
            index: Number.MAX_SAFE_INTEGER
          };
          if (ids.length > 1) {
            props.onMoveMany(ids, target);
          } else if (componentType) {
            props.onDropComponent(componentType, target);
          } else if (movedId) {
            props.onMove(movedId, target);
          }
        }}
      >
        {props.state.definition.components.map((node) => (
          <TreeRow
            key={node.id}
            {...props}
            node={node}
            depth={0}
            expanded={expanded}
            toggleExpanded={(id) =>
              setExpanded((current) => ({ ...current, [id]: current[id] === false }))
            }
            editingId={editingId}
            setEditingId={setEditingId}
            draft={draft}
            setDraft={setDraft}
            dropHint={dropHint}
            setDropHint={setDropHint}
            placement={placement}
            targetFor={targetFor}
          />
        ))}
      </div>
    </section>
  );
}
