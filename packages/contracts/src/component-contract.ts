import { z } from 'zod';
import { breakpointSchema, contractVersionSchema, platformTargetSchema } from '@nova/spec';
import type { Breakpoint } from '@nova/spec';

export const COMPONENT_CATEGORIES = [
  'layout',
  'input',
  'display',
  'navigation',
  'data',
  'feedback',
  'basic',
  'action',
  'custom'
] as const;

export const componentCategorySchema = z.enum(COMPONENT_CATEGORIES);

export const COMPONENT_INSPECTOR_WIDGETS = [
  'text',
  'textarea',
  'number',
  'boolean',
  'select',
  'color',
  'binding',
  'workflow',
  'json',
  'image'
] as const;

export interface ComponentInspectorFieldOption {
  label: string;
  value: string | number | boolean;
}

export interface ComponentInspectorFieldWhen {
  path: string;
  equals?: unknown | undefined;
  exists?: boolean | undefined;
}

export interface ComponentInspectorField {
  path: string;
  label: string;
  widget: (typeof COMPONENT_INSPECTOR_WIDGETS)[number];
  group?: string | undefined;
  help?: string | undefined;
  options?: ComponentInspectorFieldOption[] | undefined;
  when?: ComponentInspectorFieldWhen | undefined;
}

export interface ComponentInspectorGroup {
  id: string;
  label: string;
  fields: ComponentInspectorField[];
}

export interface ComponentInspector {
  groups: ComponentInspectorGroup[];
}

export interface ResizeConstraints {
  enabled: boolean;
  minWidth?: number | undefined;
  maxWidth?: number | undefined;
  minHeight?: number | undefined;
  maxHeight?: number | undefined;
  lockAspectRatio?: boolean | undefined;
}

export interface ComponentMigration {
  fromVersion: string;
  toVersion: string;
  upgrade(props: Record<string, unknown>): Record<string, unknown>;
}

export interface EventContract {
  description: string;
  payloadSchema?: Record<string, unknown> | undefined;
}

export interface SlotContract {
  description: string;
  allows?: string[] | undefined;
  multiple: boolean;
}

export interface ComponentConstraints {
  allowedParents?: string[] | undefined;
  allowedChildren?: string[] | undefined;
  maxChildren?: number | undefined;
}

export interface ComponentContract {
  type: string;
  version: string;
  displayName: string;
  category: (typeof COMPONENT_CATEGORIES)[number];
  propsSchema: Record<string, unknown>;
  defaults: Record<string, unknown>;
  events: Record<string, EventContract>;
  slots: Record<string, SlotContract>;
  capabilities: string[];
  supportedTargets: Array<z.infer<typeof platformTargetSchema>>;
  renderers: Partial<Record<z.infer<typeof platformTargetSchema>, string>>;
  constraints: ComponentConstraints;
  migrations: ComponentMigration[];
  description?: string | undefined;
  icon?: string | undefined;
  inspector?: ComponentInspector | undefined;
  resize?: ResizeConstraints | undefined;
  supportedBreakpoints?: Breakpoint[] | undefined;
}

export const componentInspectorFieldSchema = z
  .object({
    path: z.string().min(1),
    label: z.string().min(1),
    widget: z.enum(COMPONENT_INSPECTOR_WIDGETS),
    group: z.string().min(1).optional(),
    help: z.string().optional(),
    options: z
      .array(
        z
          .object({
            label: z.string().min(1),
            value: z.union([z.string(), z.number(), z.boolean()])
          })
          .strict()
      )
      .optional(),
    when: z
      .object({
        path: z.string().min(1),
        equals: z.unknown().optional(),
        exists: z.boolean().optional()
      })
      .strict()
      .optional()
  })
  .strict();

export const componentInspectorGroupSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    fields: z.array(componentInspectorFieldSchema).min(1)
  })
  .strict();

export const componentInspectorSchema = z
  .object({
    groups: z.array(componentInspectorGroupSchema).min(1)
  })
  .strict();

export const resizeConstraintsSchema = z
  .object({
    enabled: z.boolean(),
    minWidth: z.number().nonnegative().optional(),
    maxWidth: z.number().nonnegative().optional(),
    minHeight: z.number().nonnegative().optional(),
    maxHeight: z.number().nonnegative().optional(),
    lockAspectRatio: z.boolean().optional()
  })
  .strict();

export const eventContractSchema = z.object({
  description: z.string().min(1),
  payloadSchema: z.record(z.unknown()).optional()
});

export const slotContractSchema = z.object({
  description: z.string().min(1),
  allows: z.array(z.string().min(1)).optional(),
  multiple: z.boolean().default(false)
});

export const componentConstraintsSchema = z.object({
  allowedParents: z.array(z.string().min(1)).optional(),
  allowedChildren: z.array(z.string().min(1)).optional(),
  maxChildren: z.number().int().nonnegative().optional()
});

export const componentMigrationSchema = z.object({
  fromVersion: contractVersionSchema,
  toVersion: contractVersionSchema,
  upgrade: z.function().args(z.record(z.unknown())).returns(z.record(z.unknown()))
});

const rendererSchema = z
  .object({
    web: z.string().min(1).optional(),
    android: z.string().min(1).optional(),
    ios: z.string().min(1).optional(),
    windows: z.string().min(1).optional(),
    macos: z.string().min(1).optional(),
    linux: z.string().min(1).optional()
  })
  .strict();

export const componentContractSchema = z.object({
  type: z.string().min(1),
  version: contractVersionSchema,
  displayName: z.string().min(1),
  category: componentCategorySchema,
  propsSchema: z.object({ type: z.literal('object') }).passthrough(),
  defaults: z.record(z.unknown()),
  events: z.record(eventContractSchema),
  slots: z.record(slotContractSchema),
  capabilities: z.array(z.string().min(1)),
  supportedTargets: z.array(platformTargetSchema).min(1),
  renderers: rendererSchema,
  constraints: componentConstraintsSchema,
  migrations: z.array(componentMigrationSchema).default([]),
  description: z.string().optional(),
  icon: z.string().optional(),
  inspector: componentInspectorSchema.optional(),
  resize: resizeConstraintsSchema.optional(),
  supportedBreakpoints: z.array(breakpointSchema).optional()
});
