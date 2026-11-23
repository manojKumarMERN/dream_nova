import type {
  WorkflowGraph,
  WorkflowGraphEdge,
  WorkflowGraphNode,
  WorkflowOutcome
} from '@nova/spec';
import { createUniqueId } from '../../id';
import type { WorkflowRef } from '../../types';
import type { IconName } from '../Icons';
import {
  createGuidedNode,
  getDataSourceOptions,
  getFormOptions,
  getMappingSources,
  getOverlayOptions,
  getPropertyOptions,
  getQueryOptions,
  setGuidedMapping,
  type GuidedActionContext
} from './guided-authoring';
import { OUTCOME_META } from './model';
import type { WorkflowComponentOption } from './workflow-catalog';

export type GuidedWorkflowTemplateId =
  'button-modal-data' | 'form-validate-save' | 'button-fetch-message' | 'form-validate-error';

export interface GuidedWorkflowTemplate {
  id: GuidedWorkflowTemplateId;
  label: string;
  description: string;
  icon: IconName;
  requires: string;
}

export interface GuidedWorkflowTemplateAvailability {
  available: boolean;
  reason: string;
}

export const WORKFLOW_TEMPLATES: readonly GuidedWorkflowTemplate[] = [
  {
    id: 'button-modal-data',
    label: 'Open details from a button',
    description: 'Button click → open modal → fetch data → fill modal.',
    icon: 'layers',
    requires: 'A button, a modal with an open event, a writable property and a data query'
  },
  {
    id: 'form-validate-save',
    label: 'Validate and save a form',
    description: 'Form submit → validate form → save data → show success.',
    icon: 'shield',
    requires: 'A form and a NOVA data source'
  },
  {
    id: 'button-fetch-message',
    label: 'Fetch data and notify',
    description: 'Button click → fetch data → show message.',
    icon: 'database',
    requires: 'A button and a data query'
  },
  {
    id: 'form-validate-error',
    label: 'Validate form with error branch',
    description: 'Form submit → validate form → show validation error.',
    icon: 'activity',
    requires: 'A form'
  }
];

function componentWithEvent(
  context: GuidedActionContext,
  type: string,
  eventName: string
): WorkflowComponentOption | undefined {
  return context.components.find(
    (component) =>
      component.type === type && component.events.some((event) => event.name === eventName)
  );
}

function preferredComponent(
  context: GuidedActionContext,
  type: string,
  eventName: string,
  target?: WorkflowRef
): WorkflowComponentOption | undefined {
  if (target?.nodeId !== undefined) {
    const selected = context.components.find((component) => component.id === target.nodeId);
    if (selected?.type === type && selected.events.some((event) => event.name === eventName)) {
      return selected;
    }
  }
  return componentWithEvent(context, type, eventName);
}

function reference(component: WorkflowComponentOption, eventName: string): WorkflowRef {
  return { nodeId: component.id, eventName };
}

function firstQuery(context: GuidedActionContext) {
  return getQueryOptions(context)[0];
}

function firstDataSource(context: GuidedActionContext) {
  return getDataSourceOptions(context)[0];
}

function firstForm(context: GuidedActionContext) {
  return getFormOptions(context)[0];
}

function querySourceId(
  context: GuidedActionContext,
  queryId: string | undefined
): string | undefined {
  return (
    context.data.queries.find((query) => query.id === queryId)?.sourceId ??
    firstDataSource(context)?.value
  );
}

function firstModal(context: GuidedActionContext) {
  return getOverlayOptions('open-modal', context)[0];
}

export function isTemplateAvailable(
  id: GuidedWorkflowTemplateId,
  context: GuidedActionContext
): boolean {
  const button = componentWithEvent(context, 'nova.button', 'click');
  const form = firstForm(context);
  switch (id) {
    case 'button-modal-data':
      return (
        button !== undefined &&
        firstModal(context) !== undefined &&
        getPropertyOptions(firstModal(context)?.value, context).length > 0 &&
        firstQuery(context) !== undefined
      );
    case 'form-validate-save':
      return form !== undefined && firstDataSource(context) !== undefined;
    case 'button-fetch-message':
      return button !== undefined && firstQuery(context) !== undefined;
    case 'form-validate-error':
      return form !== undefined;
  }
}

export function listGuidedTemplates(
  context: GuidedActionContext
): Array<GuidedWorkflowTemplate & GuidedWorkflowTemplateAvailability> {
  return WORKFLOW_TEMPLATES.map((template) => ({
    ...template,
    ...(isTemplateAvailable(template.id, context)
      ? { available: true, reason: template.requires }
      : { available: false, reason: template.requires })
  }));
}

function withHandling(node: WorkflowGraphNode): WorkflowGraphNode {
  return {
    ...node,
    event: {
      ...node.event,
      failureHandling: 'Stop this workflow and report the failure.',
      warningHandling: 'Continue and review the warning.'
    }
  };
}

function edge(source: string, target: string, outcome: WorkflowOutcome): WorkflowGraphEdge {
  return {
    id: createUniqueId('edge'),
    source,
    target,
    outcome,
    label: OUTCOME_META[outcome].label
  };
}

function requireValue<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
}

export function createTemplateGraph(
  id: GuidedWorkflowTemplateId,
  options: { context: GuidedActionContext; target?: WorkflowRef }
): WorkflowGraph {
  const context = options.context;
  const nodes: WorkflowGraphNode[] = [];
  const edges: WorkflowGraphEdge[] = [];
  const used = new Set<string>();

  const add = (node: WorkflowGraphNode): WorkflowGraphNode => {
    const next = withHandling(node);
    nodes.push(next);
    used.add(next.event.identifier);
    if (next.event.incomingIdentifier !== undefined) {
      used.add(next.event.incomingIdentifier);
    }
    return next;
  };

  const connect = (
    source: WorkflowGraphNode,
    target: WorkflowGraphNode,
    outcome: WorkflowOutcome
  ) => {
    edges.push(edge(source.id, target.id, outcome));
  };

  switch (id) {
    case 'button-modal-data': {
      const button = requireValue(
        preferredComponent(context, 'nova.button', 'click', options.target),
        'This template needs a button with a click event.'
      );
      const modal = requireValue(
        firstModal(context),
        'This template needs a modal with an open event.'
      );
      const query = requireValue(firstQuery(context), 'This template needs a data query.');
      const property = requireValue(
        getPropertyOptions(modal.value, context)[0],
        'This template needs a writable modal property.'
      );
      const mappingProbe = createGuidedNode('fetch-data', context, {
        config: { queryId: query.value, dataSourceId: querySourceId(context, query.value) },
        label: 'Fetch records'
      });
      const source = requireValue(
        getMappingSources(mappingProbe, context)[0],
        'This template needs at least one query field.'
      );

      const trigger = add(
        createGuidedNode('start-from-component', context, {
          config: { sourceComponentId: button.id, sourceEventName: 'click' },
          target: reference(button, 'click'),
          label: 'Button clicked',
          usedIdentifiers: used
        })
      );
      const open = add(
        createGuidedNode('open-modal', context, {
          config: { targetComponentId: modal.value, targetAction: 'open' },
          label: 'Open details',
          usedIdentifiers: used
        })
      );
      const fetch = add(
        createGuidedNode('fetch-data', context, {
          config: { queryId: query.value, dataSourceId: querySourceId(context, query.value) },
          label: 'Fetch records',
          usedIdentifiers: used
        })
      );
      const fill = add(
        createGuidedNode('fill-modal', context, {
          config: {
            targetComponentId: modal.value,
            targetProperty: property.value,
            queryId: query.value
          },
          label: 'Fill details',
          usedIdentifiers: used
        })
      );
      const mappedFill = setGuidedMapping(fill, property.value, source.value);
      nodes[nodes.indexOf(fill)] = withHandling(mappedFill);

      connect(trigger, open, 'success');
      connect(open, fetch, 'success');
      connect(fetch, fill, 'success');
      break;
    }
    case 'form-validate-save': {
      const form = requireValue(firstForm(context), 'This template needs a form.');
      const dataSource = requireValue(
        firstDataSource(context),
        'This template needs a NOVA data source.'
      );
      const trigger = add(
        createGuidedNode('start-from-component', context, {
          config: { sourceComponentId: form.value, sourceEventName: 'submit' },
          target: reference(
            requireValue(
              context.components.find((component) => component.id === form.value),
              'The selected form is no longer available.'
            ),
            'submit'
          ),
          label: 'Form submitted',
          usedIdentifiers: used
        })
      );
      const validate = add(
        createGuidedNode('validate-form', context, {
          config: { formId: form.value, targetComponentId: form.value },
          label: 'Validate form',
          usedIdentifiers: used
        })
      );
      const save = add(
        createGuidedNode('save-data', context, {
          config: { dataSourceId: dataSource.value },
          label: 'Save data',
          usedIdentifiers: used
        })
      );
      const success = add(
        createGuidedNode('show-message', context, {
          config: { message: 'Saved successfully.' },
          label: 'Show success',
          usedIdentifiers: used
        })
      );
      connect(trigger, validate, 'success');
      connect(validate, save, 'success');
      connect(save, success, 'success');
      break;
    }
    case 'button-fetch-message': {
      const button = requireValue(
        preferredComponent(context, 'nova.button', 'click', options.target),
        'This template needs a button with a click event.'
      );
      const query = requireValue(firstQuery(context), 'This template needs a data query.');
      const trigger = add(
        createGuidedNode('start-from-component', context, {
          config: { sourceComponentId: button.id, sourceEventName: 'click' },
          target: reference(button, 'click'),
          label: 'Button clicked',
          usedIdentifiers: used
        })
      );
      const fetch = add(
        createGuidedNode('fetch-data', context, {
          config: { queryId: query.value, dataSourceId: querySourceId(context, query.value) },
          label: 'Fetch records',
          usedIdentifiers: used
        })
      );
      const message = add(
        createGuidedNode('show-message', context, {
          config: { message: 'Data loaded.' },
          label: 'Show message',
          usedIdentifiers: used
        })
      );
      connect(trigger, fetch, 'success');
      connect(fetch, message, 'success');
      break;
    }
    case 'form-validate-error': {
      const form = requireValue(firstForm(context), 'This template needs a form.');
      const trigger = add(
        createGuidedNode('start-from-component', context, {
          config: { sourceComponentId: form.value, sourceEventName: 'submit' },
          target: reference(
            requireValue(
              context.components.find((component) => component.id === form.value),
              'The selected form is no longer available.'
            ),
            'submit'
          ),
          label: 'Form submitted',
          usedIdentifiers: used
        })
      );
      const validate = add(
        createGuidedNode('validate-form', context, {
          config: { formId: form.value, targetComponentId: form.value },
          label: 'Validate form',
          usedIdentifiers: used
        })
      );
      const error = add(
        createGuidedNode('show-message', context, {
          config: { message: 'Please correct the highlighted fields.' },
          label: 'Show validation error',
          usedIdentifiers: used
        })
      );
      connect(trigger, validate, 'success');
      connect(validate, error, 'failure');
      break;
    }
  }

  return { nodes, edges };
}
