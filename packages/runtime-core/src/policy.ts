export interface RuntimeLimits {
  maxExpressionLength: number;
  maxExpressionTokens: number;
  maxExpressionDepth: number;
  maxEvalSteps: number;
  maxInterpolationDepth: number;
  maxInterpolatedLength: number;
  maxActionsPerEvent: number;
  maxNestedActionDepth: number;
  maxNestedActionLength: number;
  maxPathLength: number;
  maxPathSegments: number;
}

export interface RuntimePolicy {
  allowedActions?: readonly string[] | undefined;
  allowedExpressionFunctions?: readonly string[] | undefined;
  writableStateRoots?: readonly string[] | undefined;
  writableComponentProps?: readonly string[] | undefined;
  limits?: Partial<RuntimeLimits> | undefined;
}

const DEFAULT_LIMITS: RuntimeLimits = {
  maxExpressionLength: 512,
  maxExpressionTokens: 200,
  maxExpressionDepth: 24,
  maxEvalSteps: 2000,
  maxInterpolationDepth: 8,
  maxInterpolatedLength: 4096,
  maxActionsPerEvent: 64,
  maxNestedActionDepth: 8,
  maxNestedActionLength: 64,
  maxPathLength: 256,
  maxPathSegments: 32
};

const BLOCKED_SEGMENTS: ReadonlySet<string> = new Set([
  '__proto__',
  'prototype',
  'constructor',
  'eval',
  'function'
]);

export function resolveRuntimeLimits(policy?: RuntimePolicy | undefined): RuntimeLimits {
  const overrides = policy?.limits ?? {};
  const limit = (key: keyof RuntimeLimits): number => {
    const value = overrides[key];
    return typeof value === 'number' && Number.isFinite(value) && value > 0
      ? Math.floor(value)
      : DEFAULT_LIMITS[key];
  };
  return {
    maxExpressionLength: limit('maxExpressionLength'),
    maxExpressionTokens: limit('maxExpressionTokens'),
    maxExpressionDepth: limit('maxExpressionDepth'),
    maxEvalSteps: limit('maxEvalSteps'),
    maxInterpolationDepth: limit('maxInterpolationDepth'),
    maxInterpolatedLength: limit('maxInterpolatedLength'),
    maxActionsPerEvent: limit('maxActionsPerEvent'),
    maxNestedActionDepth: limit('maxNestedActionDepth'),
    maxNestedActionLength: limit('maxNestedActionLength'),
    maxPathLength: limit('maxPathLength'),
    maxPathSegments: limit('maxPathSegments')
  };
}

export function parseSafePath(
  path: string,
  limits: RuntimeLimits = resolveRuntimeLimits()
): string[] | undefined {
  if (path.length === 0 || path.length > limits.maxPathLength) {
    return undefined;
  }
  const segments = path.split('.').filter((segment) => segment.length > 0);
  if (segments.length === 0 || segments.length > limits.maxPathSegments) {
    return undefined;
  }
  if (segments.some((segment) => BLOCKED_SEGMENTS.has(segment))) {
    return undefined;
  }
  return segments;
}

export function isWritablePath(path: string, policy?: RuntimePolicy | undefined): boolean {
  const roots = policy?.writableStateRoots;
  if (roots === undefined) {
    return true;
  }
  return roots.some((root) => path === root.replace(/\.$/, '') || path.startsWith(root));
}

export function isWritableComponentProp(prop: string, policy?: RuntimePolicy | undefined): boolean {
  const props = policy?.writableComponentProps;
  if (props === undefined) {
    return true;
  }
  return props.includes(prop);
}
