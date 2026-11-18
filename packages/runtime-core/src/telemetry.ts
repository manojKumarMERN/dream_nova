export type RuntimeTelemetryCategory =
  'initialization' | 'rendering' | 'action' | 'expression' | 'navigation' | 'loading';

export type RuntimeTelemetryLevel = 'info' | 'warn' | 'error';

export interface RuntimeTelemetryEvent {
  code: string;
  category: RuntimeTelemetryCategory;
  level: RuntimeTelemetryLevel;
  message: string;
  timestamp: string;
  correlationId: string;
  appId?: string | undefined;
  versionId?: string | undefined;
  requestId?: string | undefined;
  nodeId?: string | undefined;
  details?: Record<string, unknown> | undefined;
}

export interface RuntimeTelemetryAdapter {
  emit(event: RuntimeTelemetryEvent): void;
}

const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  'password',
  'token',
  'secret',
  'authorization',
  'cookie',
  'value',
  'values',
  'payload',
  'credential',
  'apikey'
]);

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > 2) {
    return '[truncated]';
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    return value.length > 160 ? `${value.slice(0, 160)}…` : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 10).map((item) => sanitizeValue(item, depth + 1));
  }
  if (typeof value !== 'object') {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SENSITIVE_KEYS.has(key.replace(/[^A-Za-z]/g, '').toLowerCase()))
      .map(([key, item]) => [key, sanitizeValue(item, depth + 1)])
      .filter(([, item]) => item !== undefined)
  );
}

export function sanitizeTelemetryDetails(
  details: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (details === undefined) {
    return undefined;
  }
  const sanitized = sanitizeValue(details, 0);
  return typeof sanitized === 'object' && sanitized !== null && !Array.isArray(sanitized)
    ? (sanitized as Record<string, unknown>)
    : undefined;
}

export function createNoopTelemetryAdapter(): RuntimeTelemetryAdapter {
  return { emit: () => undefined };
}

export function createConsoleTelemetryAdapter(): RuntimeTelemetryAdapter {
  return {
    emit: (event) => {
      const sanitized: RuntimeTelemetryEvent = {
        ...event,
        message: event.message.length > 240 ? `${event.message.slice(0, 240)}…` : event.message,
        ...(event.details === undefined ? {} : { details: sanitizeTelemetryDetails(event.details) })
      };
      if (sanitized.level === 'error') {
        console.error(JSON.stringify(sanitized));
      } else if (sanitized.level === 'warn') {
        console.warn(JSON.stringify(sanitized));
      }
    }
  };
}
