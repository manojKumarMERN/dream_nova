import { changeProposalSchema } from '@nova/proposal-model';
import type { ChangeProposal } from '@nova/proposal-model';
import { generateRedactedPromptContext } from './redaction';
import {
  isOpenAiCompatibleConfigured,
  OpenAiCompatibleLlmProvider,
  readOpenAiCompatibleConfig
} from './openai-provider';
import type { LlmProvider, ProposalGenerationRequest, ProposalGenerator } from './provider';
import { TemplateProposalGenerator } from './template-generator';

export interface ProposalGeneratorOptions {
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
  model?: string | undefined;
  provider?: LlmProvider | undefined;
}

const changeProposalJsonSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['baseVersionId', 'summary', 'rationale', 'riskLevel', 'operations'],
  properties: {
    baseVersionId: { type: 'string' },
    summary: { type: 'string', minLength: 1, maxLength: 500 },
    rationale: { type: 'string', maxLength: 2000 },
    riskLevel: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'DESTRUCTIVE'] },
    operations: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['op'],
        properties: {
          op: {
            type: 'string',
            enum: [
              'addComponent',
              'updateComponent',
              'removeComponent',
              'updateTheme',
              'addPage',
              'removePage'
            ]
          }
        }
      }
    }
  }
};

export class LlmProposalGenerator implements ProposalGenerator {
  constructor(private readonly provider: LlmProvider) {}

  async generateProposal(input: ProposalGenerationRequest): Promise<ChangeProposal> {
    const context = generateRedactedPromptContext(input.definition);
    const response = await this.provider.generateStructured<unknown>({
      schemaName: 'ChangeProposal',
      schema: changeProposalJsonSchema,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            `Instruction: ${input.instruction}`,
            `App context: ${JSON.stringify(context)}`,
            `Available component types: ${JSON.stringify(input.availableComponentTypes)}`,
            `Available component contracts: ${JSON.stringify(input.componentContracts ?? [])}`,
            `Target base version: ${input.baseVersionId ?? input.definition.appId}`
          ].join('\n')
        }
      ]
    });

    const parsed = changeProposalSchema.safeParse(response.value);
    if (!parsed.success) {
      throw new Error('The language model returned an invalid change proposal');
    }
    return parsed.data;
  }
}

export function createProposalGenerator(options: ProposalGeneratorOptions = {}): ProposalGenerator {
  if (options.provider !== undefined) {
    return new LlmProposalGenerator(options.provider);
  }

  const config = readOpenAiCompatibleConfig();
  const apiKey = options.apiKey ?? config.apiKey;
  if (isOpenAiCompatibleConfigured({ ...config, apiKey })) {
    return new LlmProposalGenerator(
      new OpenAiCompatibleLlmProvider({
        apiKey,
        baseUrl: options.baseUrl ?? config.baseUrl,
        model: options.model ?? config.model
      })
    );
  }

  return new TemplateProposalGenerator();
}
