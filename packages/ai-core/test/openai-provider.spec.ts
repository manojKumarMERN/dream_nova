import { describe, expect, it } from 'vitest';
import { OpenAiCompatibleLlmProvider } from '../src/index';

describe('OpenAiCompatibleLlmProvider', () => {
  it('uses structured JSON output without exposing the key in errors', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"ok":true}' } }],
          model: 'test-model'
        }),
        { status: 200 }
      );
    }) as typeof fetch;

    const provider = new OpenAiCompatibleLlmProvider({
      apiKey: 'secret-key',
      baseUrl: 'https://example.test/v1/',
      model: 'test-model',
      fetchImpl
    });
    const response = await provider.generateStructured<{ ok: boolean }>({
      schemaName: 'Test',
      schema: { type: 'object' },
      messages: [{ role: 'user', content: 'hello' }]
    });

    expect(response.value).toEqual({ ok: true });
    expect(calls[0]?.url).toBe('https://example.test/v1/chat/completions');
    expect(String(calls[0]?.init.body)).not.toContain('secret-key');
    expect((calls[0]?.init.headers as Record<string, string>)['authorization']).toBe(
      'Bearer secret-key'
    );

    const failingFetch = (async () => new Response('', { status: 401 })) as typeof fetch;
    const failing = new OpenAiCompatibleLlmProvider({
      apiKey: 'secret-key',
      fetchImpl: failingFetch
    });
    await expect(
      failing.generateStructured({ schemaName: 'Test', schema: {}, messages: [] })
    ).rejects.toThrow(/status 401/);
    await expect(
      failing.generateStructured({ schemaName: 'Test', schema: {}, messages: [] })
    ).rejects.not.toThrow(/secret-key/);
  });
});
