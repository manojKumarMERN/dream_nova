import type { ChangeProposal } from '@nova/proposal-model';
import type { AppDefinition } from '@nova/spec';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StructuredOutputRequest {
  schemaName: string;
  schema: Record<string, unknown>;
  messages: readonly LlmMessage[];
  temperature?: number | undefined;
}

export interface StructuredOutputResponse<T> {
  value: T;
  provider: string;
  model: string;
  usage?:
    | {
        inputTokens: number;
        outputTokens: number;
      }
    | undefined;
}

export interface LlmProvider {
  readonly name: string;
  generateStructured<T>(request: StructuredOutputRequest): Promise<StructuredOutputResponse<T>>;
}

export interface ComponentContractInfo {
  type: string;
  version: string;
  displayName: string;
  category: string;
  capabilities: readonly string[];
  propsSchema: Record<string, unknown>;
  defaults: Record<string, unknown>;
}

export interface ProposalGenerationInput {
  definition: AppDefinition;
  instruction: string;
  availableComponentTypes: readonly string[];
}

export interface ProposalGenerationRequest extends ProposalGenerationInput {
  appId?: string | undefined;
  baseVersionId?: string | undefined;
  pageName?: string | undefined;
  selectedNodeIds?: string[] | undefined;
  componentContracts?: readonly ComponentContractInfo[] | undefined;
}

export interface ProposalGenerator {
  generateProposal(input: ProposalGenerationRequest): Promise<ChangeProposal>;
}
