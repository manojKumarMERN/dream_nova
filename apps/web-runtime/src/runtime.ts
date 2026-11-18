import { BUILT_IN_COMPONENT_CONTRACTS } from '@nova/component-registry';
import type { ComponentContract } from '@nova/contracts';
import { NovaClient } from '@nova/sdk';
import { runtimePayloadToDefinition } from '@nova/spec';
import type { AppDefinition, RuntimePayloadLike } from '@nova/spec';

export const API_BASE_URL = import.meta.env.VITE_NOVA_API_URL ?? 'http://localhost:3000';

export const novaClient = new NovaClient({ baseUrl: API_BASE_URL });

function asDefinition(value: unknown): AppDefinition | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  if ('definition' in value) {
    return asDefinition((value as { definition: unknown }).definition);
  }
  const candidate = value as Partial<AppDefinition>;
  if (Array.isArray(candidate.components) && typeof candidate.appId === 'string') {
    return candidate as AppDefinition;
  }
  return undefined;
}

function asRuntimePayload(value: unknown): RuntimePayloadLike | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const candidate = value as { components?: unknown; pages?: unknown; targets?: unknown };
  if (
    Array.isArray(candidate.components) &&
    Array.isArray(candidate.pages) &&
    Array.isArray(candidate.targets)
  ) {
    return value as RuntimePayloadLike;
  }
  return undefined;
}

export async function loadRuntimeContracts(): Promise<readonly ComponentContract[]> {
  try {
    if (typeof novaClient.listComponentContracts === 'function') {
      const remote = await novaClient.listComponentContracts();
      if (Array.isArray(remote) && remote.length > 0) {
        const merged = new Map(
          [...BUILT_IN_COMPONENT_CONTRACTS, ...(remote as unknown as ComponentContract[])].map(
            (contract) => [`${contract.type}@${contract.version}`, contract]
          )
        );
        return [...merged.values()];
      }
    }
  } catch {
    return BUILT_IN_COMPONENT_CONTRACTS;
  }
  return BUILT_IN_COMPONENT_CONTRACTS;
}

export async function loadRuntimeDefinition(slug: string): Promise<AppDefinition> {
  try {
    if (typeof novaClient.getPublicRuntime === 'function') {
      const result = await novaClient.getPublicRuntime(slug);
      const definition = asDefinition(result) ?? runtimePayloadFrom(result);
      if (definition) {
        return definition;
      }
    }
  } catch {
    throw new Error('Public runtime is not available');
  }
  try {
    const response = await fetch(`/api/runtime/v1/public/${encodeURIComponent(slug)}`);
    if (response.ok) {
      const result: unknown = await response.json();
      const definition = asDefinition(result) ?? runtimePayloadFrom(result);
      if (definition) {
        return definition;
      }
    }
  } catch {
    throw new Error('Public runtime is not available');
  }
  throw new Error('Public runtime is not available');
}

function runtimePayloadFrom(value: unknown): AppDefinition | undefined {
  const payload = asRuntimePayload(value);
  return payload === undefined ? undefined : runtimePayloadToDefinition(payload);
}
