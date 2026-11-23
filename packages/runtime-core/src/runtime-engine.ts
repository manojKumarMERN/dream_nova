import { RUNTIME_ACTIONS, validateRuntimeAction } from './actions';
import {
  contractIssueDescriptors,
  validateRuntimeDefinitionContracts
} from './contract-validation';
import {
  RUNTIME_EXPRESSION_FUNCTIONS,
  evaluateExpression,
  interpolateExpressions
} from './expressions';
import type { ExpressionContext } from './expressions';
import { MemoryNavigationAdapter, buildRuntimePath, resolveRuntimeRoute } from './navigation';
import type { RuntimeNavigationAdapter } from './navigation';
import {
  isWritableComponentProp,
  isWritablePath,
  parseSafePath,
  resolveRuntimeLimits,
  type RuntimePolicy
} from './policy';
import { createRuntimeModel } from './runtime-model';
import { RuntimeStateStore, createEmptyFormState, createInitialRuntimeState } from './state';
import type { RuntimeStateSnapshot } from './state';
import type { RuntimeActionDefinition } from './actions';
import {
  collectFormFields,
  findComponent,
  findFormForNode,
  validateFormValues
} from './validation';
import type { FormFieldDefinition } from './validation';
import {
  createNoopTelemetryAdapter,
  sanitizeTelemetryDetails,
  type RuntimeTelemetryAdapter
} from './telemetry';
import type { ComponentContract } from '@nova/contracts';
import type { AppDefinition, Breakpoint, ComponentNode } from '@nova/spec';

export interface RuntimeEngineEvent {
  nodeId: string;
  event: string;
  payload: unknown;
}

export interface RuntimeDataAccess {
  query?(params: Record<string, unknown>): unknown | Promise<unknown>;
  create?(params: Record<string, unknown>): unknown | Promise<unknown>;
  update?(params: Record<string, unknown>): unknown | Promise<unknown>;
  delete?(params: Record<string, unknown>): unknown | Promise<unknown>;
}

export interface CreateRuntimeEngineOptions {
  contracts: readonly ComponentContract[];
  breakpoint?: Breakpoint | undefined;
  navigation?: RuntimeNavigationAdapter | undefined;
  initialPath?: string | undefined;
  data?: Record<string, unknown> | undefined;
  dataAccess?: RuntimeDataAccess | undefined;
  onEvent?: ((event: RuntimeEngineEvent) => void) | undefined;
  onError?: ((error: { message: string; code?: string | undefined }) => void) | undefined;
  policy?: RuntimePolicy | undefined;
  telemetry?: RuntimeTelemetryAdapter | undefined;
  appId?: string | undefined;
  versionId?: string | undefined;
  requestId?: string | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function setAtPath(
  base: Record<string, unknown>,
  path: string,
  value: unknown,
  limits = resolveRuntimeLimits()
): Record<string, unknown> {
  const segments = parseSafePath(path, limits);
  if (segments === undefined) {
    return base;
  }
  const clone: Record<string, unknown> = { ...base };
  let cursor = clone;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (segment === undefined) {
      return base;
    }
    const child = cursor[segment];
    const next = isRecord(child) ? { ...child } : {};
    cursor[segment] = next;
    cursor = next;
  }
  const final = segments[segments.length - 1];
  if (final !== undefined) {
    cursor[final] = value;
  }
  return clone;
}

function payloadRecord(payload: unknown): Record<string, unknown> {
  return isRecord(payload) ? payload : {};
}

function initialFormValues(
  fields: readonly FormFieldDefinition[],
  definition: AppDefinition
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    const node = findComponent(definition, field.id);
    const value = node?.props.value;
    if (value !== undefined) {
      values[field.name] = value;
    }
  }
  return values;
}

export class RuntimeEngine {
  private readonly store: RuntimeStateStore;
  private breakpoint: Breakpoint;
  private readonly navigation: RuntimeNavigationAdapter;
  private readonly unsubscribeNavigation: () => void;
  private readonly limits;
  private readonly allowedFunctions: ReadonlySet<string>;
  private readonly telemetry: RuntimeTelemetryAdapter;
  private actionCount = 0;
  private disposed = false;

  constructor(
    private readonly definition: AppDefinition,
    private readonly options: CreateRuntimeEngineOptions
  ) {
    this.breakpoint = options.breakpoint ?? 'desktop';
    this.limits = resolveRuntimeLimits(options.policy);
    this.allowedFunctions =
      options.policy?.allowedExpressionFunctions === undefined
        ? RUNTIME_EXPRESSION_FUNCTIONS
        : new Set(options.policy.allowedExpressionFunctions);
    this.telemetry = options.telemetry ?? createNoopTelemetryAdapter();
    this.navigation = options.navigation ?? new MemoryNavigationAdapter(options.initialPath ?? '/');
    this.store = new RuntimeStateStore(createInitialRuntimeState());
    this.unsubscribeNavigation = this.navigation.subscribe(() => this.syncRoute());
    this.syncRoute();
    this.emitTelemetry(
      'RUNTIME_INITIALIZED',
      'initialization',
      'info',
      'Runtime engine initialized'
    );
    this.reportContractIssues();
  }

  getSnapshot = (): RuntimeStateSnapshot => this.store.getSnapshot();

  subscribe = (listener: () => void): (() => void) => this.store.subscribe(listener);

  getModel() {
    const snapshot = this.store.getSnapshot();
    const data = this.createExpressionData(snapshot, {}, {});
    return createRuntimeModel(this.definition, {
      contracts: this.options.contracts,
      breakpoint: this.breakpoint,
      data,
      policy: this.options.policy
    });
  }

  setBreakpoint(breakpoint: Breakpoint): void {
    if (this.breakpoint === breakpoint) {
      return;
    }
    this.breakpoint = breakpoint;
    this.store.set((current) => ({ ...current }));
  }

  navigate(path: string, replace = false): void {
    if (replace) {
      this.navigation.replace(path);
    } else {
      this.navigation.push(path);
    }
    this.syncRoute();
  }

  handleEvent = (event: RuntimeEngineEvent): void => {
    if (this.disposed) {
      return;
    }
    this.options.onEvent?.(event);
    const node = findComponent(this.definition, event.nodeId);
    if (node === undefined) {
      this.reportError(`Runtime event target not found: ${event.nodeId}`);
      return;
    }

    this.applyIntrinsicState(event, node);
    const binding = this.findBinding(node, event.event, event);
    if (binding === undefined) {
      return;
    }
    this.actionCount = 0;
    if (this.actionCount + 1 > this.limits.maxActionsPerEvent) {
      this.reportError('Runtime action quota exceeded', 'ACTION_QUOTA_EXCEEDED');
      return;
    }
    const issues = validateRuntimeAction(binding, this.options.policy);
    if (issues.length > 0) {
      this.emitTelemetry('ACTION_VALIDATION_FAILED', 'action', 'warn', 'Runtime action rejected', {
        issueCount: issues.length
      });
      this.reportError('Runtime action rejected', 'ACTION_REJECTED');
      return;
    }
    try {
      this.executeAction(binding, this.createActionContext(event, node, binding.params ?? {}));
    } catch (error) {
      this.reportError(error instanceof Error ? error.message : 'Runtime action failed');
    }
  };

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.unsubscribeNavigation();
    this.emitTelemetry('RUNTIME_DISPOSED', 'initialization', 'info', 'Runtime engine disposed');
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  private telemetryMessage(message: string): string {
    return message.length > 240 ? `${message.slice(0, 240)}…` : message;
  }

  private emitTelemetry(
    code: string,
    category: 'initialization' | 'rendering' | 'action' | 'expression' | 'navigation' | 'loading',
    level: 'info' | 'warn' | 'error',
    message: string,
    details?: Record<string, unknown> | undefined
  ): void {
    this.telemetry.emit({
      code,
      category,
      level,
      message: this.telemetryMessage(message),
      timestamp: new Date().toISOString(),
      correlationId: this.options.requestId ?? 'runtime-engine',
      ...(this.options.appId === undefined ? {} : { appId: this.options.appId }),
      ...(this.options.versionId === undefined ? {} : { versionId: this.options.versionId }),
      ...(details === undefined ? {} : { details: sanitizeTelemetryDetails(details) })
    });
  }

  private reportContractIssues(): void {
    const issues = validateRuntimeDefinitionContracts(this.definition, this.options.contracts);
    if (issues.length === 0) {
      return;
    }
    this.emitTelemetry(
      'COMPONENT_CONTRACT_INVALID',
      'rendering',
      'warn',
      'Component contract issues detected',
      {
        issueCount: issues.length,
        descriptors: contractIssueDescriptors(issues)
      }
    );
  }

  private reportError(message: string, code?: string | undefined): void {
    this.store.addError({ message, ...(code === undefined ? {} : { code }) });
    this.options.onError?.({ message, ...(code === undefined ? {} : { code }) });
    this.emitTelemetry(code ?? 'RUNTIME_ERROR', 'action', 'error', message);
  }

  private syncRoute(): void {
    const location = this.navigation.getLocation();
    const resolved = resolveRuntimeRoute(this.definition.pages, location);
    if (resolved === undefined) {
      this.reportError('Application has no pages');
      return;
    }
    this.store.setRoute({
      pathname: resolved.pathname,
      pageId: resolved.page.id,
      params: resolved.params,
      query: resolved.query
    });
  }

  private findBinding(
    node: ComponentNode,
    eventName: string,
    event: RuntimeEngineEvent
  ): RuntimeActionDefinition | undefined {
    const binding = node.events?.[eventName];
    if (binding !== undefined) {
      return binding;
    }
    if (eventName === 'navigate') {
      const href = payloadRecord(event.payload).href;
      return typeof href === 'string' ? { action: 'navigate', params: { href } } : undefined;
    }
    if (eventName === 'submit' && node.type === 'nova.form') {
      return {
        action: 'validateForm',
        params: {
          formId: node.id,
          ...(isRecord(node.props.values) ? { values: node.props.values } : {})
        }
      };
    }
    return undefined;
  }

  private applyIntrinsicState(event: RuntimeEngineEvent, node: ComponentNode): void {
    const payload = payloadRecord(event.payload);
    if (payload.value !== undefined) {
      this.store.updateComponent(event.nodeId, { value: payload.value });
    }
    if (payload.checked !== undefined) {
      this.store.updateComponent(event.nodeId, { checked: payload.checked });
    }
    const form = findFormForNode(this.definition, event.nodeId);
    if (form === undefined || payload.value === undefined) {
      return;
    }
    const field =
      typeof node.props.name === 'string' && node.props.name.length > 0 ? node.props.name : node.id;
    this.store.updateForm(form.id, (current) => ({
      ...current,
      values: { ...current.values, [field]: payload.value }
    }));
  }

  private createExpressionData(
    snapshot: RuntimeStateSnapshot,
    eventData: Record<string, unknown>,
    params: Record<string, unknown>
  ): ExpressionContext {
    const page = this.definition.pages.find((candidate) => candidate.id === snapshot.route.pageId);
    return {
      ...(this.options.data ?? {}),
      state: snapshot.app,
      app: snapshot.app,
      components: snapshot.components,
      forms: snapshot.forms,
      hidden: snapshot.hidden,
      page: {
        id: snapshot.route.pageId ?? '',
        name: page?.name ?? '',
        route: page?.route ?? snapshot.route.pathname,
        params: snapshot.route.params,
        query: snapshot.route.query
      },
      event: eventData,
      payload: eventData,
      params
    };
  }

  private createActionContext(
    event: RuntimeEngineEvent,
    node: ComponentNode,
    params: Record<string, unknown>
  ): ExpressionContext {
    return {
      ...this.createExpressionData(this.store.getSnapshot(), payloadRecord(event.payload), {
        ...params,
        nodeId: event.nodeId,
        eventName: event.event
      }),
      nodeId: event.nodeId,
      eventName: event.event
    };
  }

  private resolveValue(value: unknown, context: ExpressionContext): unknown {
    if (typeof value === 'string' && (value.includes('{{') || this.isExpression(value))) {
      return interpolateExpressions(value, context, this.limits, this.allowedFunctions);
    }
    if (typeof value === 'string' && this.isExpression(value)) {
      return evaluateExpression(value, context, this.limits, this.allowedFunctions);
    }
    return value;
  }

  private isExpression(value: string): boolean {
    return /^(?:state|app|components|forms|hidden|page|data|params|payload|event)\.[A-Za-z0-9_.]+$/.test(
      value
    );
  }

  private executeAction(action: RuntimeActionDefinition, context: ExpressionContext): void {
    const allowed = this.options.policy?.allowedActions ?? RUNTIME_ACTIONS;
    if (
      !(RUNTIME_ACTIONS as readonly string[]).includes(action.action) ||
      !(allowed as readonly string[]).includes(action.action)
    ) {
      this.reportError('Runtime action rejected', 'ACTION_REJECTED');
      return;
    }
    if (this.actionCount >= this.limits.maxActionsPerEvent) {
      this.reportError('Runtime action quota exceeded', 'ACTION_QUOTA_EXCEEDED');
      return;
    }
    this.actionCount += 1;
    const rawParams = action.params ?? {};
    const params = Object.fromEntries(
      Object.entries(rawParams).map(([key, value]) => [key, this.resolveValue(value, context)])
    );
    switch (action.action) {
      case 'setState': {
        const pathValue = rawParams.path;
        if (typeof pathValue !== 'string') {
          return;
        }
        if (!isWritablePath(pathValue, this.options.policy)) {
          this.reportError('State path is not writable', 'STATE_WRITE_REJECTED');
          return;
        }
        this.store.updateApp(
          setAtPath(this.store.getSnapshot().app, pathValue, params.value, this.limits)
        );
        return;
      }
      case 'setComponentState': {
        const target =
          typeof params.nodeId === 'string' ? params.nodeId : String(context.nodeId ?? '');
        const pathValue = rawParams.path;
        if (typeof pathValue !== 'string' || target.length === 0) {
          return;
        }
        const current = this.store.getSnapshot().components[target] ?? {};
        this.store.updateComponent(
          target,
          setAtPath(current, pathValue, params.value, this.limits)
        );
        return;
      }
      case 'setFormValue': {
        const formId =
          typeof params.formId === 'string' ? params.formId : this.currentFormId(context);
        const field = params.field;
        if (formId.length === 0 || typeof field !== 'string') {
          return;
        }
        this.store.updateForm(formId, (current) => ({
          ...current,
          values: { ...current.values, [field]: params.value }
        }));
        return;
      }
      case 'showComponent':
      case 'hideComponent':
      case 'toggleComponent': {
        const target = String(params.target ?? '');
        if (target.length === 0) {
          return;
        }
        const current = this.store.getSnapshot().hidden[target] ?? false;
        const next =
          action.action === 'showComponent'
            ? false
            : action.action === 'hideComponent'
              ? true
              : !current;
        this.store.setHidden(target, next);
        return;
      }
      case 'openModal':
      case 'closeModal': {
        const target = String(params.target ?? '');
        if (target.length === 0) {
          return;
        }
        this.store.updateComponent(target, { open: action.action === 'openModal' });
        return;
      }
      case 'navigate': {
        const target = this.resolveNavigationTarget(params);
        if (target === undefined) {
          this.reportError('Navigation action has no valid target');
          return;
        }
        this.navigate(target);
        return;
      }
      case 'validateForm': {
        const formId =
          typeof params.formId === 'string' ? params.formId : this.currentFormId(context);
        if (formId.length === 0) {
          return;
        }
        this.validateForm(formId, params, context);
        return;
      }
      case 'showMessage': {
        const message = String(params.message ?? '');
        if (message.length > 0) {
          this.store.addMessage('info', message);
        }
        return;
      }
      case 'setLoading': {
        const target = String(params.target ?? '');
        if (target.length === 0) {
          return;
        }
        const loading = typeof params.loading === 'boolean' ? params.loading : true;
        if (this.store.getSnapshot().forms[target] !== undefined) {
          this.store.updateForm(target, (current) => ({ ...current, loading }));
        } else {
          this.store.updateComponent(target, { loading });
        }
        return;
      }
      case 'resetForm': {
        const formId =
          typeof params.formId === 'string' ? params.formId : this.currentFormId(context);
        const formNode = findComponent(this.definition, formId);
        if (formNode === undefined) {
          return;
        }
        const values = initialFormValues(collectFormFields(formNode), this.definition);
        this.store.updateForm(formId, () => ({ ...createEmptyFormState(), values }));
        return;
      }
      case 'setComponentProp': {
        const target = String(params.target ?? '');
        const prop = params.prop;
        if (target.length === 0 || typeof prop !== 'string') {
          return;
        }
        if (!isWritableComponentProp(prop, this.options.policy)) {
          this.reportError('Component prop is not writable', 'COMPONENT_PROP_REJECTED');
          return;
        }
        this.store.updateComponent(target, { [prop]: params.value });
        return;
      }
      case 'queryData':
      case 'createRecord':
      case 'updateRecord':
      case 'deleteRecord': {
        void this.executeDataAction(action.action, params, rawParams.path);
        return;
      }
    }
  }

  private async executeDataAction(
    action: 'queryData' | 'createRecord' | 'updateRecord' | 'deleteRecord',
    params: Record<string, unknown>,
    targetPath: unknown
  ): Promise<void> {
    const access = this.options.dataAccess;
    if (access === undefined) {
      this.reportError('No data access handler is configured', 'DATA_ACCESS_MISSING');
      return;
    }
    try {
      const handler =
        action === 'queryData'
          ? access.query
          : action === 'createRecord'
            ? access.create
            : action === 'updateRecord'
              ? access.update
              : access.delete;
      if (handler === undefined) {
        throw new Error(`Unsupported data action: ${action}`);
      }
      const result = await handler({ ...params });
      if (typeof targetPath === 'string' && targetPath.length > 0) {
        if (!isWritablePath(targetPath, this.options.policy)) {
          this.reportError('Data result path is not writable', 'STATE_WRITE_REJECTED');
          return;
        }
        this.store.updateApp(
          setAtPath(this.store.getSnapshot().app, targetPath, result, this.limits)
        );
      }
    } catch (error) {
      this.reportError(
        error instanceof Error ? error.message : 'Data action failed',
        'DATA_ACTION_FAILED'
      );
    }
  }

  private resolveNavigationTarget(params: Record<string, unknown>): string | undefined {
    const pageId = typeof params.pageId === 'string' ? params.pageId : undefined;
    const page =
      pageId === undefined
        ? undefined
        : this.definition.pages.find((candidate) => candidate.id === pageId);
    if (page !== undefined) {
      return buildRuntimePath(page, asStringRecord(params.params), asStringRecord(params.query));
    }
    const href =
      typeof params.href === 'string'
        ? params.href
        : typeof params.route === 'string'
          ? params.route
          : typeof params.target === 'string'
            ? params.target
            : undefined;
    if (href === undefined) {
      return undefined;
    }
    if (href.startsWith('#') || /^(?:javascript|data|vbscript):/i.test(href)) {
      this.reportError('Navigation target is not allowed', 'NAVIGATION_REJECTED');
      return undefined;
    }
    const directPage = this.definition.pages.find((candidate) => candidate.route === href);
    if (directPage !== undefined) {
      return buildRuntimePath(
        directPage,
        asStringRecord(params.params),
        asStringRecord(params.query)
      );
    }
    return href;
  }

  private currentFormId(context: ExpressionContext): string {
    const nodeId = typeof context['nodeId'] === 'string' ? context['nodeId'] : '';
    const form = findFormForNode(this.definition, nodeId);
    return form?.id ?? '';
  }

  private validateForm(
    formId: string,
    params: Record<string, unknown>,
    context: ExpressionContext
  ): void {
    const formNode = findComponent(this.definition, formId);
    if (formNode === undefined) {
      return;
    }
    const fields = collectFormFields(formNode);
    const submitted =
      this.store.getSnapshot().forms[formId]?.values ?? initialFormValues(fields, this.definition);
    const values = isRecord(params.values) ? { ...submitted, ...params.values } : submitted;
    const result = validateFormValues(fields, values);
    this.store.updateForm(formId, (current) => ({
      ...current,
      values,
      errors: result.errors,
      formErrors: result.formErrors,
      submitted: true,
      loading: false,
      ...(result.valid
        ? { success: 'Form submitted successfully', failure: undefined }
        : { failure: 'Please correct the highlighted fields', success: undefined })
    }));

    for (const [nodeId, error] of Object.entries(result.errors)) {
      const field = fields.find(
        (candidate) => candidate.name === nodeId || candidate.id === nodeId
      );
      if (field !== undefined) {
        this.store.updateComponent(field.id, { error });
      }
    }
    if (!result.valid) {
      this.store.addMessage('error', 'Form validation failed');
      return;
    }
    const nested = params.onSuccess;
    if (Array.isArray(nested)) {
      this.executeNested(nested, context, 1);
    }
  }

  private executeNested(
    actions: readonly unknown[],
    context: ExpressionContext,
    depth: number
  ): void {
    if (depth > this.limits.maxNestedActionDepth) {
      this.reportError('Nested runtime action depth exceeded', 'ACTION_QUOTA_EXCEEDED');
      return;
    }
    if (actions.length > this.limits.maxNestedActionLength) {
      this.reportError('Nested runtime action quota exceeded', 'ACTION_QUOTA_EXCEEDED');
      return;
    }
    for (const item of actions) {
      if (!isRecord(item)) {
        continue;
      }
      const issues = validateRuntimeAction(item, this.options.policy, depth);
      if (issues.length > 0) {
        this.emitTelemetry(
          'ACTION_VALIDATION_FAILED',
          'action',
          'warn',
          'Nested runtime action rejected',
          {
            issueCount: issues.length,
            depth
          }
        );
        this.reportError('Runtime action rejected', 'ACTION_REJECTED');
        continue;
      }
      this.executeAction(item as unknown as RuntimeActionDefinition, context);
    }
  }
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  );
}

export function createRuntimeEngine(
  definition: AppDefinition,
  options: CreateRuntimeEngineOptions
): RuntimeEngine {
  return new RuntimeEngine(definition, options);
}
