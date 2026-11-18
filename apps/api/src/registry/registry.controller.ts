import { Controller, Get } from '@nestjs/common';
import { builtInComponentRegistry } from '@nova/component-registry';
import type { ComponentContract, ComponentSummary } from '@nova/sdk';

@Controller('v1/registry')
export class RegistryController {
  @Get('components')
  list(): ComponentSummary[] {
    return builtInComponentRegistry.list().map((contract) => ({
      type: contract.type,
      version: contract.version,
      displayName: contract.displayName,
      category: contract.category
    }));
  }

  @Get('components/full')
  listFull(): ComponentContract[] {
    return builtInComponentRegistry.list().map((contract) => ({
      type: contract.type,
      version: contract.version,
      displayName: contract.displayName,
      category: contract.category,
      propsSchema: structuredClone(contract.propsSchema),
      defaults: structuredClone(contract.defaults),
      events: structuredClone(contract.events) as Record<string, unknown>,
      slots: structuredClone(contract.slots) as Record<string, unknown>,
      capabilities: [...contract.capabilities],
      supportedTargets: [...contract.supportedTargets],
      renderers: contract.renderers as Record<string, string>,
      constraints: structuredClone(contract.constraints) as Record<string, unknown>,
      migrations: contract.migrations.map((migration) => ({
        fromVersion: migration.fromVersion,
        toVersion: migration.toVersion
      }))
    }));
  }
}
