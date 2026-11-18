import { randomUUID } from 'node:crypto';
import { classifyProposalRisk } from '@nova/proposal-model';
import type { ChangeProposal, ProposalOperation } from '@nova/proposal-model';
import type { AppDefinition, ComponentNode } from '@nova/spec';
import type {
  ComponentContractInfo,
  ProposalGenerationRequest,
  ProposalGenerator
} from './provider';

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'generated-page' : slug.slice(0, 80);
}

function pickContract(
  contracts: readonly ComponentContractInfo[],
  availableTypes: readonly string[],
  predicate: (contract: ComponentContractInfo) => boolean,
  fallbackType: string
): ComponentContractInfo | undefined {
  const fromContracts = contracts.find(predicate);
  if (fromContracts !== undefined) {
    return fromContracts;
  }
  const type = availableTypes.find((candidate) => candidate === fallbackType);
  if (type === undefined) {
    return undefined;
  }
  return {
    type,
    version: '1.0.0',
    displayName: type,
    category: 'custom',
    capabilities: [],
    propsSchema: {},
    defaults: {}
  };
}

function propsFor(
  contract: ComponentContractInfo,
  overrides: Record<string, unknown>
): Record<string, unknown> {
  const props: Record<string, unknown> = { ...contract.defaults };
  const properties = contract.propsSchema['properties'];
  const allowed =
    properties !== null && typeof properties === 'object'
      ? Object.keys(properties as Record<string, unknown>)
      : [];
  for (const [key, value] of Object.entries(overrides)) {
    if (key in props || allowed.includes(key)) {
      props[key] = value;
    }
  }
  return props;
}

function makeNode(
  contract: ComponentContractInfo,
  id: string,
  overrides: Record<string, unknown>
): ComponentNode {
  return {
    id,
    type: contract.type,
    contractVersion: contract.version,
    props: propsFor(contract, overrides)
  };
}

function hasNode(nodes: readonly ComponentNode[], id: string): boolean {
  for (const node of nodes) {
    if (node.id === id) {
      return true;
    }
    if (hasNode(node.children ?? [], id)) {
      return true;
    }
    if (Object.values(node.slots ?? {}).some((slotNodes) => hasNode(slotNodes, id))) {
      return true;
    }
  }
  return false;
}

function resolveParent(
  definition: AppDefinition,
  input: ProposalGenerationRequest
): { pageId: string; parentId: string } {
  const selected = (input.selectedNodeIds ?? []).find((id) => hasNode(definition.components, id));
  if (selected !== undefined) {
    const page = definition.pages.find((candidate) => candidate.rootNodeId === selected);
    const pageId = page?.id ?? definition.pages[0]?.id;
    if (pageId !== undefined) {
      return { pageId, parentId: selected };
    }
  }

  const page = definition.pages[0];
  if (page === undefined) {
    throw new Error('Cannot generate a proposal for a definition without pages');
  }
  return { pageId: page.id, parentId: page.rootNodeId };
}

export class TemplateProposalGenerator implements ProposalGenerator {
  async generateProposal(input: ProposalGenerationRequest): Promise<ChangeProposal> {
    const instruction = input.instruction.toLowerCase();
    const contracts = input.componentContracts ?? [];
    const available = input.availableComponentTypes;
    const isForm = /\b(form|input|submit|signup|login|contact)\b/.test(instruction);
    const isSection = /\b(section|layout|stack|container|panel|card)\b/.test(instruction);
    const wantsPage = input.pageName !== undefined || /\b(page|screen|view)\b/.test(instruction);

    const stackContract = pickContract(
      contracts,
      available,
      (contract) => contract.category === 'layout' || contract.capabilities.includes('layout'),
      'nova.stack'
    );
    const textContract = pickContract(
      contracts,
      available,
      (contract) =>
        contract.category === 'display' || contract.capabilities.includes('text-rendering'),
      'nova.text'
    );
    const formContract = pickContract(
      contracts,
      available,
      (contract) => contract.category === 'data' || contract.type.includes('form'),
      'nova.form'
    );
    const inputContract = pickContract(
      contracts,
      available,
      (contract) =>
        contract.type.includes('input') ||
        (contract.capabilities.includes('data-entry') && !contract.type.includes('form')),
      'nova.text-input'
    );

    const contentContract = isForm
      ? formContract
      : isSection
        ? (stackContract ?? textContract)
        : textContract;
    if (contentContract === undefined) {
      throw new Error('No registered component contract matches the instruction');
    }

    const operations: ProposalOperation[] = [];
    let pageId: string;
    let parentId: string;

    if (wantsPage) {
      pageId = randomUUID();
      const rootNodeId = randomUUID();
      const pageName = (input.pageName ?? 'Generated Page').slice(0, 120);
      operations.push({
        op: 'addPage',
        page: {
          id: pageId,
          name: pageName,
          route: `/${slugify(pageName)}`,
          rootNodeId,
          settings: {}
        }
      });

      const rootContract = stackContract ?? contentContract;
      operations.push({
        op: 'addComponent',
        pageId,
        parentId: rootNodeId,
        node: makeNode(rootContract, rootNodeId, { direction: 'column', gap: 8 })
      });
      parentId = rootNodeId;

      if (rootContract !== contentContract) {
        const content = this.buildContent(contentContract, inputContract, input.instruction);
        operations.push({
          op: 'addComponent',
          pageId,
          parentId,
          node: content
        });
      }
    } else {
      const resolved = resolveParent(input.definition, input);
      pageId = resolved.pageId;
      parentId = resolved.parentId;
      operations.push({
        op: 'addComponent',
        pageId,
        parentId,
        node: this.buildContent(contentContract, inputContract, input.instruction)
      });
    }

    return {
      baseVersionId: input.baseVersionId ?? input.definition.appId,
      summary: `Generated ${isForm ? 'form' : isSection ? 'section' : 'text'} from instruction`,
      rationale: input.instruction.slice(0, 500),
      riskLevel: classifyProposalRisk(operations),
      operations
    };
  }

  private buildContent(
    contract: ComponentContractInfo,
    inputContract: ComponentContractInfo | undefined,
    instruction: string
  ): ComponentNode {
    if (contract.type.includes('form') || contract.capabilities.includes('data-entry')) {
      const fields =
        inputContract === undefined
          ? []
          : [makeNode(inputContract, randomUUID(), { label: 'Name' })];
      const node = makeNode(contract, randomUUID(), {
        submitLabel: 'Submit',
        label: instruction.slice(0, 80)
      });
      if (fields.length > 0) {
        return { ...node, slots: { fields } };
      }
      return node;
    }

    if (contract.category === 'layout' || contract.capabilities.includes('layout')) {
      const child = makeNode(
        {
          type: 'nova.text',
          version: '1.0.0',
          displayName: 'Text',
          category: 'display',
          capabilities: ['text-rendering'],
          propsSchema: {},
          defaults: { content: '', variant: 'body' }
        },
        randomUUID(),
        { content: instruction.slice(0, 200), variant: 'body' }
      );
      return {
        ...makeNode(contract, randomUUID(), { direction: 'column', gap: 8 }),
        children: [child]
      };
    }

    return makeNode(contract, randomUUID(), {
      content: instruction.slice(0, 200),
      variant: 'body'
    });
  }
}
