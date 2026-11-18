import { describe, expect, it } from 'vitest';
import {
  appDefinitionSchema,
  breakpointSchema,
  componentLayoutSchema,
  createMinimalAppDefinition,
  runtimePayloadToDefinition,
  workflowDefinitionSchema
} from '../src/index';

const WORKFLOW_ID = '11111111-1111-4111-8111-111111111111';
const STEP_ID = '22222222-2222-4222-8222-222222222222';

describe('visual builder spec additions', () => {
  it('accepts layout, breakpoint overrides, hidden nodes and typed bindings', () => {
    const definition = createMinimalAppDefinition();
    const root = definition.components[0];
    if (root === undefined) {
      throw new Error('Fixture is missing the root node');
    }

    root.layout = { display: 'flex', gap: 8, width: '100%', borderRadius: 4 };
    root.breakpointOverrides = { mobile: { display: 'block', padding: 4 } };
    root.hidden = false;
    root.bindings = { value: { source: 'model', path: 'users.name', kind: 'model' } };

    expect(appDefinitionSchema.parse(definition)).toEqual(definition);
  });

  it('rejects invalid layout values and unknown breakpoints', () => {
    expect(componentLayoutSchema.safeParse({ gap: -1 }).success).toBe(false);
    expect(componentLayoutSchema.safeParse({ display: 'inline' }).success).toBe(false);
    expect(componentLayoutSchema.safeParse({ gridColumns: 0 }).success).toBe(false);
    expect(componentLayoutSchema.safeParse({ unknown: true }).success).toBe(false);
    expect(breakpointSchema.safeParse('tablet').success).toBe(true);
    expect(breakpointSchema.safeParse('watch').success).toBe(false);
  });

  it('validates workflow definitions with additive defaults', () => {
    const workflow = {
      id: WORKFLOW_ID,
      name: 'On submit',
      trigger: { event: 'click' },
      steps: [
        {
          id: STEP_ID,
          type: 'notify',
          condition: { path: 'form.valid', op: 'eq', value: true },
          onError: [{ type: 'log', params: { level: 'error' } }]
        }
      ]
    };

    expect(workflowDefinitionSchema.parse(workflow).enabled).toBe(true);
    expect(() => workflowDefinitionSchema.parse({ ...workflow, steps: [] })).toThrow();
    expect(() => workflowDefinitionSchema.parse({ ...workflow, trigger: { event: '' } })).toThrow();
  });

  it('keeps the minimal fixture valid with additive defaults', () => {
    const parsed = appDefinitionSchema.parse(createMinimalAppDefinition());

    expect(parsed.workflows).toEqual([]);
    expect(parsed.metadata.editorLocks).toEqual([]);
  });

  it('rebuilds a valid editor definition from a published runtime payload', () => {
    const base = createMinimalAppDefinition();
    const definition = runtimePayloadToDefinition(
      {
        schemaVersion: base.schemaVersion,
        name: base.name,
        targets: base.targets,
        theme: base.theme,
        pages: base.pages,
        components: base.components
      },
      base.appId
    );

    expect(definition.components).toEqual(base.components);
    expect(definition.pages).toEqual(base.pages);
    expect(definition.workflows).toEqual([]);
  });
});
