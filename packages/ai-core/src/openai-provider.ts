import type {
  LlmMessage,
  LlmProvider,
  StructuredOutputRequest,
  StructuredOutputResponse
} from './provider';

export interface OpenAiCompatibleProviderOptions {
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
  model?: string | undefined;
  fetchImpl?: typeof fetch | undefined;
}

type Environment = Record<string, string | undefined>;

function trimValue(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === '' ? undefined : value.trim();
}

export function readOpenAiCompatibleConfig(
  environment: Environment = process.env as Environment
): OpenAiCompatibleProviderOptions {
  return {
    apiKey: trimValue(environment['NOVA_AI_API_KEY']),
    baseUrl: trimValue(environment['NOVA_AI_BASE_URL']),
    model: trimValue(environment['NOVA_AI_MODEL'])
  };
}

export function isOpenAiCompatibleConfigured(
  options: OpenAiCompatibleProviderOptions = readOpenAiCompatibleConfig()
): boolean {
  return trimValue(options.apiKey) !== undefined;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }> | undefined;
  model?: string | undefined;
  usage?: { prompt_tokens?: number; completion_tokens?: number } | undefined;
}

export class OpenAiCompatibleLlmProvider implements LlmProvider {
  readonly name = 'openai-compatible';
  readonly model: string;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAiCompatibleProviderOptions = {}) {
    const config = { ...readOpenAiCompatibleConfig(), ...options };
    const apiKey = trimValue(config.apiKey);
    if (apiKey === undefined) {
      throw new Error('OpenAI-compatible API key is required');
    }

    this.apiKey = apiKey;
    this.baseUrl = (config.baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
    this.model = config.model ?? 'gpt-4o-mini';
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async generateStructured<T>(
    request: StructuredOutputRequest
  ): Promise<StructuredOutputResponse<T>> {
    const systemMessage: LlmMessage = {
      role: 'system',
      content: [
        'Return only a single valid JSON object and no markdown or commentary.',
        `The object must conform to the ${request.schemaName} JSON schema.`,
        `JSON schema: ${JSON.stringify(request.schema)}`
      ].join('\n')
    };

    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        temperature: request.temperature ?? 0,
        response_format: { type: 'json_object' },
        messages: [systemMessage, ...request.messages]
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI-compatible request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as ChatCompletionResponse;
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('OpenAI-compatible response did not include JSON content');
    }

    let value: T;
    try {
      value = JSON.parse(content) as T;
    } catch {
      throw new Error('OpenAI-compatible response was not valid JSON');
    }

    const inputTokens = payload.usage?.prompt_tokens;
    const outputTokens = payload.usage?.completion_tokens;
    return {
      value,
      provider: this.name,
      model: payload.model ?? this.model,
      ...(inputTokens === undefined || outputTokens === undefined
        ? {}
        : { usage: { inputTokens, outputTokens } })
    };
  }
}
