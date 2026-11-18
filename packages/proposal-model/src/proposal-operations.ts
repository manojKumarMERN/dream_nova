import { z } from 'zod';
import {
  appDefinitionSchema,
  bindingSchema,
  breakpointOverridesSchema,
  breakpointSchema,
  componentLayoutSchema,
  componentNodeSchema,
  eventBindingSchema,
  pageDefinitionSchema,
  workflowDefinitionSchema
} from '@nova/spec';
import type { Breakpoint, ComponentLayout } from '@nova/spec';

export const riskLevelSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'DESTRUCTIVE']);

export const componentPatchSchema = z
  .object({
    name: z.string().min(1).optional(),
    props: z.record(z.unknown()).optional(),
    bindings: z.record(bindingSchema).optional(),
    events: z.record(eventBindingSchema).optional(),
    layout: componentLayoutSchema.optional(),
    breakpointOverrides: breakpointOverridesSchema.optional(),
    hidden: z.boolean().optional()
  })
  .strict();

export const themePatchSchema = z
  .object({
    colors: z.record(z.string().min(1)).optional(),
    spacing: z.record(z.number().nonnegative()).optional(),
    typography: z.record(z.string().min(1)).optional(),
    borderRadius: z.record(z.number().nonnegative()).optional(),
    shadows: z.record(z.string().min(1)).optional(),
    components: z.record(z.record(z.unknown())).optional()
  })
  .strict();

export const addComponentOperationSchema = z.object({
  op: z.literal('addComponent'),
  pageId: z.string().uuid(),
  parentId: z.string().uuid(),
  index: z.number().int().nonnegative().optional(),
  slot: z.string().min(1).optional(),
  node: componentNodeSchema
});

export const updateComponentOperationSchema = z.object({
  op: z.literal('updateComponent'),
  nodeId: z.string().uuid(),
  patch: componentPatchSchema
});

export const removeComponentOperationSchema = z.object({
  op: z.literal('removeComponent'),
  nodeId: z.string().uuid()
});

export const updateThemeOperationSchema = z.object({
  op: z.literal('updateTheme'),
  patch: themePatchSchema
});

export const addPageOperationSchema = z.object({
  op: z.literal('addPage'),
  page: pageDefinitionSchema
});

export const removePageOperationSchema = z.object({
  op: z.literal('removePage'),
  pageId: z.string().uuid()
});

export const moveComponentOperationSchema = z.object({
  op: z.literal('moveComponent'),
  nodeId: z.string().uuid(),
  parentId: z.string().uuid(),
  index: z.number().int().nonnegative().optional(),
  slot: z.string().min(1).optional()
});

export const resizeComponentOperationSchema = z.object({
  op: z.literal('resizeComponent'),
  nodeId: z.string().uuid(),
  layout: componentLayoutSchema
});

export const updateBreakpointOverridesOperationSchema = z.object({
  op: z.literal('updateBreakpointOverrides'),
  nodeId: z.string().uuid(),
  breakpoint: breakpointSchema,
  layout: componentLayoutSchema.nullable()
});

export const updateBindingOperationSchema = z.object({
  op: z.literal('updateBinding'),
  nodeId: z.string().uuid(),
  prop: z.string().min(1),
  binding: bindingSchema.nullable()
});

export const updateWorkflowOperationSchema = z.object({
  op: z.literal('updateWorkflow'),
  workflow: workflowDefinitionSchema
});

export const removeWorkflowOperationSchema = z.object({
  op: z.literal('removeWorkflow'),
  workflowId: z.string().uuid()
});

export const bulkUpdateComponentsOperationSchema = z.object({
  op: z.literal('bulkUpdateComponents'),
  nodeIds: z.array(z.string().uuid()).min(1),
  patch: componentPatchSchema
});

export const bulkDeleteComponentsOperationSchema = z.object({
  op: z.literal('bulkDeleteComponents'),
  nodeIds: z.array(z.string().uuid()).min(1)
});

export const duplicateComponentOperationSchema = z.object({
  op: z.literal('duplicateComponent'),
  sourceNodeId: z.string().uuid(),
  newNodeId: z.string().uuid(),
  parentId: z.string().uuid(),
  index: z.number().int().nonnegative().optional(),
  slot: z.string().min(1).optional()
});

export const setComponentHiddenOperationSchema = z.object({
  op: z.literal('setComponentHidden'),
  nodeId: z.string().uuid(),
  hidden: z.boolean()
});

export const replaceDefinitionOperationSchema = z.object({
  op: z.literal('replaceDefinition'),
  definition: appDefinitionSchema
});

export const proposalOperationSchema = z.discriminatedUnion('op', [
  addComponentOperationSchema,
  updateComponentOperationSchema,
  removeComponentOperationSchema,
  updateThemeOperationSchema,
  addPageOperationSchema,
  removePageOperationSchema,
  moveComponentOperationSchema,
  resizeComponentOperationSchema,
  updateBreakpointOverridesOperationSchema,
  updateBindingOperationSchema,
  updateWorkflowOperationSchema,
  removeWorkflowOperationSchema,
  bulkUpdateComponentsOperationSchema,
  bulkDeleteComponentsOperationSchema,
  duplicateComponentOperationSchema,
  setComponentHiddenOperationSchema,
  replaceDefinitionOperationSchema
]);

export const changeProposalSchema = z.object({
  baseVersionId: z.string().min(1),
  summary: z.string().min(1).max(500),
  rationale: z.string().max(2000).default(''),
  riskLevel: riskLevelSchema,
  source: z.enum(['editor', 'ai', 'migration', 'system']).optional(),
  operations: z.array(proposalOperationSchema).min(1)
});

export type BreakpointLayoutMap = Partial<Record<Breakpoint, ComponentLayout>>;
export type ComponentPatch = z.infer<typeof componentPatchSchema>;
export type ThemePatch = z.infer<typeof themePatchSchema>;
export type AddComponentOperation = z.infer<typeof addComponentOperationSchema>;
export type UpdateComponentOperation = z.infer<typeof updateComponentOperationSchema>;
export type RemoveComponentOperation = z.infer<typeof removeComponentOperationSchema>;
export type UpdateThemeOperation = z.infer<typeof updateThemeOperationSchema>;
export type AddPageOperation = z.infer<typeof addPageOperationSchema>;
export type RemovePageOperation = z.infer<typeof removePageOperationSchema>;
export type MoveComponentOperation = z.infer<typeof moveComponentOperationSchema>;
export type ResizeComponentOperation = z.infer<typeof resizeComponentOperationSchema>;
export type UpdateBreakpointOverridesOperation = z.infer<
  typeof updateBreakpointOverridesOperationSchema
>;
export type UpdateBindingOperation = z.infer<typeof updateBindingOperationSchema>;
export type UpdateWorkflowOperation = z.infer<typeof updateWorkflowOperationSchema>;
export type RemoveWorkflowOperation = z.infer<typeof removeWorkflowOperationSchema>;
export type BulkUpdateComponentsOperation = z.infer<typeof bulkUpdateComponentsOperationSchema>;
export type BulkDeleteComponentsOperation = z.infer<typeof bulkDeleteComponentsOperationSchema>;
export type DuplicateComponentOperation = z.infer<typeof duplicateComponentOperationSchema>;
export type SetComponentHiddenOperation = z.infer<typeof setComponentHiddenOperationSchema>;
export type ReplaceDefinitionOperation = z.infer<typeof replaceDefinitionOperationSchema>;
export type ProposalOperation = z.infer<typeof proposalOperationSchema>;
export type ChangeProposal = z.infer<typeof changeProposalSchema>;
export type RiskLevel = z.infer<typeof riskLevelSchema>;
