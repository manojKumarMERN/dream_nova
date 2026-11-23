import type { EditorSession as CoreEditorSession } from '@nova/editor-core';
import type { AppDefinition, Binding, ComponentNode, PageDefinition } from '@nova/spec';
import type { DropTarget, EditorSessionLike } from './types';
import { createUniqueId } from './id';
import { getNode } from './tree';

interface ResolvedTarget {
  parentId: string;
  index?: number;
  slot?: string;
}

function resolveTarget(
  target: DropTarget | undefined,
  definition: AppDefinition,
  activePageId?: string
): ResolvedTarget {
  const page =
    definition.pages.find((candidate) => candidate.id === target?.pageId) ??
    definition.pages.find((candidate) => candidate.id === activePageId) ??
    definition.pages[0];
  if (page === undefined) {
    throw new Error('The application has no page');
  }
  const parentId = target?.parentId ?? page.rootNodeId;
  const rootSlot = parentId === page.rootNodeId && (target?.slot === 'root' || target?.slot === '');
  return {
    parentId,
    ...(target === undefined || target.index < 0 ? {} : { index: target.index }),
    ...(rootSlot || target?.slot === undefined || target.slot === 'children'
      ? {}
      : { slot: target.slot })
  };
}

function collectNodeIds(node: ComponentNode, result = new Set<string>()): Set<string> {
  result.add(node.id);
  for (const child of node.children ?? []) {
    collectNodeIds(child, result);
  }
  for (const children of Object.values(node.slots ?? {})) {
    for (const child of children) {
      collectNodeIds(child, result);
    }
  }
  return result;
}

function uniqueRoute(routes: readonly string[], name: string): string {
  const base = `/${
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'page'
  }`;
  if (!routes.includes(base)) {
    return base;
  }
  let suffix = 2;
  while (routes.includes(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

function makePage(name: string, route: string): PageDefinition {
  return {
    id: createUniqueId('page'),
    name,
    route,
    rootNodeId: createUniqueId('root'),
    settings: {}
  };
}

export function createStudioSession(
  core: CoreEditorSession,
  getActivePageId: () => string | undefined = () => undefined
): EditorSessionLike {
  const patchableKeys = [
    'name',
    'props',
    'bindings',
    'events',
    'layout',
    'breakpointOverrides',
    'hidden'
  ] as const;

  const session: EditorSessionLike = {
    getState: () => core.getState(),
    getDefinition: () => core.getDefinition(),
    subscribe: (listener) => core.subscribe(listener),
    select: (ids) => core.select(ids),
    setBreakpoint: (breakpoint) => core.setBreakpoint(breakpoint),

    createComponent(type, target) {
      const state = core.getState();
      const resolved = resolveTarget(target, state.definition, getActivePageId());
      const id = core.createComponent(type, resolved.parentId, resolved);
      return id;
    },

    updateNode(id, patch) {
      const next: Record<string, unknown> = {};
      for (const key of patchableKeys) {
        if (key in patch) {
          next[key] = patch[key];
        }
      }
      core.updateNode(id, next);
    },

    moveNode(id, target) {
      const state = core.getState();
      const resolved = resolveTarget(target, state.definition, getActivePageId());
      core.moveNode(id, resolved.parentId, resolved.index, resolved.slot);
    },

    moveNodes(ids, target) {
      const unique = [...new Set(ids)];
      unique.forEach((id, offset) => {
        const state = core.getState();
        const resolved = resolveTarget(
          { ...target, index: target.index + offset },
          state.definition,
          getActivePageId()
        );
        core.moveNode(id, resolved.parentId, resolved.index, resolved.slot);
      });
    },

    resizeNode(id, layout) {
      core.resizeNode(id, layout);
    },

    setBreakpointOverride(id, layout) {
      core.setBreakpointOverride(id, core.getState().breakpoint, layout);
    },

    bindProp(id, prop, binding: Binding | null) {
      core.bindProp(id, prop, binding);
    },

    setWorkflowEvent(id, eventName, workflowId) {
      const state = core.getState();
      const node = getNode(state.definition, id);
      const current = node?.events?.[eventName];
      if (workflowId === null) {
        const events = { ...(node?.events ?? {}) };
        delete events[eventName];
        core.updateNode(id, { events });
        return;
      }
      core.updateNode(id, {
        events: {
          ...(node?.events ?? {}),
          [eventName]: {
            action: current?.action ?? 'runWorkflow',
            params: { workflowId }
          }
        }
      });
    },

    setHidden(id, hidden) {
      core.setHidden(id, hidden);
    },

    renameNode(id, name) {
      core.renameNode(id, name);
    },

    duplicateNode(id) {
      return core.duplicateNode(id);
    },

    deleteNodes(ids) {
      core.deleteNodes([...ids]);
    },

    copy(ids) {
      const previous = core.getState().selectedNodeIds;
      if (ids !== undefined) {
        core.select([...ids]);
      }
      core.copy();
      if (ids !== undefined) {
        core.select(previous);
      }
    },

    paste(target) {
      const state = core.getState();
      const resolved = resolveTarget(target, state.definition, getActivePageId());
      return core.paste(resolved.parentId, resolved.slot);
    },

    toggleLock(id) {
      core.toggleLock(id);
    },

    addPage(name = 'New page', route) {
      const definition = core.getDefinition();
      const page = makePage(
        name,
        route ??
          uniqueRoute(
            definition.pages.map((candidate) => candidate.route),
            name
          )
      );
      const root: ComponentNode = {
        id: page.rootNodeId,
        type: 'nova.stack',
        contractVersion: '1.0.0',
        name: `${page.name} root`,
        props: { direction: 'column', gap: 8 },
        children: []
      };
      core.replaceDefinition({
        ...definition,
        pages: [...definition.pages, page],
        components: [...definition.components, root]
      });
      return page.id;
    },

    renamePage(pageId, name) {
      const definition = core.getDefinition();
      core.replaceDefinition({
        ...definition,
        pages: definition.pages.map((page) =>
          page.id === pageId ? { ...page, name, settings: { ...page.settings } } : page
        )
      });
    },

    removePage(pageId) {
      const definition = core.getDefinition();
      if (definition.pages.length < 2) {
        return;
      }
      const page = definition.pages.find((candidate) => candidate.id === pageId);
      if (page === undefined) {
        return;
      }
      const removedIds = collectNodeIds(
        definition.components.find((candidate) => candidate.id === page.rootNodeId) ?? {
          id: page.rootNodeId,
          type: 'nova.stack',
          contractVersion: '1.0.0',
          props: {}
        }
      );
      core.replaceDefinition({
        ...definition,
        pages: definition.pages.filter((candidate) => candidate.id !== pageId),
        components: definition.components.filter((candidate) => candidate.id !== page.rootNodeId),
        metadata: {
          ...definition.metadata,
          editorLocks: definition.metadata.editorLocks.filter((id) => !removedIds.has(id))
        }
      });
    },

    undo() {
      core.undo();
    },

    redo() {
      core.redo();
    },

    replaceDefinition(definition) {
      core.replaceDefinition(definition);
    },

    applyProposal(proposal) {
      core.applyProposal(proposal);
    }
  };

  return session;
}
