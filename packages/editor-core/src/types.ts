import type { ComponentRegistry } from '@nova/component-registry';
import type { ChangeProposal, ComponentPatch } from '@nova/proposal-model';
import type {
  AppDefinition,
  Binding,
  Breakpoint,
  ComponentLayout,
  ComponentNode
} from '@nova/spec';

export interface EditorState {
  definition: AppDefinition;
  selectedNodeIds: string[];
  breakpoint: Breakpoint;
  lockedNodeIds: string[];
  clipboard: ComponentNode[];
  canUndo: boolean;
  canRedo: boolean;
  revision: number;
}

export type EditorComponentPatch = ComponentPatch;

export interface CreateComponentOptions {
  slot?: string | undefined;
  index?: number | undefined;
  props?: Record<string, unknown> | undefined;
}

export interface EditorSession {
  getState(): EditorState;
  subscribe(listener: (state: EditorState) => void): () => void;
  getDefinition(): AppDefinition;
  select(ids: string[]): void;
  setBreakpoint(breakpoint: Breakpoint): void;
  applyProposal(proposal: ChangeProposal): void;
  createComponent(type: string, parentId: string, options?: CreateComponentOptions): string;
  updateNode(nodeId: string, patch: ComponentPatch): void;
  moveNode(nodeId: string, parentId: string, index?: number, slot?: string): void;
  resizeNode(nodeId: string, layout: ComponentLayout): void;
  setBreakpointOverride(
    nodeId: string,
    breakpoint: Breakpoint,
    layout: ComponentLayout | null
  ): void;
  bindProp(nodeId: string, prop: string, binding: Binding | null): void;
  setWorkflowEvent(nodeId: string, event: string, workflowId: string | null): void;
  setHidden(nodeId: string, hidden: boolean): void;
  renameNode(nodeId: string, name: string): void;
  duplicateNode(nodeId: string): string | undefined;
  deleteNodes(nodeIds: string[]): void;
  copy(): void;
  paste(parentId?: string, slot?: string): string[];
  toggleLock(nodeId: string): void;
  undo(): void;
  redo(): void;
  replaceDefinition(definition: AppDefinition): void;
}

export interface CreateEditorSessionOptions {
  definition: AppDefinition;
  registry?: ComponentRegistry | undefined;
}
