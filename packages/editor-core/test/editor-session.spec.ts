import { describe, expect, it, vi } from 'vitest';
import { NovaError, NovaErrorCodes } from '@nova/errors';
import {
  BREAKPOINTS,
  createMinimalAppDefinition,
  type AppDefinition,
  type Breakpoint,
  type ComponentNode
} from '@nova/spec';
import { createEditorSession, type EditorSession } from '../src/index';

const ROOT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TEXT_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const BUTTON_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const WORKFLOW_ID = '11111111-1111-4111-8111-111111111111';
const STEP_ID = '22222222-2222-4222-8222-222222222222';

function session(): EditorSession {
  const definition = createMinimalAppDefinition() as AppDefinition;
  return createEditorSession({
    definition: {
      ...definition,
      workflows: [
        {
          id: WORKFLOW_ID,
          name: 'Test workflow',
          trigger: { event: 'click', nodeId: BUTTON_ID },
          steps: [{ id: STEP_ID, type: 'showMessage', params: { message: 'hello' } }],
          enabled: true
        }
      ]
    }
  });
}

function findNode(nodes: readonly ComponentNode[], nodeId: string): ComponentNode | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node;
    }
    const child = findNode(node.children ?? [], nodeId);
    if (child !== undefined) {
      return child;
    }
  }
  return undefined;
}

function childrenOf(current: EditorSession, nodeId = ROOT_ID) {
  return findNode(current.getState().definition.components, nodeId)?.children ?? [];
}

describe('createEditorSession', () => {
  it('creates, updates and renames components through proposals', () => {
    const editor = session();
    const id = editor.createComponent('nova.text', ROOT_ID, {
      props: { content: 'Created', variant: 'body' }
    });

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(childrenOf(editor).some((node) => node.id === id)).toBe(true);
    expect(editor.getState().selectedNodeIds).toEqual([id]);

    editor.updateNode(id, { props: { content: 'Updated' } });
    editor.renameNode(id, 'Welcome');

    const node = childrenOf(editor).find((candidate) => candidate.id === id);
    expect(node?.props.content).toBe('Updated');
    expect(node?.name).toBe('Welcome');
    expect(editor.getState().canUndo).toBe(true);
  });

  it('moves components between parents', () => {
    const editor = session();
    const containerId = editor.createComponent('nova.stack', ROOT_ID, {
      props: { direction: 'column', gap: 8 }
    });

    editor.moveNode(BUTTON_ID, containerId);

    expect(childrenOf(editor).some((node) => node.id === BUTTON_ID)).toBe(false);
    expect(childrenOf(editor, containerId).some((node) => node.id === BUTTON_ID)).toBe(true);
  });

  it('supports undo and redo through replacement proposals', () => {
    const editor = session();
    const before = editor.getState().revision;

    const id = editor.createComponent('nova.text', ROOT_ID, {
      props: { content: 'Temporary', variant: 'body' }
    });
    expect(childrenOf(editor).some((node) => node.id === id)).toBe(true);

    editor.undo();
    expect(childrenOf(editor).some((node) => node.id === id)).toBe(false);
    expect(editor.getState().canRedo).toBe(true);
    expect(editor.getState().revision).toBe(before + 2);

    editor.redo();
    expect(childrenOf(editor).some((node) => node.id === id)).toBe(true);
    expect(editor.getState().canRedo).toBe(false);
  });

  it('duplicates and copies components with new ids', () => {
    const editor = session();
    const duplicateId = editor.duplicateNode(TEXT_ID);

    expect(duplicateId).toBeDefined();
    expect(childrenOf(editor)).toHaveLength(3);
    expect(childrenOf(editor).some((node) => node.id === duplicateId)).toBe(true);

    editor.select([TEXT_ID]);
    editor.copy();
    const pastedIds = editor.paste(ROOT_ID);

    expect(pastedIds).toHaveLength(1);
    expect(pastedIds[0]).not.toBe(TEXT_ID);
    expect(childrenOf(editor)).toHaveLength(4);
  });

  it('applies layout, breakpoint, binding and workflow event edits', () => {
    const editor = session();
    const breakpoint = BREAKPOINTS[0] ?? ('base' as Breakpoint);

    editor.resizeNode(TEXT_ID, { padding: 12 });
    editor.setBreakpointOverride(TEXT_ID, breakpoint, { padding: 20 });
    editor.bindProp(TEXT_ID, 'content', { source: 'model', path: 'title' });
    editor.setWorkflowEvent(BUTTON_ID, 'click', WORKFLOW_ID);
    editor.setHidden(TEXT_ID, true);

    const text = childrenOf(editor).find((node) => node.id === TEXT_ID);
    expect(text?.layout).toEqual({ padding: 12 });
    expect(text?.breakpointOverrides?.[breakpoint]).toEqual({ padding: 20 });
    expect(text?.bindings?.content?.path).toBe('title');
    expect(text?.hidden).toBe(true);
    expect(childrenOf(editor).find((node) => node.id === BUTTON_ID)?.events?.click?.action).toBe(
      'runWorkflow'
    );
    expect(
      childrenOf(editor).find((node) => node.id === BUTTON_ID)?.events?.click?.params?.workflowId
    ).toBe(WORKFLOW_ID);
  });

  it('tracks selection, breakpoints, locks and subscriptions', () => {
    const editor = session();
    const listener = vi.fn();
    const unsubscribe = editor.subscribe(listener);

    editor.select([TEXT_ID, BUTTON_ID, TEXT_ID]);
    editor.setBreakpoint(BREAKPOINTS[0] ?? ('base' as Breakpoint));
    editor.toggleLock(TEXT_ID);

    expect(editor.getState().selectedNodeIds).toEqual([TEXT_ID, BUTTON_ID]);
    expect(editor.getState().lockedNodeIds).toContain(TEXT_ID);
    expect(listener).toHaveBeenCalledTimes(3);

    expect(() => editor.updateNode(TEXT_ID, { name: 'Blocked' })).toThrowError(NovaError);
    try {
      editor.updateNode(TEXT_ID, { name: 'Blocked' });
    } catch (error) {
      expect((error as NovaError).code).toBe(NovaErrorCodes.FORBIDDEN);
    }

    editor.toggleLock(TEXT_ID);
    expect(editor.getState().lockedNodeIds).not.toContain(TEXT_ID);
    unsubscribe();
  });
});
