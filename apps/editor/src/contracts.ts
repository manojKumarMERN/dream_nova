import { BUILT_IN_COMPONENT_CONTRACTS } from '@nova/component-registry';
import { COMPONENT_CATEGORIES } from '@nova/contracts';
import type { ComponentContract } from '@nova/contracts';
import { loadContracts as loadRemoteContracts } from './sdk';
import type {
  InspectorContract,
  InspectorControl,
  InspectorField,
  InspectorGroup,
  InspectorGroupId
} from './types';

export const ALL_CATEGORIES: readonly string[] = COMPONENT_CATEGORIES;

type JsonSchema = Record<string, unknown>;

const GROUP_TITLES: Record<InspectorGroupId, string> = {
  content: 'Content',
  appearance: 'Appearance',
  layout: 'Layout',
  typography: 'Typography',
  spacing: 'Spacing',
  responsive: 'Responsive',
  advanced: 'Advanced'
};

const GROUP_ORDER: readonly InspectorGroupId[] = [
  'content',
  'appearance',
  'layout',
  'typography',
  'spacing',
  'responsive',
  'advanced'
];

const PROGRESSIVE_CATEGORIES = new Set(['data', 'navigation', 'feedback']);

function labelFor(key: string, schema: JsonSchema): string {
  if (typeof schema.title === 'string' && schema.title.length > 0) {
    return schema.title;
  }
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
}

function controlFor(key: string, schema: JsonSchema): InspectorControl {
  if (schema.format === 'color' || /color|colour/i.test(key)) {
    return 'color';
  }
  if (/image|src|icon/i.test(key)) {
    return 'image';
  }
  if (key === 'workflow' || /workflow/i.test(key)) {
    return 'workflow';
  }
  if (key === 'binding' || /binding/i.test(key)) {
    return 'binding';
  }
  if (/json|options|columns|rows|data|items|links/i.test(key)) {
    return 'json';
  }
  if (Array.isArray(schema.enum)) {
    return 'select';
  }
  if (schema.type === 'boolean') {
    return 'boolean';
  }
  if (schema.type === 'number' || schema.type === 'integer') {
    return 'number';
  }
  if (key === 'content' || key === 'description' || key === 'text' || key === 'message') {
    return 'textarea';
  }
  return 'text';
}

function groupFor(key: string, control: InspectorControl): InspectorGroupId {
  if (/font|textAlign|align$|level|truncate|underline|variant/i.test(key)) {
    return 'typography';
  }
  if (/gap|padding|margin|inset|spacing/i.test(key)) {
    return 'spacing';
  }
  if (
    /width|height|direction|alignItems|justifyContent|wrap|display|columns|rows|orientation|position|placement|sticky|compact|reverse|overflow|fit/i.test(
      key
    )
  ) {
    return 'layout';
  }
  if (
    /color|background|border|shadow|radius|tone|elevation|disabled|visible|open|loading|spin|dot/i.test(
      key
    )
  ) {
    return 'appearance';
  }
  if (
    control === 'json' ||
    control === 'workflow' ||
    control === 'binding' ||
    /class|id|advanced/i.test(key)
  ) {
    return 'advanced';
  }
  return 'content';
}

function schemaOptions(property: JsonSchema): InspectorField['options'] {
  if (!Array.isArray(property.enum)) {
    return undefined;
  }
  return property.enum.map((value) => ({
    label: String(value).replace(/^./, (letter) => letter.toUpperCase()),
    value: String(value)
  }));
}

function deriveFields(contract: ComponentContract): InspectorField[] {
  const schema = contract.propsSchema as JsonSchema;
  const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;
  return Object.entries(properties).map(([key, property]) => ({
    key,
    label: labelFor(key, property),
    control: controlFor(key, property),
    ...(schemaOptions(property) === undefined ? {} : { options: schemaOptions(property) }),
    ...(typeof property.minimum === 'number' ? { min: property.minimum } : {}),
    ...(typeof property.maximum === 'number' ? { max: property.maximum } : {}),
    ...(typeof property.default === 'string' ? { placeholder: property.default } : {})
  }));
}

function normalizeFields(contract: ComponentContract): InspectorField[] {
  const inspector = contract.inspector;
  if (inspector === undefined) {
    return deriveFields(contract);
  }
  return inspector.groups.flatMap((group) =>
    group.fields.map((field) => {
      const schema = (contract.propsSchema as JsonSchema).properties as
        Record<string, JsonSchema> | undefined;
      const fieldSchema = schema?.[field.path] ?? {};
      const control =
        field.widget === 'binding' ||
        field.widget === 'workflow' ||
        field.widget === 'json' ||
        field.widget === 'image'
          ? field.widget
          : field.widget;
      return {
        key: field.path,
        label: field.label,
        control,
        ...(field.options === undefined
          ? { options: schemaOptions(fieldSchema) }
          : {
              options: field.options.map((option) => ({
                label: option.label,
                value: String(option.value)
              }))
            }),
        ...(typeof fieldSchema.minimum === 'number' ? { min: fieldSchema.minimum } : {}),
        ...(typeof fieldSchema.maximum === 'number' ? { max: fieldSchema.maximum } : {}),
        ...(field.help === undefined ? {} : { description: field.help })
      };
    })
  );
}

function normalizeGroups(contract: ComponentContract): InspectorGroup[] {
  const grouped = new Map<InspectorGroupId, InspectorField[]>();
  for (const field of normalizeFields(contract)) {
    const id = groupFor(field.key, field.control ?? 'text');
    const fields = grouped.get(id) ?? [];
    fields.push(field);
    grouped.set(id, fields);
  }
  return GROUP_ORDER.map((id) => ({
    id,
    title: GROUP_TITLES[id],
    fields: grouped.get(id) ?? []
  }));
}

function augment(contract: ComponentContract): InspectorContract {
  return {
    type: contract.type,
    version: contract.version,
    displayName: contract.displayName,
    category: contract.category,
    ...(contract.description === undefined ? {} : { description: contract.description }),
    ...(contract.icon === undefined ? {} : { icon: contract.icon }),
    propsSchema: contract.propsSchema as Record<string, unknown>,
    defaults: contract.defaults,
    events: Object.fromEntries(
      Object.entries(contract.events).map(([eventName, eventContract]) => [
        eventName,
        {
          description: eventContract.description,
          ...(eventContract.payloadSchema === undefined
            ? {}
            : { payloadSchema: eventContract.payloadSchema })
        }
      ])
    ),
    slots: contract.slots,
    inspector: normalizeGroups(contract),
    readiness: PROGRESSIVE_CATEGORIES.has(contract.category) ? 'progressive' : 'core',
    ...(contract.resize === undefined ? {} : { resize: contract.resize }),
    ...(contract.supportedBreakpoints === undefined
      ? {}
      : { supportedBreakpoints: contract.supportedBreakpoints })
  };
}

export const BUILT_IN_CONTRACTS: readonly InspectorContract[] =
  BUILT_IN_COMPONENT_CONTRACTS.map(augment);

export async function fetchContracts(): Promise<InspectorContract[]> {
  const remote = await loadRemoteContracts();
  if (remote.length === 0) {
    return [...BUILT_IN_CONTRACTS];
  }
  const merged = new Map<string, InspectorContract>();
  for (const contract of BUILT_IN_CONTRACTS) {
    merged.set(`${contract.type}@${contract.version}`, contract);
  }
  for (const contract of remote) {
    merged.set(`${contract.type}@${contract.version}`, augment(contract));
  }
  return [...merged.values()];
}

export function findContract(
  contracts: readonly InspectorContract[],
  type: string
): InspectorContract | undefined {
  return contracts.find((contract) => contract.type === type);
}

export function categoryGroups(
  contracts: readonly InspectorContract[]
): Array<{ category: string; contracts: InspectorContract[] }> {
  return ALL_CATEGORIES.map((category) => ({
    category,
    contracts: contracts.filter((contract) => contract.category === category)
  })).filter((group) => group.contracts.length > 0);
}
