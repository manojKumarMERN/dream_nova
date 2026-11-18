import { useEffect, useMemo, useState } from 'react';
import { BUILT_IN_COMPONENT_CONTRACTS } from '@nova/component-registry';
import type { AppDefinition } from '@nova/spec';
import { BUILT_IN_CONTRACTS, fetchContracts, findContract } from './contracts';
import { useToasts } from './hooks/useToasts';
import { loadContracts, publishApp, validateDefinition as validateDefinitionRequest } from './sdk';
import { useStudioStore } from './store';
import { getNode, isHidden, isLocked } from './tree';
import type { DropTarget, EditorState, InspectorContract, Toast, WorkflowRef } from './types';
import { AiPanel } from './components/AiPanel';
import { Canvas } from './components/Canvas';
import { ComponentTree } from './components/ComponentTree';
import { ContextMenu } from './components/ContextMenu';
import type { ContextAction } from './components/ContextMenu';
import { Icon } from './components/Icons';
import { Inspector } from './components/Inspector';
import { Palette } from './components/Palette';
import { PagesPanel } from './components/PagesPanel';
import { Toolbar } from './components/Toolbar';
import { WorkflowEditor } from './components/WorkflowEditor';

function defaultTarget(state: EditorState, contracts: readonly InspectorContract[]): DropTarget {
  const selectedId = state.selectedNodeIds[0];
  if (selectedId === undefined) {
    return { parentId: null, slot: 'root', index: Number.MAX_SAFE_INTEGER };
  }
  const node = getNode(state.definition, selectedId);
  if (node === undefined) {
    return { parentId: null, slot: 'root', index: Number.MAX_SAFE_INTEGER };
  }
  const contract = findContract(contracts, node.type);
  const slot = Object.keys(contract?.slots ?? {})[0] ?? 'children';
  const container = slot === 'children' ? (node.children ?? []) : (node.slots?.[slot] ?? []);
  return { parentId: node.id, slot, index: container.length };
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}

export default function App() {
  const store = useStudioStore();
  const {
    session,
    editor,
    componentContracts,
    activePageId,
    appId,
    versionId,
    versions,
    apps,
    status,
    saving,
    dirty,
    saveError,
    preview,
    showGrid,
    zoom,
    pan,
    aiOpen,
    workflowTarget,
    menu,
    notice,
    leftTab
  } = store;
  const { toasts, push, dismiss } = useToasts();
  const [contracts, setContracts] = useState<readonly InspectorContract[]>(BUILT_IN_CONTRACTS);
  const [contractsLoading, setContractsLoading] = useState(true);

  const selection = useMemo(
    () =>
      editor.selectedNodeIds
        .map((id) => getNode(editor.definition, id))
        .filter((node): node is NonNullable<typeof node> => node !== undefined),
    [editor]
  );

  useEffect(() => {
    let active = true;
    Promise.all([fetchContracts(), loadContracts()])
      .then(([loaded, remote]) => {
        if (!active) {
          return;
        }
        setContracts(loaded);
        if (remote.length > 0) {
          const merged = new Map(
            [...BUILT_IN_COMPONENT_CONTRACTS, ...remote].map((contract) => [
              `${contract.type}@${contract.version}`,
              contract
            ])
          );
          useStudioStore.getState().setComponentContracts([...merged.values()]);
        }
        useStudioStore.getState().setContractsReady(true);
      })
      .catch(() => {
        if (active) {
          setContracts(BUILT_IN_CONTRACTS);
          useStudioStore.getState().setContractsReady(true);
        }
      })
      .finally(() => {
        if (active) {
          setContractsLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void useStudioStore.getState().refreshApps();
    const params = new URLSearchParams(window.location.search);
    const requestedApp = params.get('app');
    if (requestedApp !== null && requestedApp.length > 0) {
      const requestedVersion = params.get('version') ?? undefined;
      void useStudioStore.getState().openApp(requestedApp, requestedVersion);
    }
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('app') !== appId) {
      url.searchParams.set('app', appId);
      window.history.replaceState(null, '', url.toString());
    }
  }, [appId]);

  useEffect(() => {
    if (!dirty || saving || saveError !== undefined) {
      return;
    }
    const timer = window.setTimeout(() => {
      void useStudioStore.getState().save({ autosave: true });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [dirty, saving, saveError, editor.revision]);

  useEffect(() => {
    if (notice !== null) {
      push(notice.kind, notice.message);
    }
  }, [notice, push]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }
      const state = useStudioStore.getState();
      const modifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (modifier && key === 's') {
        event.preventDefault();
        void state.save({ label: 'Manual save' });
        return;
      }
      if (modifier && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          state.session.redo();
        } else {
          state.session.undo();
        }
        return;
      }
      if (modifier && key === 'c') {
        event.preventDefault();
        state.session.copy();
        push('info', 'Components copied');
        return;
      }
      if (modifier && key === 'v') {
        event.preventDefault();
        const created = state.session.paste(defaultTarget(state.editor, BUILT_IN_CONTRACTS));
        push('success', `Pasted ${created.length} component${created.length === 1 ? '' : 's'}`);
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (state.editor.selectedNodeIds.length === 0) {
          return;
        }
        event.preventDefault();
        state.session.deleteNodes(state.editor.selectedNodeIds);
        state.session.select([]);
        return;
      }
      if (event.key === 'Escape') {
        state.session.select([]);
        state.setMenu(null);
        state.setWorkflowTarget(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [push]);

  const addComponent = (type: string, target?: DropTarget) => {
    const created = session.createComponent(type, target ?? defaultTarget(editor, contracts));
    session.select([created]);
    push('success', `Added ${type}`);
  };

  const hiddenFor = (id: string) => {
    const node = getNode(editor.definition, id);
    return node !== undefined && isHidden(node);
  };

  const lockedFor = (id: string) => {
    const node = getNode(editor.definition, id);
    return node !== undefined && isLocked(editor.definition, node);
  };

  const handleMenuAction = (action: ContextAction) => {
    if (menu === null) {
      return;
    }
    const id = menu.id;
    if (action === 'duplicate') {
      session.duplicateNode(id);
      push('success', 'Component duplicated');
    } else if (action === 'delete') {
      session.deleteNodes([id]);
      session.select([]);
      push('info', 'Component deleted');
    } else if (action === 'copy') {
      session.copy([id]);
      push('info', 'Component copied');
    } else if (action === 'paste') {
      session.paste(defaultTarget(editor, contracts));
      push('success', 'Component pasted');
    } else if (action === 'hide') {
      session.setHidden(id, !hiddenFor(id));
    } else if (action === 'lock') {
      session.toggleLock(id);
    } else if (action === 'rename') {
      const node = getNode(editor.definition, id);
      const name = window.prompt('Component name', node?.name ?? node?.type ?? '');
      if (name !== null && name.trim().length > 0) {
        session.renameNode(id, name.trim());
      }
    }
    store.setMenu(null);
  };

  const handleValidate = async () => {
    const result = await validateDefinitionRequest(editor.definition);
    store.setStatus(result.ok ? 'Valid' : 'Invalid');
    push(result.ok ? 'success' : 'error', result.detail);
  };

  const handlePublish = async () => {
    if (dirty) {
      push('error', 'Save the app before publishing');
      return;
    }
    try {
      store.setStatus('Publishing…');
      await publishApp(appId, versionId);
      store.setStatus('Published');
      push('success', 'Release published');
    } catch (error) {
      store.setStatus('Publish failed');
      push('error', error instanceof Error ? error.message : String(error));
    }
  };

  const applyProposalDefinition = (definition: AppDefinition) => {
    session.replaceDefinition(definition);
    store.setStatus('Proposal applied');
  };

  return (
    <div className="app-shell">
      <Toolbar
        appName={editor.definition.name}
        appId={appId}
        versionId={versionId}
        versions={versions}
        apps={apps}
        status={status}
        dirty={dirty}
        saving={saving}
        aiOpen={aiOpen}
        preview={preview}
        onTogglePreview={() => store.setPreview(!preview)}
        onSave={() => void store.save({ label: 'Manual save' })}
        onValidate={() => void handleValidate()}
        onPublish={() => void handlePublish()}
        onUndo={() => session.undo()}
        onRedo={() => session.redo()}
        onToggleAi={() => store.setAiOpen(!aiOpen)}
        onReopen={(id) => void store.openApp(appId, id)}
        onOpenApp={(id) => void store.openApp(id)}
        onAddPage={() => {
          const pageId = session.addPage();
          store.setActivePage(pageId);
          push('success', 'Page added');
        }}
      />
      <div className="app-body">
        <aside className="left-sidebar" aria-label="Library and layers">
          <div className="sidebar-tabs" role="tablist" aria-label="Sidebar sections">
            {(
              [
                ['components', 'Components', 'box'],
                ['pages', 'Pages', 'layers'],
                ['assets', 'Assets', 'grid'],
                ['data', 'Data', 'database']
              ] as const
            ).map(([id, label, icon]) => (
              <button
                type="button"
                role="tab"
                aria-selected={leftTab === id}
                className={leftTab === id ? 'active' : ''}
                key={id}
                onClick={() => store.setLeftTab(id)}
              >
                <Icon name={icon} size={13} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          {leftTab === 'components' ? (
            <>
              <Palette
                contracts={contracts}
                loading={contractsLoading}
                onAdd={(type) => addComponent(type)}
              />
              <ComponentTree
                state={editor}
                contracts={contracts}
                onSelect={(id, additive) => {
                  const current = editor.selectedNodeIds;
                  session.select(
                    additive
                      ? current.includes(id)
                        ? current.filter((value) => value !== id)
                        : [...current, id]
                      : [id]
                  );
                }}
                onMove={(id, target) => session.moveNode(id, target)}
                onMoveMany={(ids, target) => session.moveNodes(ids, target)}
                onDropComponent={(type, target) => addComponent(type, target)}
                onRename={(id, name) => session.renameNode(id, name)}
                onToggleHidden={(id) => session.setHidden(id, !hiddenFor(id))}
                onToggleLock={(id) => session.toggleLock(id)}
                onContextMenu={(id, x, y) => store.setMenu({ id, x, y })}
              />
            </>
          ) : null}
          {leftTab === 'pages' ? (
            <PagesPanel
              state={editor}
              activePageId={activePageId}
              onSelectPage={(id) => store.setActivePage(id)}
              onAddPage={(name) => {
                const pageId = session.addPage(name);
                store.setActivePage(pageId);
                push('success', `Page “${name ?? 'New page'}” added`);
              }}
              onRenamePage={(id, name) => session.renamePage(id, name)}
              onRemovePage={(id) => {
                session.removePage(id);
                push('info', 'Page removed');
              }}
            />
          ) : null}
          {leftTab === 'assets' ? (
            <section className="panel-section" aria-label="Assets">
              <header className="panel-header">
                <span>Assets</span>
              </header>
              <div className="panel-empty">
                Assets are resolved from the runtime registry. No local uploads in this phase.
              </div>
            </section>
          ) : null}
          {leftTab === 'data' ? (
            <section className="panel-section" aria-label="Data models">
              <header className="panel-header">
                <span>Data</span>
                <span className="panel-count">{editor.definition.dataModels.length}</span>
              </header>
              <div className="data-list">
                {editor.definition.dataModels.map((model) => (
                  <div className="data-row" key={model.id}>
                    <Icon name="database" size={13} />
                    <span>{model.name}</span>
                  </div>
                ))}
                {editor.definition.dataModels.length === 0 ? (
                  <div className="panel-empty">No data models in this app.</div>
                ) : null}
              </div>
            </section>
          ) : null}
        </aside>
        <main className="main-area">
          <Canvas
            state={editor}
            contracts={contracts}
            runtimeContracts={componentContracts}
            session={session}
            activePageId={activePageId}
            preview={preview}
            showGrid={showGrid}
            zoom={zoom}
            pan={pan}
            onTogglePreview={() => store.setPreview(!preview)}
            onToggleGrid={() => store.setShowGrid(!showGrid)}
            onZoomChange={(value) => store.setZoom(value)}
            onPanChange={(value) => store.setPan(value)}
            onResetViewport={() => store.resetViewport()}
            onAddPage={(name) => {
              const pageId = session.addPage(name);
              store.setActivePage(pageId);
              push('success', `Page “${name ?? 'New page'}” added`);
            }}
            onContextMenu={(id, x, y) => store.setMenu({ id, x, y })}
            onToast={push}
          />
          <WorkflowEditor
            state={editor}
            session={session}
            contracts={contracts}
            target={workflowTarget}
            onTargetChange={(target: WorkflowRef | null) => store.setWorkflowTarget(target)}
            onToast={(kind: Toast['kind'], message: string) => push(kind, message)}
          />
        </main>
        <Inspector
          state={editor}
          contracts={contracts}
          session={session}
          onOpenWorkflow={(target) => store.setWorkflowTarget(target)}
          onToast={(kind: Toast['kind'], message: string) => push(kind, message)}
        />
        {aiOpen ? (
          <AiPanel
            appId={appId}
            state={editor}
            onClose={() => store.setAiOpen(false)}
            onToast={(kind: Toast['kind'], message: string) => push(kind, message)}
            onApply={applyProposalDefinition}
          />
        ) : null}
      </div>
      {menu !== null ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          hidden={hiddenFor(menu.id)}
          locked={lockedFor(menu.id)}
          onAction={handleMenuAction}
          onClose={() => store.setMenu(null)}
        />
      ) : null}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast: Toast) => (
          <button
            type="button"
            className={`toast toast-${toast.kind}`}
            key={toast.id}
            onClick={() => dismiss(toast.id)}
          >
            <Icon
              name={toast.kind === 'error' ? 'x' : toast.kind === 'success' ? 'check' : 'sparkles'}
              size={13}
            />
            {toast.message}
          </button>
        ))}
      </div>
      {selection.length > 1 ? (
        <div className="selection-indicator" aria-live="polite">
          {selection.length} components selected
        </div>
      ) : null}
    </div>
  );
}
