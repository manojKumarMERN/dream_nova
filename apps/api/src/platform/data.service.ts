import { Inject, Injectable } from '@nestjs/common';
import type { Actor } from '@nova/auth';
import type { DataStore, DataEnvironment, DataQueryRequest } from '@nova/data-engine';
import { createDataEngine } from '@nova/data-engine';
import type { PlatformRepository } from '@nova/backend-adapters';
import { NovaError, NovaErrorCodes } from '@nova/errors';
import { appDefinitionSchema } from '@nova/spec';
import type { DataQueryRequestDto } from './dto';
import { assertPlatformPermission } from './permissions';
import { DATA_STORE, PLATFORM_REPOSITORY } from './platform.tokens';

function toDataEnvironment(value: string | undefined): DataEnvironment {
  switch ((value ?? 'production').toLowerCase()) {
    case 'production':
      return 'production';
    case 'preview':
      return 'preview';
    case 'development':
    case 'dev':
      return 'development';
    default:
      throw new NovaError(NovaErrorCodes.INVALID_CONFIGURATION, 'Unknown data environment');
  }
}

@Injectable()
export class DataService {
  constructor(
    @Inject(PLATFORM_REPOSITORY) private readonly repository: PlatformRepository,
    @Inject(DATA_STORE) private readonly store: DataStore
  ) {}

  private async engine(actor: Actor, appId: string, environment: string | undefined) {
    assertPlatformPermission(actor, 'app:read');
    const app = await this.repository.getApp(actor.organizationId, appId);
    if (app === undefined) {
      throw new NovaError(NovaErrorCodes.NOT_FOUND, 'Application not found');
    }
    assertPlatformPermission(actor, 'app:read', app.organizationId);

    const versions = await this.repository.listVersions(actor.organizationId, app.id);
    const latest = [...versions].sort((left, right) => right.versionNumber - left.versionNumber)[0];
    if (latest === undefined) {
      throw new NovaError(NovaErrorCodes.NOT_FOUND, 'Application version not found');
    }

    const definition = appDefinitionSchema.parse(latest.definition);

    return {
      app,
      engine: createDataEngine({
        appId: app.id,
        definitionOrganizationId: app.organizationId,
        definition: {
          dataModels: definition.dataModels,
          ...(definition.dataPermissions === undefined
            ? {}
            : { dataPermissions: definition.dataPermissions })
        },
        store: this.store,
        environment: toDataEnvironment(environment)
      })
    };
  }

  async migrationStatus(actor: Actor, appId: string, environment: string | undefined) {
    const { engine } = await this.engine(actor, appId, environment);
    return engine.migrationStatus(actorData(actor));
  }

  async planMigration(actor: Actor, appId: string, environment: string | undefined) {
    const { engine } = await this.engine(actor, appId, environment);
    return engine.planMigration(actorData(actor));
  }

  async applyMigration(
    actor: Actor,
    appId: string,
    environment: string | undefined,
    confirmed: boolean | undefined
  ) {
    const { engine } = await this.engine(actor, appId, environment);
    return engine.applyMigration(actorData(actor), confirmed);
  }

  async createRecord(
    actor: Actor,
    appId: string,
    model: string,
    environment: string | undefined,
    values: Record<string, unknown>
  ) {
    const { engine } = await this.engine(actor, appId, environment);
    return engine.create(actorData(actor), model, values);
  }

  async getRecord(
    actor: Actor,
    appId: string,
    model: string,
    recordId: string,
    environment: string | undefined
  ) {
    const { engine } = await this.engine(actor, appId, environment);
    return engine.get(actorData(actor), model, recordId);
  }

  async query(
    actor: Actor,
    appId: string,
    model: string,
    environment: string | undefined,
    request: DataQueryRequestDto
  ) {
    const { engine } = await this.engine(actor, appId, environment);
    return engine.list(actorData(actor), { ...request, modelId: model } as DataQueryRequest);
  }

  async updateRecord(
    actor: Actor,
    appId: string,
    model: string,
    recordId: string,
    environment: string | undefined,
    values: Record<string, unknown>
  ) {
    const { engine } = await this.engine(actor, appId, environment);
    return engine.update(actorData(actor), model, recordId, values);
  }

  async deleteRecord(
    actor: Actor,
    appId: string,
    model: string,
    recordId: string,
    environment: string | undefined
  ): Promise<void> {
    const { engine } = await this.engine(actor, appId, environment);
    await engine.delete(actorData(actor), model, recordId);
  }
}

function actorData(actor: Actor) {
  return {
    userId: actor.userId,
    organizationId: actor.organizationId,
    roles: [actor.role]
  };
}
