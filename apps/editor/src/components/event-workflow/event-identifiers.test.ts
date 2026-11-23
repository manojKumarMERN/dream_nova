import type { WorkflowEventConfiguration } from '@nova/spec';
import { describe, expect, it } from 'vitest';
import { readAuthoringMetadata } from './authoring';
import {
  applyGeneratedIdentifiers,
  generateEventIdentifiers,
  normalizeIdentifier,
  withManualIdentifier
} from './event-identifiers';

const BUTTON_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const OTHER_BUTTON_ID = '11111111-1111-4111-8111-111111111111';
const QUERY_ID = '33333333-3333-4333-8333-333333333333';

function baseEvent(): WorkflowEventConfiguration {
  return {
    name: 'Event',
    identifier: 'existing.identifier',
    source: 'application'
  };
}

describe('event identifiers', () => {
  it('generates deterministic identifiers from stable inputs', () => {
    const input = {
      intent: 'button-clicked' as const,
      sourceComponentId: BUTTON_ID,
      sourceComponentType: 'nova.button',
      sourceEventName: 'click'
    };

    expect(generateEventIdentifiers(input)).toEqual({
      identifier: 'ui.button.clicked'
    });
    expect(generateEventIdentifiers(input)).toEqual(generateEventIdentifiers(input));
  });

  it('keeps generated identifiers unique for different components', () => {
    const input = {
      intent: 'button-clicked' as const,
      sourceComponentId: BUTTON_ID,
      sourceComponentType: 'nova.button',
      sourceEventName: 'click'
    };
    const first = generateEventIdentifiers(input);
    const secondInput = { ...input, sourceComponentId: OTHER_BUTTON_ID };
    const second = generateEventIdentifiers(secondInput, new Set([first.identifier]));

    expect(second.identifier).not.toBe(first.identifier);
    expect(generateEventIdentifiers(secondInput, new Set([first.identifier]))).toEqual(second);
    expect(second.identifier).toMatch(/^ui\.button\.clicked\.[0-9a-z]+$/);
  });

  it('normalizes identifiers and generates request/response pairs', () => {
    expect(normalizeIdentifier('Customer  API!! Get--Data')).toBe('customer.api.get.data');

    const generated = generateEventIdentifiers({
      intent: 'fetch-data',
      queryId: QUERY_ID,
      queryName: 'Customer API!!'
    });
    expect(generated).toEqual({
      identifier: 'data.customer.api.fetch.requested',
      incomingIdentifier: 'data.customer.api.fetch.responded'
    });
  });

  it('preserves existing and manually overridden identifiers', () => {
    const legacy = baseEvent();
    expect(applyGeneratedIdentifiers(legacy, { intent: 'button-clicked' })).toBe(legacy);

    const manual = withManualIdentifier(legacy, 'custom.order.placed', 'button-clicked');
    expect(manual.identifier).toBe('custom.order.placed');
    expect(readAuthoringMetadata(manual)?.identifierOrigin).toBe('manual');
    expect(
      applyGeneratedIdentifiers(manual, {
        intent: 'button-clicked',
        sourceComponentId: BUTTON_ID,
        sourceComponentType: 'nova.button',
        sourceEventName: 'click'
      })
    ).toBe(manual);
  });

  it('generates identifiers and response contracts for generated nodes', () => {
    const generated = applyGeneratedIdentifiers(
      { name: 'Fetch customer', identifier: '', source: '' },
      {
        intent: 'fetch-data',
        queryId: QUERY_ID,
        queryName: 'Customer API',
        sourceComponentId: BUTTON_ID
      }
    );

    expect(generated.identifier).toBe('data.customer.api.fetch.requested');
    expect(generated.incomingIdentifier).toBe('data.customer.api.fetch.responded');
    expect(generated.source).toBe(`component:${BUTTON_ID}`);
    expect(generated.correlationKey).toBe('event.correlationId');
    expect(readAuthoringMetadata(generated)?.identifierOrigin).toBe('generated');
  });
});
