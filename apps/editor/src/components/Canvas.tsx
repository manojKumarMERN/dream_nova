import { useEffect, useMemo, useState } from 'react';
import type { DragEvent, MouseEvent, PointerEvent } from 'react';
import type { ComponentContract } from '@nova/contracts';
import { MemoryNavigationAdapter, createRuntimeEngine } from '@nova/runtime-core';
import { WebRuntimeApp } from '@nova/web-runtime';
import type { ComponentLayout, ComponentNode } from '@nova/spec';
import { findContract } from '../contracts';
import {
  displayName,
  effectiveLayout,
  getLayout,
  getNode,
  isHidden,
  isLocked,
  locateNode
} from '../tree';
import { BREAKPOINTS, type Breakpoint, type DropTarget, type EditorSessionLike } from '../types';
import type { EditorState, InspectorContract, Toast } from '../types';
import { Icon } from './Icons';
import type { IconName } from './Icons';

interface CanvasProps {
  state: EditorState;
  contracts: readonly InspectorContract[];
  runtimeContracts: readonly ComponentContract[];
  session: EditorSessionLike;
  activePageId: string | undefined;
  preview: boolean;
  showGrid: boolean;
  zoom: number;
  pan: { x: number; y: number };
  onTogglePreview: () => void;
  onToggleGrid: () => void;
  onZoomChange: (zoom: number) => void;
  onPanChange: (pan: { x: number; y: number }) => void;
  onResetViewport: () => void;
  onAddPage: (name?: string) => void;
  onContextMenu: (id: string, x: number, y: number) => void;
  onToast: (kind: Toast['kind'], message: string) => void;
}

const WIDTHS: Record<Breakpoint, number> = {
  desktop: 1180,
  tablet: 768,
  mobile: 390
};

type Placement = 'before' | 'inside' | 'after';

function cssSize(value: number | string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === 'number' ? `${value}px` : value;
}

function numericSize(value: number | string | undefined, fallback: number): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function nodeText(node: ComponentNode): string {
  if (typeof node.props.content === 'string') {
    return node.props.content;
  }
  if (typeof node.props.label === 'string') {
    return node.props.label;
  }
  if (typeof node.props.text === 'string') {
    return node.props.text;
  }
  return '';
}

function draggedNodes(event: DragEvent): string[] {
  const raw = event.dataTransfer.getData('application/x-nova-nodes');
  if (raw.length === 0) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

interface DesignNodeProps {
  node: ComponentNode;
  state: EditorState;
  contracts: readonly InspectorContract[];
  session: EditorSessionLike;
  zoom: number;
  onSelect: (id: string, additive: boolean) => void;
  onContextMenu: (id: string, x: number, y: number) => void;
  onMove: (id: string, target: DropTarget) => void;
  onMoveMany: (ids: readonly string[], target: DropTarget) => void;
  onAdd: (type: string, target: DropTarget) => void;
}

function DesignNode(props: DesignNodeProps) {
  const { node, state, contracts, session, zoom } = props;
  const [placement, setPlacement] = useState<Placement>('inside');
  const [dropActive, setDropActive] = useState(false);
  const [resizePreview, setResizePreview] = useState<{ width: number; height: number } | null>(
    null
  );
  const contract = findContract(contracts, node.type);
  const layout = effectiveLayout(node, state.breakpoint);
  const selected = state.selectedNodeIds.includes(node.id);
  const hidden = isHidden(node);
  const locked = isLocked(state.definition, node);
  const direction = layout.direction ?? (node.props.direction === 'row' ? 'row' : 'column');
  const gap = layout.gap ?? (typeof node.props.gap === 'number' ? node.props.gap : 8);
  const display = layout.display ?? 'flex';

  const childLists: Array<{ slot: string; nodes: ComponentNode[] }> = [
    ...(node.children ? [{ slot: 'children', nodes: node.children }] : []),
    ...Object.entries(node.slots ?? {}).map(([slot, nodes]) => ({ slot, nodes }))
  ];
  const canNest =
    childLists.length > 0 ||
    Object.keys(contract?.slots ?? {}).length > 0 ||
    contract?.category === 'layout';

  const computePlacement = (event: DragEvent<HTMLDivElement>): Placement => {
    const rect = event.currentTarget.getBoundingClientRect();
    const horizontal = direction === 'row';
    const ratio = horizontal
      ? (event.clientX - rect.left) / Math.max(rect.width, 1)
      : (event.clientY - rect.top) / Math.max(rect.height, 1);
    if (ratio < 0.25) {
      return 'before';
    }
    if (ratio > 0.75 || !canNest) {
      return 'after';
    }
    return 'inside';
  };

  const targetFor = (position: Placement): DropTarget => {
    if (position === 'inside') {
      const slot = Object.keys(contract?.slots ?? {})[0] ?? 'children';
      const container = slot === 'children' ? (node.children ?? []) : (node.slots?.[slot] ?? []);
      return { parentId: node.id, slot, index: container.length };
    }
    const location = locateNode(state.definition, node.id);
    if (!location) {
      return { parentId: null, slot: 'root', index: 0 };
    }
    return {
      parentId: location.parent?.id ?? null,
      slot: location.parent ? location.slot : 'root',
      index: position === 'before' ? location.index : location.index + 1
    };
  };

  const startResize = (event: PointerEvent<HTMLSpanElement>, axis: 'x' | 'y' | 'xy') => {
    event.preventDefault();
    event.stopPropagation();
    const root = event.currentTarget.parentElement;
    const rect = root?.getBoundingClientRect();
    const scale = zoom / 100;
    const start = {
      x: event.clientX,
      y: event.clientY,
      width: numericSize(getLayout(node).width, (rect?.width ?? 0) / scale),
      height: numericSize(getLayout(node).height, (rect?.height ?? 0) / scale)
    };
    const minWidth = contract?.resize?.minWidth ?? 24;
    const minHeight = contract?.resize?.minHeight ?? 24;
    let preview: { width: number; height: number } = {
      width: start.width,
      height: start.height
    };

    const move = (pointer: globalThis.PointerEvent) => {
      preview = {
        width:
          axis === 'y'
            ? preview.width
            : Math.max(minWidth, Math.round(start.width + (pointer.clientX - start.x) / scale)),
        height:
          axis === 'x'
            ? preview.height
            : Math.max(minHeight, Math.round(start.height + (pointer.clientY - start.y) / scale))
      };
      setResizePreview(preview);
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      setResizePreview(null);
      const patch: ComponentLayout = {};
      if (axis !== 'y') {
        patch.width = preview.width;
      }
      if (axis !== 'x') {
        patch.height = preview.height;
      }
      if (state.breakpoint === 'desktop') {
        session.resizeNode(node.id, patch);
        return;
      }
      const override = node.breakpointOverrides?.[state.breakpoint] as ComponentLayout | undefined;
      session.setBreakpointOverride(node.id, { ...(override ?? {}), ...patch });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  const style: React.CSSProperties = {
    display,
    flexDirection: direction === 'row' ? 'row' : 'column',
    gap: typeof gap === 'number' ? `${gap}px` : gap,
    width: cssSize(resizePreview?.width ?? layout.width),
    height: cssSize(resizePreview?.height ?? layout.height),
    padding: cssSize(layout.padding),
    margin: cssSize(layout.margin),
    alignItems:
      layout.alignItems === 'start' || layout.alignItems === 'end'
        ? `flex-${layout.alignItems}`
        : layout.alignItems,
    justifyContent:
      layout.justifyContent === 'between'
        ? 'space-between'
        : layout.justifyContent === 'start' || layout.justifyContent === 'end'
          ? `flex-${layout.justifyContent}`
          : layout.justifyContent,
    backgroundColor: layout.backgroundColor,
    color: layout.color,
    borderRadius: cssSize(layout.borderRadius),
    fontSize: cssSize(layout.fontSize),
    fontWeight: typeof layout.fontWeight === 'number' ? layout.fontWeight : undefined,
    textAlign: layout.textAlign,
    gridTemplateColumns:
      layout.gridColumns === undefined
        ? undefined
        : `repeat(${layout.gridColumns}, minmax(0, 1fr))`,
    gridTemplateRows:
      layout.gridRows === undefined ? undefined : `repeat(${layout.gridRows}, minmax(0, 1fr))`
  };

  return (
    <div
      className={`design-node${selected ? ' selected' : ''}${hidden ? ' hidden' : ''}${
        locked ? ' locked' : ''
      }${dropActive ? ` drop-${placement}` : ''}`}
      data-node-id={node.id}
      style={style}
      draggable={!locked}
      onDragStart={(event) => {
        const selectedIds = state.selectedNodeIds.includes(node.id)
          ? state.selectedNodeIds
          : [node.id];
        event.dataTransfer.setData('application/x-nova-nodes', JSON.stringify(selectedIds));
        event.dataTransfer.setData('application/x-nova-node', node.id);
        event.dataTransfer.effectAllowed = 'move';
        event.stopPropagation();
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setPlacement(computePlacement(event));
        setDropActive(true);
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const target = targetFor(placement);
        const ids = draggedNodes(event);
        const movedId = event.dataTransfer.getData('application/x-nova-node');
        const componentType = event.dataTransfer.getData('application/x-nova-component');
        if (ids.length > 1) {
          props.onMoveMany(ids, target);
        } else if (movedId && movedId !== node.id) {
          props.onMove(movedId, target);
        } else if (componentType) {
          props.onAdd(componentType, target);
        }
        setDropActive(false);
      }}
      onClick={(event: MouseEvent<HTMLDivElement>) => {
        event.stopPropagation();
        props.onSelect(node.id, event.metaKey || event.ctrlKey || event.shiftKey);
      }}
      onContextMenu={(event: MouseEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        props.onContextMenu(node.id, event.clientX, event.clientY);
      }}
    >
      <div className="design-node-bar">
        <span className="design-node-badge">
          <Icon name={(contract?.icon as unknown as IconName) ?? 'box'} size={11} />
          {displayName(node, contract?.displayName ?? node.type)}
        </span>
        {contract?.readiness === 'progressive' ? (
          <span className="design-readiness">Preview</span>
        ) : null}
        {hidden ? <Icon name="eye-off" size={11} /> : null}
        {locked ? <Icon name="lock" size={11} /> : null}
      </div>
      <div className="design-node-content">
        <span className="design-node-text">
          {nodeText(node) || contract?.displayName || node.type}
        </span>
      </div>
      {childLists.map(({ slot, nodes }) => (
        <div
          className="design-slot"
          key={slot}
          data-slot={slot}
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const target: DropTarget = { parentId: node.id, slot, index: nodes.length };
            const ids = draggedNodes(event);
            const movedId = event.dataTransfer.getData('application/x-nova-node');
            const componentType = event.dataTransfer.getData('application/x-nova-component');
            if (ids.length > 1) {
              props.onMoveMany(ids, target);
            } else if (movedId && movedId !== node.id) {
              props.onMove(movedId, target);
            } else if (componentType) {
              props.onAdd(componentType, target);
            }
          }}
        >
          <span className="design-slot-label">{slot}</span>
          {nodes.map((child) => (
            <DesignNode key={`${slot}-${child.id}`} {...props} node={child} />
          ))}
        </div>
      ))}
      {selected && contract?.resize?.enabled !== false ? (
        <>
          <span
            className="resize-handle resize-e"
            aria-label="Resize width"
            onPointerDown={(event) => startResize(event, 'x')}
          />
          <span
            className="resize-handle resize-s"
            aria-label="Resize height"
            onPointerDown={(event) => startResize(event, 'y')}
          />
          <span
            className="resize-handle resize-se"
            aria-label="Resize width and height"
            onPointerDown={(event) => startResize(event, 'xy')}
          />
        </>
      ) : null}
    </div>
  );
}

export function Canvas(props: CanvasProps) {
  const { state, session, preview, showGrid, zoom, pan } = props;
  const [panMode, setPanMode] = useState(false);
  const [rootDropActive, setRootDropActive] = useState(false);
  const page =
    state.definition.pages.find((candidate) => candidate.id === props.activePageId) ??
    state.definition.pages[0];
  const rootNode = state.definition.components.find(
    (candidate) => candidate.id === page?.rootNodeId
  );

  const engine = useMemo(
    () =>
      createRuntimeEngine(state.definition, {
        contracts: props.runtimeContracts,
        breakpoint: state.breakpoint,
        navigation: new MemoryNavigationAdapter(page?.route ?? '/'),
        onEvent: (event) => {
          props.onToast('info', `Runtime event: ${event.event} · ${event.nodeId}`);
        },
        onError: (error) => {
          props.onToast('error', `Runtime error: ${error.message}`);
        }
      }),
    [state.definition, state.breakpoint, page?.route, props.runtimeContracts, props.onToast]
  );

  useEffect(() => () => engine.dispose(), [engine]);

  const runtimeProps = useMemo(() => ({ engine }), [engine]);

  const handleAdd = (type: string, target: DropTarget) => {
    session.createComponent(type, target);
    props.onToast('success', `Added ${type}`);
  };

  const handleMove = (id: string, target: DropTarget) => {
    session.moveNode(id, target);
  };

  const handleMoveMany = (ids: readonly string[], target: DropTarget) => {
    session.moveNodes(ids, target);
    props.onToast('info', `Moved ${ids.length} components`);
  };

  const startPan = (event: PointerEvent<HTMLDivElement>) => {
    if (!panMode && event.button !== 1) {
      return;
    }
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
    const move = (pointer: globalThis.PointerEvent) => {
      props.onPanChange({
        x: start.panX + pointer.clientX - start.x,
        y: start.panY + pointer.clientY - start.y
      });
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  const selectedId = state.selectedNodeIds[0];
  const selectedNode = selectedId === undefined ? undefined : getNode(state.definition, selectedId);
  const selectedContract =
    selectedNode === undefined ? undefined : findContract(props.contracts, selectedNode.type);
  const breakpoints = selectedContract?.supportedBreakpoints ?? BREAKPOINTS;

  return (
    <section className="canvas-shell" aria-label="Design canvas">
      <div className="canvas-toolbar">
        <div className="breakpoint-switcher" role="group" aria-label="Breakpoint">
          {breakpoints.map((breakpoint) => (
            <button
              type="button"
              key={breakpoint}
              className={state.breakpoint === breakpoint ? 'active' : ''}
              aria-label={`${breakpoint} viewport`}
              onClick={() => session.setBreakpoint(breakpoint)}
            >
              <Icon
                name={
                  breakpoint === 'desktop'
                    ? 'monitor'
                    : breakpoint === 'tablet'
                      ? 'tablet'
                      : 'smartphone'
                }
                size={14}
              />
              <span>{breakpoint}</span>
            </button>
          ))}
        </div>
        <div className="canvas-toolbar-spacer" />
        <button
          type="button"
          className={panMode ? 'active' : ''}
          aria-label="Toggle pan mode"
          aria-pressed={panMode}
          onClick={() => setPanMode((current) => !current)}
        >
          <Icon name="move" size={14} />
          <span>Pan</span>
        </button>
        <button type="button" aria-label="Reset viewport" onClick={props.onResetViewport}>
          <Icon name="maximize" size={14} />
        </button>
        <button
          type="button"
          className={showGrid ? 'active' : ''}
          aria-label="Toggle grid and guides"
          onClick={props.onToggleGrid}
        >
          <Icon name="grid" size={14} />
          <span>Grid</span>
        </button>
        <div className="zoom-controls">
          <button type="button" aria-label="Zoom out" onClick={() => props.onZoomChange(zoom - 10)}>
            <Icon name="zoom-out" size={14} />
          </button>
          <span className="zoom-value">{zoom}%</span>
          <button type="button" aria-label="Zoom in" onClick={() => props.onZoomChange(zoom + 10)}>
            <Icon name="zoom-in" size={14} />
          </button>
        </div>
        <button
          type="button"
          className={preview ? 'active' : ''}
          aria-label="Toggle preview"
          onClick={props.onTogglePreview}
        >
          <Icon name={preview ? 'edit' : 'play'} size={14} />
          <span>{preview ? 'Design' : 'Preview'}</span>
        </button>
      </div>
      <div
        className={`canvas-viewport${showGrid ? ' show-grid' : ''}${panMode ? ' pan-mode' : ''}`}
        onPointerDown={startPan}
      >
        <div
          className="canvas-stage"
          style={{
            width: WIDTHS[state.breakpoint],
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom / 100})`
          }}
          onClick={preview ? undefined : () => session.select([])}
        >
          {preview ? (
            <div className="runtime-preview">
              <WebRuntimeApp {...runtimeProps} />
            </div>
          ) : (
            <div className="design-root">
              {rootNode === undefined ? (
                <div className="panel-empty">This page has no root component.</div>
              ) : (
                <DesignNode
                  node={rootNode}
                  state={state}
                  contracts={props.contracts}
                  session={session}
                  zoom={zoom}
                  onSelect={(id, additive) =>
                    session.select(additive ? [...new Set([...state.selectedNodeIds, id])] : [id])
                  }
                  onContextMenu={props.onContextMenu}
                  onMove={handleMove}
                  onMoveMany={handleMoveMany}
                  onAdd={handleAdd}
                />
              )}
              <div
                className={`design-root-drop${rootDropActive ? ' active' : ''}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setRootDropActive(true);
                }}
                onDragLeave={() => setRootDropActive(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setRootDropActive(false);
                  const componentType = event.dataTransfer.getData('application/x-nova-component');
                  const ids = draggedNodes(event);
                  const movedId = event.dataTransfer.getData('application/x-nova-node');
                  const pageName = event.dataTransfer.getData('application/x-nova-page');
                  if (pageName.length > 0) {
                    props.onAddPage(pageName);
                    return;
                  }
                  const target: DropTarget = { parentId: null, slot: 'root', index: 9999 };
                  if (ids.length > 1) {
                    handleMoveMany(ids, target);
                  } else if (componentType) {
                    handleAdd(componentType, target);
                  } else if (movedId) {
                    handleMove(movedId, target);
                  }
                }}
              >
                Drop components here
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="canvas-status" aria-live="polite">
        {page === undefined ? 'No page' : `${page.name} · ${page.route}`}
        {selectedCountLabel(state.selectedNodeIds.length)}
      </div>
    </section>
  );
}

function selectedCountLabel(count: number): string {
  return count === 0 ? '' : ` · ${count} selected`;
}
