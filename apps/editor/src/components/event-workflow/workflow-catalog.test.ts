import { createMinimalAppDefinition } from '@nova/spec';
import type { AppDefinition } from '@nova/spec';
import { describe, expect, it } from 'vitest';
import { BUILT_IN_CONTRACTS } from '../../contracts';
import {
  discoverComponentEvents,
  discoverOverlayTargets,
  discoverWorkflowComponents,
  resolveWorkflowComponent,
  validateWorkflowComponentReference
} from './workflow-catalog';

const BUTTON_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const MODAL_ID = '11111111-1111-4111-8111-111111111111';
const DIALOG_ID = '22222222-2222-4222-8222-222222222222';
const DRAWER_ID = '33333333-3333-4333-8333-333333333333';
const UNKNOWN_ID = '44444444-4444-4444-8444-444444444444';

function definitionWithOverlays(): AppDefinition {
  const definition = createMinimalAppDefinition();
  definition.components.push(
    {
      id: MODAL_ID,
      type: 'nova.modal',
      contractVersion: '1.0.0',
      name: 'Customer Modal',
      props: { title: 'Customer', open: false }
    },
    {
      id: DIALOG_ID,
      type: 'nova.dialog',
      contractVersion: '1.0.0',
      name: 'Confirm Dialog',
      props: { open: false }
    },
    {
      id: DRAWER_ID,
      type: 'nova.drawer',
      contractVersion: '1.0.0',
      props: { open: false }
    },
    {
      id: UNKNOWN_ID,
      type: 'custom.unknown',
      contractVersion: '1.0.0',
      props: {}
    }
  );
  return definition;
}

describe('workflow component discovery', () => {
  it('discovers components and declared events from actual contracts', () => {
    const definition = createMinimalAppDefinition();
    const components = discoverWorkflowComponents(definition, BUILT_IN_CONTRACTS);
    const button = components.find((component) => component.id === BUTTON_ID);

    expect(button).toMatchObject({
      id: BUTTON_ID,
      type: 'nova.button',
      displayName: 'Button',
      hasContract: true
    });
    expect(button?.events.map((event) => event.name)).toContain('click');
    expect(discoverComponentEvents(definition, BUILT_IN_CONTRACTS, BUTTON_ID)).toEqual(
      button?.events
    );
  });

  it('respects modal, dialog and drawer event distinctions', () => {
    const definition = definitionWithOverlays();
    const targets = discoverOverlayTargets(definition, BUILT_IN_CONTRACTS);
    const byId = new Map(targets.map((target) => [target.id, target]));

    expect(byId.get(MODAL_ID)?.displayName).toBe('Customer Modal');
    expect(byId.get(MODAL_ID)?.supportedEvents).toEqual(['open', 'close']);
    expect(byId.get(DIALOG_ID)?.supportedEvents).toEqual(['confirm', 'cancel']);
    expect(byId.get(DIALOG_ID)?.supportedEvents).not.toContain('open');
    expect(byId.get(DRAWER_ID)?.supportedEvents).toEqual(['open', 'close']);
    expect(byId.get(MODAL_ID)?.supportsOpenProp).toBe(true);
    expect(byId.get(DIALOG_ID)?.supportsOpenProp).toBe(true);
  });

  it('handles missing components and contracts safely', () => {
    const definition = definitionWithOverlays();
    const missingComponent = resolveWorkflowComponent(
      definition,
      BUILT_IN_CONTRACTS,
      '99999999-9999-4999-8999-999999999999'
    );
    const missingContract = resolveWorkflowComponent(definition, BUILT_IN_CONTRACTS, UNKNOWN_ID);

    expect(missingComponent.status).toBe('missing-component');
    expect(missingContract.status).toBe('missing-contract');
    expect(missingContract.component?.events).toEqual([]);
    expect(validateWorkflowComponentReference(definition, BUILT_IN_CONTRACTS, BUTTON_ID)).toEqual({
      valid: true
    });
    expect(validateWorkflowComponentReference(definition, BUILT_IN_CONTRACTS, UNKNOWN_ID)).toEqual({
      valid: false,
      reason: 'missing-contract'
    });
  });
});
