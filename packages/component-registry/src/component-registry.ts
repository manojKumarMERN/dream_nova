import { NovaError, NovaErrorCodes } from '@nova/errors';
import type { ComponentContract } from '@nova/contracts';

export interface ComponentRegistryListOptions {
  type?: string;
}

export interface ComponentRegistry {
  get(type: string, version?: string): ComponentContract | undefined;
  list(options?: ComponentRegistryListOptions): readonly ComponentContract[];
  has(type: string, version?: string): boolean;
}

function contractKey(type: string, version: string): string {
  return `${type}@${version}`;
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split('.').map((part) => Number(part));
  const rightParts = right.split('.').map((part) => Number(part));
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

export function createComponentRegistry(
  contracts: readonly ComponentContract[]
): ComponentRegistry {
  const seen = new Set<string>();

  for (const contract of contracts) {
    const key = contractKey(contract.type, contract.version);
    if (seen.has(key)) {
      throw new NovaError(NovaErrorCodes.CONFLICT, 'Duplicate component contract version', {
        details: { type: contract.type, version: contract.version }
      });
    }
    seen.add(key);
  }

  const entries = [...contracts];

  return {
    get(type, version) {
      const matching = entries.filter((contract) => contract.type === type);
      if (matching.length === 0) {
        return undefined;
      }

      if (version !== undefined) {
        return matching.find((contract) => contract.version === version);
      }

      return matching.reduce((latest, contract) =>
        compareVersions(contract.version, latest.version) > 0 ? contract : latest
      );
    },
    list(options = {}) {
      if (options.type === undefined) {
        return entries;
      }

      return entries.filter((contract) => contract.type === options.type);
    },
    has(type, version) {
      return this.get(type, version) !== undefined;
    }
  };
}
