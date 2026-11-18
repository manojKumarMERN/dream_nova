import { describe, expect, it } from 'vitest';
import { NovaClient, NovaClientError } from '../src/index';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

describe('NovaClient', () => {
  it('normalizes origin base URLs to /api paths', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return jsonResponse({ valid: true, issues: [] });
    }) as typeof fetch;

    const client = new NovaClient({ baseUrl: 'http://localhost:3000///', fetch: fetchImpl });
    await client.validateDefinition({ schemaVersion: '1.0' });

    expect(calls[0]?.url).toBe('http://localhost:3000/api/v1/spec/validate');
    expect(calls[0]?.init.method).toBe('POST');
  });

  it('accepts base URLs that already include /api', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      return jsonResponse({ valid: true, issues: [] });
    }) as typeof fetch;

    const client = new NovaClient({ baseUrl: 'http://localhost:3000/api/', fetch: fetchImpl });
    await client.validateDefinition({ schemaVersion: '1.0' });

    expect(calls[0]).toBe('http://localhost:3000/api/v1/spec/validate');
  });

  it('keeps listComponents and includes error body details', async () => {
    const fetchImpl = (async () =>
      jsonResponse(
        { error: { code: 'NOT_FOUND', message: 'Missing', details: { id: 'x' } } },
        404
      )) as typeof fetch;
    const client = new NovaClient({ baseUrl: 'http://localhost:3000', fetch: fetchImpl });

    await expect(client.listComponents()).rejects.toMatchObject({
      name: 'NovaClientError',
      status: 404,
      code: 'NOT_FOUND',
      details: { id: 'x' }
    });
    expect(NovaClientError.name).toBe('NovaClientError');
  });
});
