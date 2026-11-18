import { describe, expect, it } from 'vitest';
import { NovaError, NovaErrorCodes } from '@nova/errors';
import {
  createMinimalAppDefinition,
  type AppDefinition,
  type ComponentNode,
  type WorkflowDefinition
} from '@nova/spec';
import { applyProposal, classifyProposalRisk, requiresApproval } from '../src/index';
import type { ChangeProposal } from '../src/index';

const ROOT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TEXT_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CONTAINER_ID = '55555555-5555-4555-8555-555555555555';
const NESTED_ID = '66666666-6666-4666-8666-666666666666';
const COPY_ID = 'abababab-abab-4bab-8bab-abababababab';
const WORKFLOW_ID = '77777777-7777-4777-8777-777777777777';
const STEP_ID = '28282828-2828-4828-8828-282828282828';

function proposalFor(
  operations: ChangeProposal['operations'],
  source?: ChangeProposal['source']
): ChangeProposal {
  return {
    baseVersionId: 'version-1',
    summary: 'Visual builder proposal',
    rationale: '',
    riskLevel: classifyProposalRisk(operations),
    operations,
    ...(source === undefined ? {} : { source })
  };
}

function containerNode(id: string, workflowId?: string): ComponentNode {
  return {
    id,
    type: 'nova.container',
    contractVersion: '1.0.0',
    props: { label: '' },
    ...(workflowId === undefined
      ? {}
      : { events: { click: { action: 'runWorkflow', params: { workflowId } } } })
  };
}

function textNode(id: string, content: string): ComponentNode {
  return {
    id,
    type: 'nova.text',
    contractVersion: '1.0.0',
    props: { content, variant: 'body' }
  };
}

function workflow(id: string, nodeId: string): WorkflowDefinition {
  return {
    id,
    name: 'On click',
    trigger: { event: 'click', nodeId },
    steps: [{ id: STEP_ID, type: 'notify' }],
    enabled: true
  };
}

function findNode(definition: AppDefinition, nodeId: string): ComponentNode | undefined {
  function visit(nodes: readonly ComponentNode[]): ComponentNode | undefined {
    for (const node of nodes) {
      if (node.id === nodeId) {
        return node;
      }
      const child = visit(node.children ?? []);
      if (child !== undefined) {
        return child;
      }
      for (const slotNodes of Object.values(node.slots ?? {})) {
        const slotChild = visit(slotNodes);
        if (slotChild !== undefined) {
          return slotChild;
        }
      }
    }
    return undefined;
  }

  return visit(definition.components);
}

function pageId(definition: AppDefinition): string {
  const page = definition.pages[0];
  if (page === undefined) {
    throw new Error('Fixture is missing the home page');
  }
  return page.id;
}

describe('visual builder operations', () => {
  it('adds components into named slots', () => {
    const definition = createMinimalAppDefinition();
    const result = applyProposal(
      proposalFor(
        [
          {
            op: 'addComponent',
            pageId: pageId(definition),
            parentId: ROOT_ID,
            node: containerNode(CONTAINER_ID)
          },
          {
            op: 'addComponent',
            pageId: pageId(definition),
            parentId: CONTAINER_ID,
            slot: 'default',
            node: textNode(NESTED_ID, 'Nested')
          }
        ],
        'editor'
      ),
      { baseDefinition: definition }
    );

    expect(findNode(result.definition, CONTAINER_ID)?.slots?.['default']?.[0]?.id).toBe(NESTED_ID);
  });

  it('moves components across slots and prevents cycles', () => {
    const definition = createMinimalAppDefinition();

    const moved = applyProposal(
      proposalFor([
        {
          op: 'addComponent',
          pageId: pageId(definition),
          parentId: ROOT_ID,
          node: containerNode(CONTAINER_ID)
        },
        {
          op: 'moveComponent',
          nodeId: TEXT_ID,
          parentId: CONTAINER_ID,
          slot: 'default',
          index: 0
        }
      ]),
      { baseDefinition: definition }
    );

    expect(moved.definition.components[0]?.children).toHaveLength(2);
    expect(findNode(moved.definition, CONTAINER_ID)?.slots?.['default']?.[0]?.id).toBe(TEXT_ID);

    const nested = createMinimalAppDefinition();
    const operations: ChangeProposal['operations'] = [
      {
        op: 'addComponent',
        pageId: pageId(nested),
        parentId: ROOT_ID,
        node: containerNode(CONTAINER_ID)
      },
      {
        op: 'addComponent',
        pageId: pageId(nested),
        parentId: CONTAINER_ID,
        slot: 'default',
        node: textNode(NESTED_ID, 'Nested')
      },
      { op: 'moveComponent', nodeId: CONTAINER_ID, parentId: NESTED_ID }
    ];

    try {
      applyProposal(proposalFor(operations), { baseDefinition: nested });
      throw new Error('Expected cycle prevention to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(NovaError);
      expect((error as NovaError).code).toBe(NovaErrorCodes.INVALID_PROPOSAL);
      expect((error as NovaError).message).toContain('descendant');
    }
  });

  it('duplicates subtrees with rewritten node and workflow ids', () => {
    const definition = createMinimalAppDefinition();
    const operations: ChangeProposal['operations'] = [
      { op: 'updateWorkflow', workflow: workflow(WORKFLOW_ID, CONTAINER_ID) },
      {
        op: 'addComponent',
        pageId: pageId(definition),
        parentId: ROOT_ID,
        node: containerNode(CONTAINER_ID, WORKFLOW_ID)
      },
      {
        op: 'addComponent',
        pageId: pageId(definition),
        parentId: CONTAINER_ID,
        slot: 'default',
        node: textNode(NESTED_ID, 'Nested')
      },
      {
        op: 'duplicateComponent',
        sourceNodeId: CONTAINER_ID,
        newNodeId: COPY_ID,
        parentId: ROOT_ID
      }
    ];

    const result = applyProposal(proposalFor(operations), { baseDefinition: definition });
    const copy = findNode(result.definition, COPY_ID);
    const copiedNestedId = copy?.slots?.['default']?.[0]?.id;

    expect(copy).toBeDefined();
    expect(copiedNestedId).toBeDefined();
    expect(copiedNestedId).not.toBe(NESTED_ID);
    expect(findNode(result.definition, NESTED_ID)).toBeDefined();
    expect(result.definition.workflows).toHaveLength(2);

    const copiedWorkflow = result.definition.workflows.find(
      (candidate) => candidate.id !== WORKFLOW_ID
    );
    expect(copiedWorkflow?.trigger.nodeId).toBe(COPY_ID);
    expect(copy?.events?.['click']?.params?.['workflowId']).toBe(copiedWorkflow?.id);
  });

  it('classifies approval risk for the new operations', () => {
    const destructive = proposalFor([
      { op: 'bulkDeleteComponents', nodeIds: [TEXT_ID] },
      { op: 'replaceDefinition', definition: createMinimalAppDefinition() }
    ]);
    expect(classifyProposalRisk(destructive.operations)).toBe('DESTRUCTIVE');
    expect(requiresApproval(destructive)).toBe(true);

    expect(classifyProposalRisk([{ op: 'removeWorkflow', workflowId: WORKFLOW_ID }])).toBe('HIGH');
    expect(
      classifyProposalRisk([{ op: 'moveComponent', nodeId: TEXT_ID, parentId: ROOT_ID }])
    ).toBe('LOW');
  });

  it('updates hidden, layout, breakpoint and binding state', () => {
    const definition = createMinimalAppDefinition();
    const updated = applyProposal(
      proposalFor([
        { op: 'setComponentHidden', nodeId: TEXT_ID, hidden: true },
        { op: 'resizeComponent', nodeId: TEXT_ID, layout: { display: 'flex', gap: 4 } },
        {
          op: 'updateBreakpointOverrides',
          nodeId: TEXT_ID,
          breakpoint: 'mobile',
          layout: { padding: 4 }
        },
        {
          op: 'updateBinding',
          nodeId: TEXT_ID,
          prop: 'value',
          binding: { source: 'state', path: 'visible', kind: 'state' }
        }
      ]),
      { baseDefinition: definition }
    );

    const node = findNode(updated.definition, TEXT_ID);
    expect(node?.hidden).toBe(true);
    expect(node?.layout).toEqual({ display: 'flex', gap: 4 });
    expect(node?.breakpointOverrides?.['mobile']).toEqual({ padding: 4 });
    expect(node?.bindings?.['value']?.path).toBe('visible');

    const cleared = applyProposal(
      proposalFor([
        {
          op: 'updateBreakpointOverrides',
          nodeId: TEXT_ID,
          breakpoint: 'mobile',
          layout: null
        },
        { op: 'updateBinding', nodeId: TEXT_ID, prop: 'value', binding: null }
      ]),
      { baseDefinition: definition }
    );

    expect(findNode(cleared.definition, TEXT_ID)?.breakpointOverrides?.['mobile']).toBeUndefined();
    expect(findNode(cleared.definition, TEXT_ID)?.bindings).toBeUndefined();
  });

  it('maintains workflows and rejects unknown removals', () => {
    const definition = createMinimalAppDefinition();
    const added = applyProposal(
      proposalFor([{ op: 'updateWorkflow', workflow: workflow(WORKFLOW_ID, TEXT_ID) }]),
      { baseDefinition: definition }
    );
    expect(added.definition.workflows).toHaveLength(1);

    const replacement = workflow(WORKFLOW_ID, TEXT_ID);
    replacement.name = 'Replaced';
    const replaced = applyProposal(proposalFor([{ op: 'updateWorkflow', workflow: replacement }]), {
      baseDefinition: added.definition
    });
    expect(replaced.definition.workflows).toHaveLength(1);
    expect(replaced.definition.workflows[0]?.name).toBe('Replaced');

    const removed = applyProposal(
      proposalFor([{ op: 'removeWorkflow', workflowId: WORKFLOW_ID }]),
      { baseDefinition: replaced.definition, approved: true }
    );
    expect(removed.definition.workflows).toHaveLength(0);

    try {
      applyProposal(proposalFor([{ op: 'removeWorkflow', workflowId: WORKFLOW_ID }]), {
        baseDefinition: removed.definition,
        approved: true
      });
      throw new Error('Expected unknown workflow removal to fail');
    } catch (error) {
      expect((error as NovaError).code).toBe(NovaErrorCodes.INVALID_PROPOSAL);
    }
  });

  it('prunes editor locks when bulk deleting components', () => {
    const definition = createMinimalAppDefinition();
    definition.metadata.editorLocks = [TEXT_ID];

    const result = applyProposal(
      proposalFor([{ op: 'bulkDeleteComponents', nodeIds: [TEXT_ID] }]),
      {
        baseDefinition: definition,
        approved: true
      }
    );

    expect(findNode(result.definition, TEXT_ID)).toBeUndefined();
    expect(result.definition.metadata.editorLocks).toEqual([]);
  });

  it('replaces definitions only with valid content', () => {
    const definition = createMinimalAppDefinition();
    const replacement = createMinimalAppDefinition();
    replacement.name = 'Replaced App';

    const result = applyProposal(
      proposalFor([{ op: 'replaceDefinition', definition: replacement }]),
      {
        baseDefinition: definition,
        approved: true
      }
    );
    expect(result.definition.name).toBe('Replaced App');

    const invalidDefinition = createMinimalAppDefinition();
    const child = invalidDefinition.components[0]?.children?.[0];
    if (child === undefined) {
      throw new Error('Fixture is missing a child node');
    }
    child.type = 'nova.unknown';

    try {
      applyProposal(proposalFor([{ op: 'replaceDefinition', definition: invalidDefinition }]), {
        baseDefinition: definition,
        approved: true
      });
      throw new Error('Expected invalid replacement to fail');
    } catch (error) {
      expect((error as NovaError).code).toBe(NovaErrorCodes.VALIDATION_FAILED);
    }

    const malformed = {
      op: 'replaceDefinition',
      definition: { ...replacement, schemaVersion: '2.0' }
    } as unknown as ChangeProposal['operations'][number];

    try {
      applyProposal(proposalFor([malformed]), { baseDefinition: definition, approved: true });
      throw new Error('Expected malformed replacement to fail');
    } catch (error) {
      expect((error as NovaError).code).toBe(NovaErrorCodes.INVALID_PROPOSAL);
    }
  });
});
