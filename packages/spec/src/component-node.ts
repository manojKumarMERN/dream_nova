import { z } from 'zod';
import { contractVersionSchema, idSchema, shortNameSchema } from './common';
import { platformTargetSchema } from './targets';

export const BREAKPOINTS = ['desktop', 'tablet', 'mobile'] as const;

export const breakpointSchema = z.enum(BREAKPOINTS);

export type Breakpoint = (typeof BREAKPOINTS)[number];

export const bindingKindSchema = z.enum(['model', 'state', 'prop', 'collection']);

export type BindingKind = z.infer<typeof bindingKindSchema>;

export interface Binding {
  source: string;
  path: string;
  transform?: string | undefined;
  kind?: BindingKind | undefined;
  collection?: string | undefined;
}

export interface EventBinding {
  action: string;
  params?: Record<string, unknown> | undefined;
}

export const componentLayoutSchema = z
  .object({
    width: z.union([z.number().nonnegative(), z.string().min(1)]).optional(),
    height: z.union([z.number().nonnegative(), z.string().min(1)]).optional(),
    padding: z.number().nonnegative().optional(),
    margin: z.number().nonnegative().optional(),
    gap: z.number().nonnegative().optional(),
    display: z.enum(['block', 'flex', 'grid']).optional(),
    direction: z.enum(['row', 'column']).optional(),
    alignItems: z.enum(['start', 'center', 'end', 'stretch']).optional(),
    justifyContent: z.enum(['start', 'center', 'end', 'between']).optional(),
    position: z.enum(['static', 'relative', 'absolute']).optional(),
    gridColumns: z.number().int().positive().optional(),
    gridRows: z.number().int().positive().optional(),
    backgroundColor: z.string().min(1).optional(),
    borderColor: z.string().min(1).optional(),
    color: z.string().min(1).optional(),
    boxShadow: z.string().min(1).optional(),
    borderRadius: z.number().nonnegative().optional(),
    fontSize: z.number().nonnegative().optional(),
    fontWeight: z.number().nonnegative().optional(),
    textAlign: z.enum(['left', 'center', 'right']).optional()
  })
  .strict();

export type ComponentLayout = z.infer<typeof componentLayoutSchema>;

export const breakpointOverridesSchema: z.ZodType<Partial<Record<Breakpoint, ComponentLayout>>> = z
  .object({
    desktop: componentLayoutSchema.optional(),
    tablet: componentLayoutSchema.optional(),
    mobile: componentLayoutSchema.optional()
  })
  .strict() as unknown as z.ZodType<Partial<Record<Breakpoint, ComponentLayout>>>;

export interface ComponentNode {
  id: string;
  type: string;
  contractVersion: string;
  name?: string | undefined;
  props: Record<string, unknown>;
  bindings?: Record<string, Binding> | undefined;
  events?: Record<string, EventBinding> | undefined;
  slots?: Record<string, ComponentNode[]> | undefined;
  children?: ComponentNode[] | undefined;
  layout?: ComponentLayout | undefined;
  breakpointOverrides?: Partial<Record<Breakpoint, ComponentLayout>> | undefined;
  hidden?: boolean | undefined;
  targetOverrides?: Record<string, Record<string, unknown>> | undefined;
}

export const bindingSchema = z.object({
  source: z.string().min(1),
  path: z.string().min(1),
  transform: z.string().min(1).optional(),
  kind: bindingKindSchema.optional(),
  collection: z.string().min(1).optional()
});

export const eventBindingSchema = z.object({
  action: z.string().min(1),
  params: z.record(z.unknown()).optional()
});

export const componentNodeSchema: z.ZodType<ComponentNode> = z.lazy(() =>
  z.object({
    id: idSchema,
    type: z.string().min(1),
    contractVersion: contractVersionSchema,
    name: shortNameSchema.optional(),
    props: z.record(z.unknown()),
    bindings: z.record(bindingSchema).optional(),
    events: z.record(eventBindingSchema).optional(),
    slots: z.record(z.array(componentNodeSchema)).optional(),
    children: z.array(componentNodeSchema).optional(),
    layout: componentLayoutSchema.optional(),
    breakpointOverrides: breakpointOverridesSchema.optional(),
    hidden: z.boolean().optional(),
    targetOverrides: z.record(z.string().min(1), z.record(z.unknown())).optional()
  })
);

export const targetOverrideKeySchema = platformTargetSchema;
