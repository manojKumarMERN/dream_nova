import { createMinimalAppDefinition } from '@nova/spec';
import type { AppDefinition, WorkflowDefinition, WorkflowGraph } from '@nova/spec';
import { describe, expect, it } from 'vitest';
import { BUILT_IN_CONTRACTS } from '../../contracts';
import { createAuthoringMetadata, readAuthoringMetadata } from './authoring';
import { withManualIdentifier } from './event-identifiers';
import {
  buildGuidedActionContext,
  configureGuidedNode,
  createGuidedNode,
  friendlyIssueMessage,
  getDataSourceOptions,
  getGuidedActionAvailability,
  getGuidedRuntimeActionIssues,
  getMappingSources,
  getOverlayOptions,
  getPropertyOptions,
  getQueryOptions,
  getSourceComponentStatus,
  guidedConfigurationIssues,
  listGuidedActions,
  removeGuidedMapping,
  setGuidedMapping,
  suggestNextActions,
  type GuidedActionContext
} from './guided-authoring';
import { createTemplateGraph, isTemplateAvailable } from './workflow-templates';
import { validateWorkflowDefinition } from './validation';

const BUTTON_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const FORM_ID = '55555555-5555-4555-8555-555555555555';
const MODAL_ID = '11111111-1111-4111-8111-111111111111';
const DIALOG_ID = '22222222-2222-4222-8222-222222222222';
const DRAWER_ID = '33333333-3333-4333-8333-333333333333';
const MODEL_ID = '66666666-6666-4666-8666-666666666666';
const SOURCE_ID = '77777777-7777-4777-8777-777777777777';
const QUERY_ID = '88888888-8888-4888-8888-888888888888';
const SECRET = 'sk-should-never-appear';
const WORKFLOW_ID = '99999999-9999-4999-8999-999999999999';

function definitionWithGuidedData(): AppDefinition {
  const definition = createMinimalAppDefinition();
  definition.components.push(
    {
      id: FORM_ID,
      type: 'nova.form',
      contractVersion: '1.0.0',
      name: 'Customer Form',
      props: { submitLabel: 'Save' }
    },
    {
      id: MODAL_ID,
      type: 'nova.modal',
      contractVersion: '1.0.0',
      name: 'Customer Modal',
      props: { title: 'Customer', open: false }
    },
    {
      id: DIALOG_ID,
      type: 'nova.dialog',
      contractVersion: '1.0.0',
      name: 'Confirm Dialog',
      props: { title: 'Confirm', open: false }
    },
    {
      id: DRAWER_ID,
      type: 'nova.drawer',
      contractVersion: '1.0.0',
      name: 'Customer Drawer',
      props: { title: 'Customer', open: false }
    }
  );
  definition.dataModels = [
    {
      id: MODEL_ID,
      name: 'Customer',
      displayName: 'Customer records',
      fields: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab',
          name: 'customerId',
          type: 'uuid',
          required: true,
          unique: false
        },
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac',
          name: 'email',
          type: 'email',
          required: false,
          unique: false
        }
      ],
      relations: {}
    }
  ];
  definition.dataSources = [
    {
      id: SOURCE_ID,
      name: 'Nova Data',
      provider: 'nova-data',
      environment: 'development',
      modelId: MODEL_ID,
      options: { apiKey: SECRET }
    }
  ];
  definition.queries = [
    {
      id: QUERY_ID,
      name: 'Get customer',
      modelId: MODEL_ID,
      sourceId: SOURCE_ID,
      fields: ['customerId', 'email'],
      sort: []
    }
  ];
  definition.integrations = [
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      providerKey: 'external-rest',
      config: {},
      secretRef: SECRET
    }
  ];
  return definition;
}

function fullContext(): GuidedActionContext {
  return buildGuidedActionContext(definitionWithGuidedData(), BUILT_IN_CONTRACTS);
}

function emptyContext(): GuidedActionContext {
  return buildGuidedActionContext(createMinimalAppDefinition(), BUILT_IN_CONTRACTS);
}

function contextWithoutButton(): GuidedActionContext {
  const definition = createMinimalAppDefinition();
  definition.components = definition.components.map((component) => ({
    ...component,
    children: component.children?.filter((child) => child.id !== BUTTON_ID)
  }));
  return buildGuidedActionContext(definition, BUILT_IN_CONTRACTS);
}

function workflowFromGraph(graph: WorkflowGraph): WorkflowDefinition {
  return {
    id: WORKFLOW_ID,
    name: 'Guided test',
    trigger: { event: 'click', nodeId: BUTTON_ID },
    steps: [],
    enabled: true,
    graph
  };
}

describe('guided action discovery', () => {
  it('marks actions available only when their real dependencies exist', () => {
    const context = fullContext();
    const byId = new Map(listGuidedActions(context).map((action) => [action.id, action]));

    expect(byId.get('start-from-component')?.available).toBe(true);
    expect(byId.get('open-modal')?.available).toBe(true);
    expect(byId.get('open-drawer')?.available).toBe(true);
    expect(byId.get('close-overlay')?.available).toBe(true);
    expect(byId.get('fetch-data')?.available).toBe(true);
    expect(byId.get('save-data')?.available).toBe(true);
    expect(byId.get('validate-form')?.available).toBe(true);
    expect(getGuidedActionAvailability('fetch-data', emptyContext())).toMatchObject({
      available: false
    });
    expect(getGuidedActionAvailability('validate-form', emptyContext())).toMatchObject({
      available: false
    });
    expect(getGuidedActionAvailability('show-message', emptyContext()).available).toBe(true);
  });

  it('respects exact modal, dialog and drawer event capabilities', () => {
    const context = fullContext();
    const openTargets = getOverlayOptions('open-modal', context).map((option) => option.value);
    const closeTargets = getOverlayOptions('close-overlay', context).map((option) => option.value);

    expect(openTargets).toContain(MODAL_ID);
    expect(openTargets).toContain(DRAWER_ID);
    expect(openTargets).not.toContain(DIALOG_ID);
    expect(closeTargets).toEqual(expect.arrayContaining([MODAL_ID, DIALOG_ID, DRAWER_ID]));
  });

  it('exposes only safe NOVA data options without secrets', () => {
    const context = fullContext();
    const serialized = JSON.stringify({
      queries: getQueryOptions(context),
      sources: getDataSourceOptions(context)
    });

    expect(getQueryOptions(context).map((option) => option.value)).toEqual([QUERY_ID]);
    expect(getDataSourceOptions(context).map((option) => option.value)).toEqual([SOURCE_ID]);
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain('providerKey');
    expect(context.data.externalConnectorsAvailable).toBe(false);
  });
});

describe('guided node configuration', () => {
  it('creates a node from a real component event with generated identifiers', () => {
    const context = fullContext();
    const node = createGuidedNode('start-from-component', context, {
      config: { sourceComponentId: BUTTON_ID, sourceEventName: 'click' },
      label: 'Button clicked'
    });
    const metadata = readAuthoringMetadata(node.event);

    expect(metadata).toMatchObject({
      intent: 'component-event',
      sourceComponentId: BUTTON_ID,
      sourceComponentType: 'nova.button',
      sourceEventName: 'click',
      identifierOrigin: 'generated'
    });
    expect(node.event.identifier).toBe('ui.button.clicked');
    expect(node.event.source).toBe(`component:${BUTTON_ID}`);
    expect(node.label).toBe('Button clicked');
  });

  it('preserves manual identifiers when guided options change', () => {
    const context = fullContext();
    const initial = createGuidedNode('open-modal', context, {
      config: { targetComponentId: MODAL_ID, targetAction: 'open' }
    });
    const manual = withManualIdentifier(initial.event, 'custom.modal.open', 'open-modal');
    const configured = configureGuidedNode(
      { ...initial, event: manual },
      'open-modal',
      { targetComponentId: DRAWER_ID, targetAction: 'open' },
      context
    );

    expect(configured.event.identifier).toBe('custom.modal.open');
    expect(readAuthoringMetadata(configured.event)?.targetComponentId).toBe(DRAWER_ID);
  });

  it('stores and validates only supported runtime actions', () => {
    const context = fullContext();
    const message = createGuidedNode('show-message', context, {
      config: { message: 'Saved successfully.' }
    });
    const fetch = createGuidedNode('fetch-data', context, {
      config: { queryId: QUERY_ID, dataSourceId: SOURCE_ID }
    });
    const save = createGuidedNode('save-data', context, {
      config: { dataSourceId: SOURCE_ID }
    });

    expect(readAuthoringMetadata(message.event)?.runtimeAction).toMatchObject({
      action: 'showMessage',
      params: { message: 'Saved successfully.' }
    });
    expect(getGuidedRuntimeActionIssues(message)).toEqual([]);
    expect(getGuidedRuntimeActionIssues(fetch)).toEqual([]);
    expect(readAuthoringMetadata(save.event)?.runtimeAction).toBeUndefined();

    const sanitized = createAuthoringMetadata({
      intent: 'show-message',
      runtimeAction: {
        action: 'showMessage',
        params: { message: 'ok', 'bad key': 'x', count: Number.NaN, enabled: true }
      }
    });
    expect(sanitized.runtimeAction).toEqual({
      action: 'showMessage',
      params: { message: 'ok', enabled: true }
    });
  });

  it('adds and removes visual mappings using safe expressions only', () => {
    const context = fullContext();
    const node = createGuidedNode('fetch-data', context, {
      config: { queryId: QUERY_ID, dataSourceId: SOURCE_ID }
    });
    const mapped = setGuidedMapping(node, 'title', 'payload.data.email');
    const rejected = setGuidedMapping(mapped, 'unsafe', 'window.location');

    expect(getMappingSources(mapped, context).map((source) => source.value)).toEqual([
      'payload.data.customerId',
      'payload.data.email'
    ]);
    expect(readAuthoringMetadata(mapped.event)?.responseMapping).toEqual({
      title: 'payload.data.email'
    });
    expect(mapped.event.payloadMapping).toEqual({ title: 'payload.data.email' });
    expect(readAuthoringMetadata(rejected.event)?.responseMapping).toEqual({
      title: 'payload.data.email'
    });
    expect(
      readAuthoringMetadata(removeGuidedMapping(mapped, 'title').event)?.responseMapping
    ).toBeUndefined();
  });

  it('suggests only available next actions for the selected action', () => {
    const context = emptyContext();
    const node = createGuidedNode('validate-form', context, {});
    const suggestions = suggestNextActions(node, context).map((suggestion) => suggestion.id);

    expect(suggestions).toContain('show-message');
    expect(suggestions).toContain('update-component');
    expect(suggestions).not.toContain('fetch-data');
    expect(suggestions).not.toContain('save-data');
  });
});

describe('guided configuration diagnostics', () => {
  it('reports unsupported events, missing targets, missing data and missing mappings', () => {
    const context = fullContext();
    const unsupported = configureGuidedNode(
      createGuidedNode('start-from-component', context, {
        config: { sourceComponentId: BUTTON_ID, sourceEventName: 'click' }
      }),
      'start-from-component',
      { sourceEventName: 'submit' },
      context
    );
    const missingTarget = createGuidedNode('open-modal', emptyContext(), {});
    const missingQuery = createGuidedNode('fetch-data', emptyContext(), {});
    const fill = createGuidedNode('fill-modal', context, {});

    const codes = (
      node: Parameters<typeof guidedConfigurationIssues>[0],
      actionContext = context
    ) => guidedConfigurationIssues(node, actionContext).map((issue) => issue.code);

    expect(codes(unsupported)).toContain('UNSUPPORTED_COMPONENT_EVENT');
    expect(codes(missingTarget, emptyContext())).toContain('MISSING_TARGET_COMPONENT');
    expect(codes(missingQuery, emptyContext())).toContain('MISSING_DATA_QUERY');
    expect(codes(fill)).toContain('MISSING_VISUAL_MAPPING');
  });

  it('maps canonical issue codes to friendly messages', () => {
    expect(
      friendlyIssueMessage({
        code: 'MISSING_EVENT_IDENTIFIER',
        path: 'workflow.graph.nodes[1].event.identifier',
        message: 'node needs an event identifier',
        severity: 'error'
      })
    ).toBe('Select a source event or enter an event identifier.');
  });

  it('reports renamed or missing source components', () => {
    const context = fullContext();
    const node = createGuidedNode('start-from-component', context, {
      config: { sourceComponentId: BUTTON_ID, sourceEventName: 'click' }
    });

    expect(getSourceComponentStatus(node, context)).toMatchObject({ status: 'resolved' });
    expect(getSourceComponentStatus(node, contextWithoutButton())).toMatchObject({
      status: 'renamed-or-missing'
    });
    expect(getPropertyOptions(MODAL_ID, context).map((option) => option.value)).not.toContain(
      'open'
    );
  });
});

describe('guided workflow templates', () => {
  it('reports availability from real app capabilities', () => {
    const context = fullContext();
    const empty = emptyContext();

    expect(isTemplateAvailable('button-modal-data', context)).toBe(true);
    expect(isTemplateAvailable('form-validate-save', context)).toBe(true);
    expect(isTemplateAvailable('button-fetch-message', context)).toBe(true);
    expect(isTemplateAvailable('form-validate-error', context)).toBe(true);
    expect(isTemplateAvailable('button-modal-data', empty)).toBe(false);
    expect(isTemplateAvailable('form-validate-error', empty)).toBe(false);
  });

  it('creates the button-modal-data template with valid mapped graph', () => {
    const context = fullContext();
    const graph = createTemplateGraph('button-modal-data', { context });
    const errors = validateWorkflowDefinition(workflowFromGraph(graph)).filter(
      (issue) => issue.severity === 'error'
    );
    const identifiers = graph.nodes.map((node) => node.event.identifier);

    expect(graph.nodes).toHaveLength(4);
    expect(graph.edges).toHaveLength(3);
    expect(errors).toEqual([]);
    expect(new Set(identifiers).size).toBe(identifiers.length);
    expect(
      graph.nodes.some(
        (node) => Object.keys(readAuthoringMetadata(node.event)?.responseMapping ?? {}).length > 0
      )
    ).toBe(true);
  });

  it('creates the form templates with semantic success and failure branches', () => {
    const context = fullContext();
    const saveGraph = createTemplateGraph('form-validate-save', { context });
    const errorGraph = createTemplateGraph('form-validate-error', { context });

    expect(saveGraph.edges.map((edge) => edge.outcome)).toEqual(['success', 'success', 'success']);
    expect(errorGraph.edges.map((edge) => edge.outcome)).toEqual(['success', 'failure']);
    expect(
      validateWorkflowDefinition(workflowFromGraph(saveGraph)).filter(
        (issue) => issue.severity === 'error'
      )
    ).toEqual([]);
    expect(
      validateWorkflowDefinition(workflowFromGraph(errorGraph)).filter(
        (issue) => issue.severity === 'error'
      )
    ).toEqual([]);
  });
});

describe('guided event identifiers under component changes', () => {
  it('keeps identifiers stable when a source component is renamed', () => {
    const context = fullContext();
    const node = createGuidedNode('start-from-component', context, {
      config: { sourceComponentId: BUTTON_ID, sourceEventName: 'click' }
    });
    const renamedDefinition = definitionWithGuidedData();
    const button = renamedDefinition.components[0]?.children?.find(
      (child) => child.id === BUTTON_ID
    );
    if (button !== undefined) {
      button.name = 'Continue Button';
    }
    const renamedContext = buildGuidedActionContext(renamedDefinition, BUILT_IN_CONTRACTS);

    expect(getSourceComponentStatus(node, renamedContext).status).toBe('resolved');
    expect(node.event.identifier).toBe('ui.button.clicked');
  });
});
