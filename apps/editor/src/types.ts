import type { ComponentInspectorField, ResizeConstraints } from '@nova/contracts';
import type {
  EditorSession as CoreEditorSession,
  EditorState as CoreEditorState
} from '@nova/editor-core';
import type {
  AppDefinition,
  Binding,
  Breakpoint as SpecBreakpoint,
  ComponentLayout,
  ComponentNode
} from '@nova/spec';

export type Breakpoint = SpecBreakpoint;

export const BREAKPOINTS: readonly Breakpoint[] = ['desktop', 'tablet', 'mobile'];

export type EditorState = CoreEditorState;

export type InspectorControl = ComponentInspectorField['widget'];

export interface FieldOption {
  label: string;
  value: string;
}

export interface InspectorField {
  key: string;
  label?: string;
  control?: InspectorControl;
  options?: FieldOption[];
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  description?: string;
}

export type InspectorGroupId =
  'content' | 'appearance' | 'layout' | 'typography' | 'spacing' | 'responsive' | 'advanced';

export interface InspectorGroup {
  id: InspectorGroupId;
  title: string;
  fields: InspectorField[];
}

export interface InspectorContract {
  type: string;
  version: string;
  displayName: string;
  category: string;
  description?: string;
  icon?: string;
  propsSchema: Record<string, unknown>;
  defaults: Record<string, unknown>;
  events: Record<string, { description: string }>;
  slots: Record<string, { allows?: string[]; multiple: boolean }>;
  inspector?: InspectorGroup[];
  readiness: 'core' | 'progressive';
  resize?: ResizeConstraints;
  supportedBreakpoints?: readonly Breakpoint[];
}

export interface DropTarget {
  parentId: string | null;
  slot: string;
  index: number;
  pageId?: string;
}

export interface WorkflowStep {
  id: string;
  kind: 'trigger' | 'condition' | 'action' | 'error';
  type: string;
  params: Record<string, unknown>;
}

export interface WorkflowDefinition {
  steps: WorkflowStep[];
}

export interface WorkflowRef {
  nodeId: string;
  eventName: string;
}

export type ProposalChange =
  | { op: 'update'; nodeId: string; props: Record<string, unknown> }
  | { op: 'add'; parentId: string | null; slot: string; node: ComponentNode }
  | { op: 'delete'; nodeIds: string[] }
  | { op: 'rename'; nodeId: string; name: string };

export interface Proposal {
  id: string;
  summary: string;
  changes: ProposalChange[];
  definition?: AppDefinition;
  baseVersionId?: string;
  changeProposal?: unknown;
}

export interface VersionRecord {
  id: string;
  label: string;
  createdAt: string;
}

export interface AppSummaryRecord {
  id: string;
  name: string;
  slug: string;
  status: string;
}

export interface Toast {
  id: string;
  kind: 'success' | 'error' | 'info';
  message: string;
}

export interface RuntimeModel {
  definition: AppDefinition;
  breakpoint: Breakpoint;
  data: Record<string, unknown>;
  resolveProps(node: ComponentNode): Record<string, unknown>;
}

export interface EditorSessionLike {
  getState(): EditorState;
  getDefinition(): AppDefinition;
  subscribe(listener: (state: EditorState) => void): () => void;
  select(ids: string[]): void;
  setBreakpoint(breakpoint: Breakpoint): void;
  createComponent(type: string, target?: DropTarget): string;
  updateNode(id: string, patch: Partial<ComponentNode>): void;
  moveNode(id: string, target: DropTarget): void;
  moveNodes(ids: readonly string[], target: DropTarget): void;
  resizeNode(id: string, layout: ComponentLayout): void;
  setBreakpointOverride(id: string, layout: ComponentLayout | null): void;
  bindProp(id: string, prop: string, binding: Binding | null): void;
  setWorkflowEvent(id: string, eventName: string, workflow: WorkflowDefinition): void;
  setHidden(id: string, hidden: boolean): void;
  renameNode(id: string, name: string): void;
  duplicateNode(id: string): string | undefined;
  deleteNodes(ids: readonly string[]): void;
  copy(ids?: readonly string[]): void;
  paste(target?: DropTarget): string[];
  toggleLock(id: string): void;
  addPage(name?: string, route?: string): string;
  renamePage(pageId: string, name: string): void;
  removePage(pageId: string): void;
  undo(): void;
  redo(): void;
  replaceDefinition(definition: AppDefinition): void;
  applyProposal(proposal: Parameters<CoreEditorSession['applyProposal']>[0]): void;
}

export interface SaveOptions {
  label?: string;
  parentVersionId?: string;
  autosave?: boolean;
}

export interface SaveResult {
  appId: string;
  versionId: string;
  versionNumber?: number;
  remote: boolean;
  localOnly: boolean;
}
