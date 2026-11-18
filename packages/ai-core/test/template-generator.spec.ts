import { describe, expect, it } from 'vitest';
import { applyProposal, changeProposalSchema } from '@nova/proposal-model';
import { createMinimalAppDefinition } from '@nova/spec';
import type { ComponentContractInfo } from '../src/index';
import { createProposalGenerator, TemplateProposalGenerator } from '../src/index';

const contracts: ComponentContractInfo[] = [
  {
    type: 'nova.stack',
    version: '1.0.0',
    displayName: 'Stack',
    category: 'layout',
    capabilities: ['layout', 'nested-children'],
    propsSchema: { properties: { direction: {}, gap: {} } },
    defaults: { direction: 'column', gap: 8 }
  },
  {
    type: 'nova.text',
    version: '1.0.0',
    displayName: 'Text',
    category: 'display',
    capabilities: ['text-rendering'],
    propsSchema: { properties: { content: {}, variant: {} } },
    defaults: { content: '', variant: 'body' }
  },
  {
    type: 'nova.text-input',
    version: '1.0.0',
    displayName: 'Text Input',
    category: 'input',
    capabilities: ['interaction', 'data-entry'],
    propsSchema: { properties: { label: {} } },
    defaults: { label: 'Label', placeholder: '', required: false }
  },
  {
    type: 'nova.form',
    version: '1.0.0',
    displayName: 'Form',
    category: 'data',
    capabilities: ['data-entry', 'nested-children'],
    propsSchema: { properties: { submitLabel: {} } },
    defaults: { submitLabel: 'Submit' }
  }
];

const availableTypes = contracts.map((contract) => contract.type);

describe('TemplateProposalGenerator', () => {
  const generator = new TemplateProposalGenerator();

  it('generates a valid form page proposal that applies cleanly', async () => {
    const definition = createMinimalAppDefinition();
    const proposal = await generator.generateProposal({
      definition,
      instruction: 'Create a contact form page',
      pageName: 'Contact',
      baseVersionId: 'version-1',
      availableComponentTypes: availableTypes,
      componentContracts: contracts
    });

    expect(changeProposalSchema.safeParse(proposal).success).toBe(true);
    expect(proposal.operations.some((operation) => operation.op === 'addPage')).toBe(true);
    expect(proposal.operations.some((operation) => operation.op === 'addComponent')).toBe(true);

    const applied = applyProposal(proposal, { baseDefinition: definition });
    expect(applied.validation.valid).toBe(true);
    expect(applied.definition.pages).toHaveLength(2);
  });

  it('generates a valid section proposal', async () => {
    const definition = createMinimalAppDefinition();
    const proposal = await generator.generateProposal({
      definition,
      instruction: 'Add a section with a heading',
      availableComponentTypes: availableTypes,
      componentContracts: contracts
    });

    const applied = applyProposal(proposal, { baseDefinition: definition });
    expect(applied.validation.valid).toBe(true);
    expect(proposal.operations.some((operation) => operation.op === 'addComponent')).toBe(true);
    expect(applied.definition.components[0]?.children?.length).toBeGreaterThan(2);
  });

  it('generates a valid text proposal for unknown instructions', async () => {
    const definition = createMinimalAppDefinition();
    const proposal = await generator.generateProposal({
      definition,
      instruction: 'show a welcome message',
      availableComponentTypes: availableTypes,
      componentContracts: contracts
    });

    expect(applyProposal(proposal, { baseDefinition: definition }).validation.valid).toBe(true);
  });

  it('falls back to the deterministic generator without configuration', async () => {
    const generatorFromFactory = createProposalGenerator({ apiKey: '' });
    expect(generatorFromFactory).toBeInstanceOf(TemplateProposalGenerator);

    const definition = createMinimalAppDefinition();
    const proposal = await generatorFromFactory.generateProposal({
      definition,
      instruction: 'add text',
      availableComponentTypes: availableTypes,
      componentContracts: contracts
    });
    expect(changeProposalSchema.safeParse(proposal).success).toBe(true);
  });
});
