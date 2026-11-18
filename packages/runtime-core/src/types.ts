import type { ComponentContract } from '@nova/contracts';
import type { RuntimePolicy } from './policy';
import type {
  AppDefinition,
  Breakpoint,
  WorkflowCondition,
  WorkflowDefinition,
  WorkflowStep
} from '@nova/spec';

export interface ComponentRegistryView {
  list(): readonly ComponentContract[];
}

export interface RuntimeEventBinding {
  action: string;
  params?: Record<string, unknown> | undefined;
}

export interface RuntimeNode {
  id: string;
  type: string;
  renderer: string;
  props: Record<string, unknown>;
  children: RuntimeNode[];
  slots: Record<string, RuntimeNode[]>;
  hidden: boolean;
  events: Record<string, RuntimeEventBinding>;
  validationIssues?: string[] | undefined;
}

export interface RuntimePage {
  id: string;
  name: string;
  route: string;
  root: RuntimeNode;
}

export interface RuntimeModel {
  appId: string;
  name: string;
  theme: AppDefinition['theme'];
  pages: RuntimePage[];
  workflows: WorkflowDefinition[];
}

export interface CreateRuntimeModelOptions {
  registry?: ComponentRegistryView;
  contracts?: readonly ComponentContract[];
  breakpoint?: Breakpoint;
  data?: Record<string, unknown>;
  now?: () => Date;
  policy?: RuntimePolicy | undefined;
}

export interface WorkflowContext {
  nodeId: string;
  pageId: string;
  event: string;
  payload: Record<string, unknown>;
  data: Record<string, unknown>;
}

export type WorkflowAction = (
  params: Record<string, unknown>,
  context: WorkflowContext
) => unknown | Promise<unknown>;

export interface WorkflowDataAccess {
  create?(params: Record<string, unknown>, context: WorkflowContext): unknown | Promise<unknown>;
  update?(params: Record<string, unknown>, context: WorkflowContext): unknown | Promise<unknown>;
  delete?(params: Record<string, unknown>, context: WorkflowContext): unknown | Promise<unknown>;
  select?(params: Record<string, unknown>, context: WorkflowContext): unknown | Promise<unknown>;
  request?(params: Record<string, unknown>, context: WorkflowContext): unknown | Promise<unknown>;
}

export interface WorkflowDeps {
  actions?: Record<string, WorkflowAction>;
  navigate?(target: string, context: WorkflowContext): unknown | Promise<unknown>;
  notify?(message: string, context: WorkflowContext): unknown | Promise<unknown>;
  dataAccess?: WorkflowDataAccess;
}

export type WorkflowActionType =
  | 'validateForm'
  | 'createRecord'
  | 'updateRecord'
  | 'deleteRecord'
  | 'apiRequest'
  | 'navigate'
  | 'showMessage'
  | 'condition'
  | 'setState';

export type { WorkflowCondition, WorkflowStep };
