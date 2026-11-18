import { describe, expect, it } from 'vitest';
import { NovaError, NovaErrorCodes } from '@nova/errors';
import { createMinimalAppDefinition } from '@nova/spec';
import { applyProposal, classifyProposalRisk, requiresApproval } from '../src/index';
import type { ChangeProposal } from '../src/index';

function proposalFor(operations: ChangeProposal['operations']): ChangeProposal {
  return {
    baseVersionId: 'version-1',
    summary: 'Test proposal',
    rationale: '',
    riskLevel: classifyProposalRisk(operations),
    operations
  };
}

describe('applyProposal', () => {
  it('applies a low-risk component addition', () => {
    const definition = createMinimalAppDefinition();
    const root = definition.components[0];
    if (root === undefined) {
      throw new Error('Fixture is missing the root node');
    }

    const result = applyProposal(
      proposalFor([
        {
          op: 'addComponent',
          pageId: definition.pages[0]?.id ?? '',
          parentId: root.id,
          node: {
            id: '99999999-9999-4999-8999-999999999999',
            type: 'nova.text',
            contractVersion: '1.0.0',
            props: {
              content: 'Added by AI',
              variant: 'body'
            }
          }
        }
      ]),
      { baseDefinition: definition }
    );

    expect(result.validation.valid).toBe(true);
    expect(result.definition.components[0]?.children).toHaveLength(3);
  });

  it('requires approval for destructive changes', () => {
    const definition = createMinimalAppDefinition();
    const root = definition.components[0];
    const childId = root?.children?.[0]?.id;
    if (childId === undefined) {
      throw new Error('Fixture is missing a removable child');
    }

    const proposal = proposalFor([{ op: 'removeComponent', nodeId: childId }]);

    expect(requiresApproval(proposal)).toBe(true);
    expect(() => applyProposal(proposal, { baseDefinition: definition })).toThrow(
      'requires approval before apply'
    );

    const result = applyProposal(proposal, { baseDefinition: definition, approved: true });
    expect(result.definition.components[0]?.children).toHaveLength(1);
  });

  it('refuses to remove a page root even when approved', () => {
    const definition = createMinimalAppDefinition();
    const rootId = definition.components[0]?.id;
    if (rootId === undefined) {
      throw new Error('Fixture is missing the root node');
    }

    try {
      applyProposal(proposalFor([{ op: 'removeComponent', nodeId: rootId }]), {
        baseDefinition: definition,
        approved: true
      });
      throw new Error('Expected root removal to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(NovaError);
      expect((error as NovaError).code).toBe(NovaErrorCodes.INVALID_PROPOSAL);
    }
  });

  it('rejects a proposal that would invalidate the definition', () => {
    const definition = createMinimalAppDefinition();
    const buttonId = definition.components[0]?.children?.[1]?.id;
    if (buttonId === undefined) {
      throw new Error('Fixture is missing the button node');
    }

    try {
      applyProposal(
        proposalFor([
          {
            op: 'updateComponent',
            nodeId: buttonId,
            patch: {
              props: {
                label: ''
              }
            }
          }
        ]),
        { baseDefinition: definition }
      );
      throw new Error('Expected invalid props to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(NovaError);
      expect((error as NovaError).code).toBe(NovaErrorCodes.VALIDATION_FAILED);
    }
  });
});
