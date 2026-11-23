import type { WorkflowEventConfiguration } from '@nova/spec';
import { describe, expect, it } from 'vitest';
import {
  clearAuthoringMetadata,
  createAuthoringMetadata,
  parseAuthoringMetadata,
  readAuthoringMetadata,
  updateAuthoringMetadata,
  writeAuthoringMetadata
} from './authoring';

const COMPONENT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const MODAL_ID = '11111111-1111-4111-8111-111111111111';
const DATA_SOURCE_ID = '22222222-2222-4222-8222-222222222222';
const QUERY_ID = '33333333-3333-4333-8333-333333333333';

function baseEvent(): WorkflowEventConfiguration {
  return {
    name: 'Legacy event',
    identifier: 'ui.legacy',
    source: 'application'
  };
}

describe('workflow authoring metadata', () => {
  it('creates and reads typed authoring metadata', () => {
    const event = writeAuthoringMetadata(
      baseEvent(),
      createAuthoringMetadata({
        intent: 'button-clicked',
        sourceComponentId: COMPONENT_ID,
        sourceComponentType: 'nova.button',
        sourceEventName: 'click',
        generatedIdentifier: 'ui.button.clicked',
        requestMapping: { customerId: 'event.customerId', bad: 'window.secret' }
      })
    );

    expect(readAuthoringMetadata(event)).toEqual({
      version: 1,
      intent: 'button-clicked',
      sourceComponentId: COMPONENT_ID,
      sourceComponentType: 'nova.button',
      sourceEventName: 'click',
      requestMapping: { customerId: 'event.customerId' },
      generatedIdentifier: 'ui.button.clicked',
      identifierOrigin: 'generated'
    });
  });

  it('preserves unrelated metadata when updating or clearing the namespace', () => {
    const initial = writeAuthoringMetadata(
      {
        ...baseEvent(),
        metadata: {
          brand: 'nova',
          nova: { designer: 'visual', ui: { intent: 'unknown' } }
        }
      },
      createAuthoringMetadata({
        intent: 'open-modal',
        targetComponentId: MODAL_ID,
        generatedIdentifier: 'ui.modal.open'
      })
    );

    const updated = updateAuthoringMetadata(initial, {
      intent: 'update-component',
      targetAction: 'fill'
    });
    expect((updated.metadata as Record<string, unknown>).brand).toBe('nova');
    expect(
      ((updated.metadata as Record<string, unknown>).nova as Record<string, unknown>).designer
    ).toBe('visual');
    expect(readAuthoringMetadata(updated)?.intent).toBe('update-component');
    expect(readAuthoringMetadata(updated)?.targetComponentId).toBe(MODAL_ID);

    const cleared = clearAuthoringMetadata(updated);
    expect(readAuthoringMetadata(cleared)).toBeUndefined();
    expect((cleared.metadata as Record<string, unknown>).brand).toBe('nova');
    expect(
      ((cleared.metadata as Record<string, unknown>).nova as Record<string, unknown>).designer
    ).toBe('visual');
  });

  it('handles legacy workflows and rejects invalid metadata', () => {
    const legacy = baseEvent();
    expect(readAuthoringMetadata(legacy)).toBeUndefined();
    expect(
      parseAuthoringMetadata({ version: 1, intent: 'unknown', identifierOrigin: 'legacy' })
    ).toBeUndefined();
    expect(
      parseAuthoringMetadata({ version: 1, intent: 'fetch-data', identifierOrigin: 'manual' })
    ).toMatchObject({ intent: 'fetch-data', identifierOrigin: 'manual' });
  });

  it('validates reference ids and safe mapping expressions', () => {
    const metadata = createAuthoringMetadata({
      intent: 'fetch-data',
      sourceComponentId: 'not-a-uuid',
      dataSourceId: DATA_SOURCE_ID,
      queryId: QUERY_ID,
      responseMapping: {
        data: 'payload.data',
        status: 'payload.status',
        unsafe: 'window.location'
      }
    });

    expect(metadata.sourceComponentId).toBeUndefined();
    expect(metadata.dataSourceId).toBe(DATA_SOURCE_ID);
    expect(metadata.queryId).toBe(QUERY_ID);
    expect(metadata.responseMapping).toEqual({ data: 'payload.data', status: 'payload.status' });
  });
});
