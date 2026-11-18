import { NovaError, NovaErrorCodes } from '@nova/errors';
import type { ComponentContract } from '@nova/contracts';
import { BREAKPOINTS, type AppDefinition, type Breakpoint, type ComponentNode } from '@nova/spec';
import { resolveBindingWithOptions } from './bindings';
import { validateRuntimeDefinitionContracts } from './contract-validation';
import { RUNTIME_EXPRESSION_FUNCTIONS, interpolateExpressions } from './expressions';
import type { ExpressionContext } from './expressions';
import { resolveRuntimeLimits, type RuntimeLimits } from './policy';
import type {
  CreateRuntimeModelOptions,
  RuntimeEventBinding,
  RuntimeModel,
  RuntimeNode,
  RuntimePage
} from './types';

const STYLE_KEYS = [
  'alignItems',
  'alignSelf',
  'backgroundColor',
  'border',
  'borderColor',
  'borderRadius',
  'bottom',
  'boxShadow',
  'color',
  'direction',
  'display',
  'flex',
  'flexDirection',
  'flexWrap',
  'fontSize',
  'fontWeight',
  'gap',
  'gridColumns',
  'gridRows',
  'gridTemplateColumns',
  'height',
  'justifyContent',
  'left',
  'margin',
  'maxHeight',
  'maxWidth',
  'minHeight',
  'minWidth',
  'opacity',
  'overflow',
  'padding',
  'position',
  'right',
  'textAlign',
  'top',
  'width'
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}

function booleanRecord(value: unknown): Record<string, boolean> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === 'boolean'
    )
  );
}

function alignValue(value: unknown): unknown {
  if (value === 'start') {
    return 'flex-start';
  }
  if (value === 'end') {
    return 'flex-end';
  }
  if (value === 'between') {
    return 'space-between';
  }
  return value;
}

function pickStyle(parts: readonly Record<string, unknown>[]): Record<string, unknown> {
  const style: Record<string, unknown> = {};
  for (const part of parts) {
    for (const key of STYLE_KEYS) {
      const value = part[key];
      if (
        value === undefined ||
        key === 'direction' ||
        key === 'gridColumns' ||
        key === 'gridRows'
      ) {
        continue;
      }
      style[key] = alignValue(value);
    }
    if (part.direction !== undefined) {
      style.flexDirection = part.direction;
    }
    if (typeof part.gridColumns === 'number') {
      style.gridTemplateColumns = `repeat(${String(part.gridColumns)}, minmax(0, 1fr))`;
    }
    if (typeof part.gridRows === 'number') {
      style.gridTemplateRows = `repeat(${String(part.gridRows)}, minmax(0, 1fr))`;
    }
  }
  return style;
}

function resolveContracts(options: CreateRuntimeModelOptions): readonly ComponentContract[] {
  if (options.contracts !== undefined) {
    return options.contracts;
  }
  if (options.registry !== undefined) {
    return options.registry.list();
  }
  throw new NovaError(
    NovaErrorCodes.VALIDATION_FAILED,
    'A component registry or explicit contracts are required to create a runtime model'
  );
}

function findContract(
  node: ComponentNode,
  contracts: readonly ComponentContract[]
): ComponentContract | undefined {
  return (
    contracts.find(
      (candidate) => candidate.type === node.type && candidate.version === node.contractVersion
    ) ?? contracts.find((candidate) => candidate.type === node.type)
  );
}

function readEvents(node: ComponentNode): Record<string, RuntimeEventBinding> {
  const events: Record<string, RuntimeEventBinding> = {};
  for (const [name, binding] of Object.entries(node.events ?? {})) {
    events[name] = {
      action: binding.action,
      ...(binding.params === undefined ? {} : { params: { ...binding.params } })
    };
  }
  return events;
}

interface BuildContext {
  contracts: readonly ComponentContract[];
  data: Record<string, unknown>;
  breakpoint: Breakpoint;
  hidden: Record<string, boolean>;
  validationIssues: Map<string, string[]>;
  limits: RuntimeLimits;
  allowedFunctions: ReadonlySet<string>;
  now?: () => Date;
}

function issuesFor(node: ComponentNode, context: BuildContext): string[] | undefined {
  const issues = context.validationIssues.get(node.id);
  return issues === undefined || issues.length === 0 ? undefined : [...issues];
}

function buildDescendants(
  node: ComponentNode,
  context: BuildContext
): Pick<RuntimeNode, 'children' | 'slots'> {
  const slots: Record<string, RuntimeNode[]> = {};
  for (const [name, nodes] of Object.entries(node.slots ?? {})) {
    slots[name] = nodes.map((child) => buildNode(child, context));
  }
  return {
    children: (node.children ?? []).map((child) => buildNode(child, context)),
    slots
  };
}

function isHidden(node: ComponentNode, context: BuildContext): boolean {
  return context.hidden[node.id] ?? node.hidden ?? false;
}

function buildFallbackNode(node: ComponentNode, context: BuildContext): RuntimeNode {
  const descendants = buildDescendants(node, context);
  return {
    id: node.id,
    type: node.type,
    renderer: 'nova-web/fallback',
    props: {
      ...toRecord(node.props),
      componentType: node.type,
      contractVersion: node.contractVersion,
      label: `Unknown component: ${node.type}`
    },
    ...descendants,
    hidden: isHidden(node, context),
    events: readEvents(node),
    ...(issuesFor(node, context) === undefined
      ? {}
      : { validationIssues: issuesFor(node, context) })
  };
}

function buildNode(node: ComponentNode, context: BuildContext): RuntimeNode {
  const contract = findContract(node, context.contracts);
  if (contract === undefined) {
    return buildFallbackNode(node, context);
  }
  const renderer = contract.renderers.web;
  if (renderer === undefined || renderer.length === 0) {
    return buildFallbackNode(node, context);
  }

  const expressionContext = context.data as ExpressionContext;
  const override = interpolateExpressions(
    node.breakpointOverrides?.[context.breakpoint],
    expressionContext,
    context.limits,
    context.allowedFunctions
  );
  const overrideProps = toRecord(override);
  const layoutProps = toRecord(
    interpolateExpressions(node.layout, expressionContext, context.limits, context.allowedFunctions)
  );
  const componentStates = toRecord(context.data.components);
  const componentState = toRecord(componentStates[node.id]);
  const props = toRecord(
    interpolateExpressions(
      {
        ...toRecord(contract.defaults),
        ...toRecord(node.props),
        ...layoutProps,
        ...overrideProps,
        ...componentState
      },
      expressionContext,
      context.limits,
      context.allowedFunctions
    )
  );

  for (const [name, binding] of Object.entries(node.bindings ?? {})) {
    props[name] = resolveBindingWithOptions(binding, context.data, {
      ...(context.now === undefined ? {} : { now: context.now })
    });
  }

  const style = pickStyle([layoutProps, overrideProps]);
  if (Object.keys(style).length > 0 && props.style === undefined) {
    props.style = style;
  }

  return {
    id: node.id,
    type: node.type,
    renderer,
    props,
    ...buildDescendants(node, context),
    hidden: isHidden(node, context),
    events: readEvents(node),
    ...(issuesFor(node, context) === undefined
      ? {}
      : { validationIssues: issuesFor(node, context) })
  };
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
    for (const slotNodes of Object.values(node.slots ?? {})) {
      const slotChild = findNode(slotNodes, nodeId);
      if (slotChild !== undefined) {
        return slotChild;
      }
    }
  }
  return undefined;
}

function defaultBreakpoint(): Breakpoint {
  return BREAKPOINTS[0] ?? ('base' as Breakpoint);
}

export function createRuntimeModel(
  definition: AppDefinition,
  options: CreateRuntimeModelOptions = {}
): RuntimeModel {
  const contracts = resolveContracts(options);
  const data = options.data ?? {};
  const limits = resolveRuntimeLimits(options.policy);
  const allowedFunctions =
    options.policy?.allowedExpressionFunctions === undefined
      ? RUNTIME_EXPRESSION_FUNCTIONS
      : new Set(options.policy.allowedExpressionFunctions);
  const validationIssues = new Map<string, string[]>();
  for (const issue of validateRuntimeDefinitionContracts(definition, contracts)) {
    const existing = validationIssues.get(issue.nodeId) ?? [];
    existing.push(`${issue.path}: ${issue.message}`);
    validationIssues.set(issue.nodeId, existing);
  }
  const context: BuildContext = {
    contracts,
    data,
    breakpoint: options.breakpoint ?? defaultBreakpoint(),
    hidden: booleanRecord(data.hidden),
    validationIssues,
    limits,
    allowedFunctions,
    ...(options.now === undefined ? {} : { now: options.now })
  };

  const pages: RuntimePage[] = definition.pages.map((page) => {
    const rootNode = findNode(definition.components, page.rootNodeId);
    if (rootNode === undefined) {
      throw new NovaError(NovaErrorCodes.VALIDATION_FAILED, 'Page root node is missing', {
        details: { pageId: page.id, rootNodeId: page.rootNodeId }
      });
    }
    return {
      id: page.id,
      name: page.name,
      route: page.route,
      root: buildNode(rootNode, context)
    };
  });

  return {
    appId: definition.appId,
    name: definition.name,
    theme: definition.theme,
    pages,
    workflows: definition.workflows
  };
}
