import type { ThemeTokenSet } from '@nova/spec';

function tokenKey(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export function resolveThemeComponentTokens(
  theme: ThemeTokenSet,
  componentType: string
): Record<string, unknown> {
  const components = theme.components ?? {};
  return {
    ...(isRecord(components['*']) ? components['*'] : {}),
    ...(isRecord(components[componentType]) ? components[componentType] : {})
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createThemeStyle(theme: ThemeTokenSet): Record<string, string> {
  const style: Record<string, string> = {};

  for (const [name, value] of Object.entries(theme.colors ?? {})) {
    style[`--nova-color-${tokenKey(name)}`] = value;
  }
  for (const [name, value] of Object.entries(theme.spacing ?? {})) {
    style[`--nova-space-${tokenKey(name)}`] = `${String(value)}px`;
  }
  for (const [name, value] of Object.entries(theme.typography ?? {})) {
    style[`--nova-font-${tokenKey(name)}`] = value;
  }
  for (const [name, value] of Object.entries(theme.borderRadius ?? {})) {
    style[`--nova-radius-${tokenKey(name)}`] = `${String(value)}px`;
  }
  for (const [name, value] of Object.entries(theme.shadows ?? {})) {
    style[`--nova-shadow-${tokenKey(name)}`] = value;
  }
  for (const [component, config] of Object.entries(theme.components ?? {})) {
    if (!isRecord(config)) {
      continue;
    }
    for (const [name, value] of Object.entries(config)) {
      if (typeof value === 'string' || typeof value === 'number') {
        style[`--nova-component-${tokenKey(component)}-${tokenKey(name)}`] = String(value);
      }
    }
  }

  return style;
}
