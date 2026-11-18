const SENSITIVE_KEYS = new Set([
  'authorization',
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'secretref',
  'apikey'
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_]/g, '');
}

export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item));
  }

  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(record).map(([key, item]) => [
        key,
        SENSITIVE_KEYS.has(normalizeKey(key)) ? '[REDACTED]' : redactSensitive(item)
      ])
    );
  }

  return value;
}
