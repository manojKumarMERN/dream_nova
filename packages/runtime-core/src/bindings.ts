import { NovaError, NovaErrorCodes } from '@nova/errors';
import type { Binding } from '@nova/spec';

export interface ResolveBindingOptions {
  now?: () => Date;
  locale?: string;
  currency?: string;
}

const TRANSFORMS: ReadonlySet<string> = new Set([
  'identity',
  'string',
  'number',
  'boolean',
  'upper',
  'lower',
  'uppercase',
  'lowercase',
  'capitalize',
  'trim',
  'formatDate',
  'date',
  'datetime',
  'currency',
  'percent',
  'percentage',
  'json',
  'stringify',
  'parsejson',
  'first',
  'last',
  'length',
  'default',
  'format',
  'map',
  'join',
  'filter',
  'sum',
  'round',
  'abs',
  'slugify',
  'urlencode',
  'htmlencode'
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readPath(value: unknown, path: string): unknown {
  const segments = path.split('.').filter((segment) => segment.length > 0);
  let current = value;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) {
        return undefined;
      }
      current = current[index];
      continue;
    }
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function readSourceValue(binding: Binding, data: Record<string, unknown>): unknown {
  const kind = binding.kind ?? binding.source;

  if (kind === 'collection' && binding.collection !== undefined) {
    const collectionRoot = isRecord(data.collection) ? data.collection : data;
    const collection = readPath(collectionRoot, binding.collection);
    if (collection !== undefined) {
      const value = readPath(collection, binding.path);
      if (value !== undefined) {
        return value;
      }
    }
  }

  const scoped = data[kind];
  if (isRecord(scoped)) {
    const scopedValue = readPath(scoped, binding.path);
    if (scopedValue !== undefined) {
      return scopedValue;
    }
  }

  const directValue = readPath(data, binding.path);
  if (directValue !== undefined) {
    return directValue;
  }

  const qualifiedKey = `${kind}.${binding.path}`;
  return Object.prototype.hasOwnProperty.call(data, qualifiedKey) ? data[qualifiedKey] : undefined;
}

function applyTransform(
  value: unknown,
  transform: string,
  options: ResolveBindingOptions
): unknown {
  if (!TRANSFORMS.has(transform)) {
    throw new NovaError(NovaErrorCodes.VALIDATION_FAILED, 'Unsupported binding transform', {
      details: { transform }
    });
  }

  switch (transform) {
    case 'identity':
    case 'map':
      return value;
    case 'string':
    case 'format':
      return String(value ?? '');
    case 'number':
      return Number(value);
    case 'boolean':
      return Boolean(value);
    case 'upper':
    case 'uppercase':
      return String(value ?? '').toUpperCase();
    case 'lower':
    case 'lowercase':
      return String(value ?? '').toLowerCase();
    case 'trim':
      return String(value ?? '').trim();
    case 'capitalize': {
      const text = String(value ?? '');
      return text.length === 0 ? text : text[0]?.toUpperCase() + text.slice(1);
    }
    case 'formatDate':
    case 'date':
    case 'datetime': {
      const source = value ?? options.now?.() ?? new Date();
      const date = source instanceof Date ? source : new Date(String(source));
      if (Number.isNaN(date.getTime())) {
        return '';
      }
      return new Intl.DateTimeFormat(options.locale ?? 'en-US').format(date);
    }
    case 'currency': {
      const amount = Number(value);
      if (!Number.isFinite(amount)) {
        return '';
      }
      return new Intl.NumberFormat(options.locale ?? 'en-US', {
        style: 'currency',
        currency: options.currency ?? 'USD'
      }).format(amount);
    }
    case 'percent':
    case 'percentage': {
      const amount = Number(value);
      return Number.isFinite(amount) ? `${String(amount * 100)}%` : '';
    }
    case 'json':
    case 'stringify': {
      try {
        return JSON.stringify(value);
      } catch {
        return '';
      }
    }
    case 'parsejson': {
      try {
        return typeof value === 'string' ? JSON.parse(value) : value;
      } catch {
        return undefined;
      }
    }
    case 'first':
      return Array.isArray(value) ? value[0] : value;
    case 'last':
      return Array.isArray(value) ? value[value.length - 1] : value;
    case 'length':
      return Array.isArray(value) || typeof value === 'string' ? value.length : 0;
    case 'default':
      return value === undefined || value === null || value === '' ? '' : value;
    case 'join':
      return Array.isArray(value)
        ? value.map((item) => String(item)).join(',')
        : String(value ?? '');
    case 'filter':
      return Array.isArray(value) ? value.filter((item) => Boolean(item)) : value;
    case 'sum':
      return Array.isArray(value)
        ? value.reduce<number>((total, item) => total + Number(item || 0), 0)
        : Number(value);
    case 'round':
      return Math.round(Number(value));
    case 'abs':
      return Math.abs(Number(value));
    case 'slugify':
      return String(value ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    case 'urlencode':
      return encodeURIComponent(String(value ?? ''));
    case 'htmlencode':
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    default:
      return value;
  }
}

export function resolveBindingWithOptions(
  binding: Binding,
  data: Record<string, unknown>,
  options: ResolveBindingOptions = {}
): unknown {
  const value = readSourceValue(binding, data);
  return binding.transform === undefined
    ? value
    : applyTransform(value, binding.transform, options);
}

export function resolveBinding(binding: Binding, data: Record<string, unknown>): unknown {
  return resolveBindingWithOptions(binding, data);
}
