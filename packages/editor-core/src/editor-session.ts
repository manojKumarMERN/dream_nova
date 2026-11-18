import { builtInComponentRegistry } from '@nova/component-registry';
import type { ComponentRegistry } from '@nova/component-registry';
import { NovaError, NovaErrorCodes } from '@nova/errors';
import { applyProposal as applyNovaProposal, classifyProposalRisk } from '@nova/proposal-model';
import type { ChangeProposal, ProposalOperation } from '@nova/proposal-model';
import { BREAKPOINTS, type AppDefinition, type ComponentNode } from '@nova/spec';
import { validateAppDefinition } from '@nova/spec-validator';
import type { CreateEditorSessionOptions, EditorSession, EditorState } from './types';
import { createId, deepClone, locateNode, readLocks, regenerateIds, withLocks } from './utils';

interface HistoryEntry {
  before: AppDefinition;
  after: AppDefinition;
  proposal: ChangeProposal;
}

interface CommitOptions {
  selection?: string[] | undefined;
  source?: 'editor' | 'system' | undefined;
  history?: boolean | undefined;
}

function makeProposal(
  operations: ProposalOperation[],
  summary: string,
  source: 'editor' | 'system',
  revision: number,
  appId: string
): ChangeProposal {
  return {
    baseVersionId: `${appId}:${revision}`,
    summary,
    rationale: '',
    riskLevel: classifyProposalRisk(operations),
    source,
    operations
  };
}

export function createEditorSession(options: CreateEditorSessionOptions): EditorSession {
  const registry: ComponentRegistry = options.registry ?? builtInComponentRegistry;
  const listeners = new Set<(state: EditorState) => void>();
  let history: HistoryEntry[] = [];
  let cursor = -1;
  let state: EditorState = {
    definition: options.definition,
    selectedNodeIds: [],
    breakpoint: BREAKPOINTS[0],
    lockedNodeIds: readLocks(options.definition),
    clipboard: [],
    canUndo: false,
    canRedo: false,
    revision: 0
  };

  function notify(): void {
    for (const listener of listeners) {
      listener(state);
    }
  }

  function preflight(definition: AppDefinition): void {
    const result = validateAppDefinition(definition, { registry });
    if (!result.valid) {
      throw new NovaError(NovaErrorCodes.VALIDATION_FAILED, 'Editor definition is invalid', {
        details: { issues: result.issues }
      });
    }
  }

  function commitProposal(proposal: ChangeProposal, commitOptions: CommitOptions = {}): void {
    preflight(state.definition);
    const before = state.definition;
    const result = applyNovaProposal(proposal, {
      baseDefinition: before,
      registry,
      approved: true
    });
    const after = result.definition;

    if (commitOptions.history !== false) {
      history = history.slice(0, cursor + 1);
      history.push({ before, after, proposal });
      cursor = history.length - 1;
    }

    state = {
      definition: after,
      selectedNodeIds:
        commitOptions.selection ??
        state.selectedNodeIds.filter((nodeId) => locateNode(after, nodeId) !== undefined),
      breakpoint: state.breakpoint,
      lockedNodeIds: readLocks(after),
      clipboard: state.clipboard,
      canUndo: cursor >= 0,
      canRedo: cursor < history.length - 1,
      revision: state.revision + 1
    };
    notify();
  }

  function commit(
    operations: ProposalOperation[],
    summary: string,
    commitOptions: CommitOptions = {}
  ): void {
    if (operations.length === 0) {
      return;
    }
    const proposal = makeProposal(
      operations,
      summary,
      commitOptions.source ?? 'editor',
      state.revision,
      state.definition.appId
    );
    commitProposal(proposal, commitOptions);
  }

  function requireNode(nodeId: string): ComponentNode {
    const location = locateNode(state.definition, nodeId);
    if (location === undefined) {
      throw new NovaError(NovaErrorCodes.NOT_FOUND, 'Component node was not found', {
        details: { nodeId }
      });
    }
    return location.node;
  }

  function assertUnlocked(nodeId: string): void {
    if (state.lockedNodeIds.includes(nodeId)) {
      throw new NovaError(NovaErrorCodes.FORBIDDEN, 'Component node is locked', {
        details: { nodeId }
      });
    }
  }

  function replacement(definition: AppDefinition, source: 'editor' | 'system'): void {
    commit(
      [{ op: 'replaceDefinition', definition }],
      source === 'system' ? 'Navigate history' : 'Replace definition',
      { source, history: source === 'editor' }
    );
  }

  const session: EditorSession = {
    getState() {
      return state;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    getDefinition() {
      return state.definition;
    },

    select(ids) {
      const unique = [...new Set(ids)].filter(
        (nodeId) => locateNode(state.definition, nodeId) !== undefined
      );
      state = { ...state, selectedNodeIds: unique, revision: state.revision + 1 };
      notify();
    },

    setBreakpoint(breakpoint) {
      if (!BREAKPOINTS.includes(breakpoint)) {
        throw new NovaError(NovaErrorCodes.VALIDATION_FAILED, 'Unsupported breakpoint', {
          details: { breakpoint }
        });
      }
      state = { ...state, breakpoint, revision: state.revision + 1 };
      notify();
    },

    applyProposal(proposal) {
      commitProposal(proposal);
    },

    createComponent(type, parentId, createOptions = {}) {
      const contract = registry.get(type);
      if (contract === undefined) {
        throw new NovaError(NovaErrorCodes.VALIDATION_FAILED, 'Unknown component type', {
          details: { type }
        });
      }
      const location = locateNode(state.definition, parentId);
      if (location === undefined) {
        throw new NovaError(NovaErrorCodes.NOT_FOUND, 'Parent component was not found', {
          details: { parentId }
        });
      }
      assertUnlocked(parentId);
      const id = createId();
      const node: ComponentNode = {
        id,
        type: contract.type,
        contractVersion: contract.version,
        props: {
          ...deepClone(contract.defaults),
          ...deepClone(createOptions.props ?? {})
        }
      };
      commit(
        [
          {
            op: 'addComponent',
            pageId: location.pageId,
            parentId,
            ...(createOptions.index === undefined ? {} : { index: createOptions.index }),
            ...(createOptions.slot === undefined ? {} : { slot: createOptions.slot }),
            node
          }
        ],
        `Create ${type}`,
        { selection: [id] }
      );
      return id;
    },

    updateNode(nodeId, patch) {
      requireNode(nodeId);
      assertUnlocked(nodeId);
      commit([{ op: 'updateComponent', nodeId, patch }], 'Update component');
    },

    moveNode(nodeId, parentId, index, slot) {
      requireNode(nodeId);
      assertUnlocked(nodeId);
      assertUnlocked(parentId);
      commit(
        [
          {
            op: 'moveComponent',
            nodeId,
            parentId,
            ...(index === undefined ? {} : { index }),
            ...(slot === undefined ? {} : { slot })
          }
        ],
        'Move component'
      );
    },

    resizeNode(nodeId, layout) {
      requireNode(nodeId);
      assertUnlocked(nodeId);
      commit([{ op: 'resizeComponent', nodeId, layout }], 'Resize component');
    },

    setBreakpointOverride(nodeId, breakpoint, layout) {
      requireNode(nodeId);
      assertUnlocked(nodeId);
      commit(
        [{ op: 'updateBreakpointOverrides', nodeId, breakpoint, layout }],
        'Set breakpoint override'
      );
    },

    bindProp(nodeId, prop, binding) {
      requireNode(nodeId);
      assertUnlocked(nodeId);
      commit([{ op: 'updateBinding', nodeId, prop, binding }], 'Bind property');
    },

    setWorkflowEvent(nodeId, event, workflowId) {
      requireNode(nodeId);
      assertUnlocked(nodeId);
      if (workflowId !== null) {
        commit(
          [
            {
              op: 'updateComponent',
              nodeId,
              patch: {
                events: {
                  [event]: { action: 'runWorkflow', params: { workflowId } }
                }
              }
            }
          ],
          'Set workflow event'
        );
        return;
      }

      const candidate = deepClone(state.definition);
      const node = locateNode(candidate, nodeId)?.node;
      if (node === undefined) {
        throw new NovaError(NovaErrorCodes.NOT_FOUND, 'Component node was not found', {
          details: { nodeId }
        });
      }
      const events = { ...(node.events ?? {}) };
      delete events[event];
      if (Object.keys(events).length === 0) {
        delete node.events;
      } else {
        node.events = events;
      }
      replacement(candidate, 'editor');
    },

    setHidden(nodeId, hidden) {
      requireNode(nodeId);
      assertUnlocked(nodeId);
      commit([{ op: 'setComponentHidden', nodeId, hidden }], 'Set component visibility');
    },

    renameNode(nodeId, name) {
      requireNode(nodeId);
      assertUnlocked(nodeId);
      commit([{ op: 'updateComponent', nodeId, patch: { name } }], 'Rename component');
    },

    duplicateNode(nodeId) {
      const location = locateNode(state.definition, nodeId);
      if (location === undefined || location.parentId === undefined) {
        return undefined;
      }
      assertUnlocked(nodeId);
      const newId = createId();
      commit(
        [
          {
            op: 'duplicateComponent',
            sourceNodeId: nodeId,
            newNodeId: newId,
            parentId: location.parentId,
            index: location.index + 1,
            ...(location.slot === undefined ? {} : { slot: location.slot })
          }
        ],
        'Duplicate component',
        { selection: [newId] }
      );
      return newId;
    },

    deleteNodes(nodeIds) {
      const unique = [...new Set(nodeIds)].filter(
        (nodeId, index) => nodeIds.indexOf(nodeId) === index
      );
      const rootIds = state.definition.pages.map((page) => page.rootNodeId);
      const removable = unique.filter((nodeId) => !rootIds.includes(nodeId));
      for (const nodeId of removable) {
        requireNode(nodeId);
        assertUnlocked(nodeId);
      }
      if (removable.length === 0) {
        return;
      }
      commit([{ op: 'bulkDeleteComponents', nodeIds: removable }], 'Delete components', {
        selection: []
      });
    },

    copy() {
      const clipboard = state.selectedNodeIds
        .map((nodeId) => locateNode(state.definition, nodeId)?.node)
        .filter((node): node is ComponentNode => node !== undefined)
        .map((node) => deepClone(node));
      state = { ...state, clipboard, revision: state.revision + 1 };
      notify();
    },

    paste(parentId, slot) {
      if (state.clipboard.length === 0) {
        return [];
      }
      const targetId =
        parentId ?? state.selectedNodeIds[0] ?? state.definition.pages[0]?.rootNodeId ?? '';
      const target = locateNode(state.definition, targetId);
      if (target === undefined) {
        throw new NovaError(NovaErrorCodes.NOT_FOUND, 'Paste target was not found', {
          details: { parentId: targetId }
        });
      }
      assertUnlocked(targetId);
      const newIds: string[] = [];
      const operations: ProposalOperation[] = [];
      state.clipboard.forEach((node, offset) => {
        const copy = regenerateIds(node);
        newIds.push(copy.id);
        operations.push({
          op: 'addComponent',
          pageId: target.pageId,
          parentId: targetId,
          index: (target.node.children?.length ?? 0) + offset,
          ...(slot === undefined ? {} : { slot }),
          node: copy
        });
      });
      commit(operations, 'Paste components', { selection: newIds });
      return newIds;
    },

    toggleLock(nodeId) {
      requireNode(nodeId);
      const locks = readLocks(state.definition);
      replacement(
        withLocks(
          state.definition,
          locks.includes(nodeId) ? locks.filter((id) => id !== nodeId) : [...locks, nodeId]
        ),
        'editor'
      );
    },

    undo() {
      const entry = history[cursor];
      if (entry === undefined) {
        return;
      }
      cursor -= 1;
      replacement(entry.before, 'system');
    },

    redo() {
      const entry = history[cursor + 1];
      if (entry === undefined) {
        return;
      }
      cursor += 1;
      replacement(entry.after, 'system');
    },

    replaceDefinition(definition) {
      replacement(definition, 'editor');
    }
  };

  return session;
}
