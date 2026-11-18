import { NovaError, NovaErrorCodes } from '@nova/errors';
import { appDefinitionSchema } from '../app-definition';
import { SPEC_VERSION } from '../version';

export interface SpecMigration {
  fromVersion: string;
  toVersion: string;
  upgrade(definition: Record<string, unknown>): Record<string, unknown>;
}

export const specMigrations: readonly SpecMigration[] = [];

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

export function migrateDefinition(input: unknown, targetVersion: string = SPEC_VERSION): unknown {
  let current = asRecord(input);

  if (current === undefined) {
    throw new NovaError(
      NovaErrorCodes.VALIDATION_FAILED,
      'Application definition must be an object'
    );
  }

  while (current['schemaVersion'] !== targetVersion) {
    const fromVersion = current['schemaVersion'];

    if (typeof fromVersion !== 'string') {
      throw new NovaError(
        NovaErrorCodes.VALIDATION_FAILED,
        'Application definition is missing schemaVersion'
      );
    }

    const migration = specMigrations.find(
      (candidate) => candidate.fromVersion === fromVersion && candidate.toVersion === targetVersion
    );

    if (migration === undefined) {
      throw new NovaError(
        NovaErrorCodes.VALIDATION_FAILED,
        'No compatible specification migration found',
        {
          details: { fromVersion, targetVersion }
        }
      );
    }

    const migrated = asRecord(migration.upgrade(current));

    if (migrated === undefined) {
      throw new NovaError(
        NovaErrorCodes.VALIDATION_FAILED,
        'Specification migration returned an invalid value',
        {
          details: { fromVersion, targetVersion }
        }
      );
    }

    current = migrated;
  }

  const result = appDefinitionSchema.safeParse(current);

  if (!result.success) {
    throw new NovaError(
      NovaErrorCodes.VALIDATION_FAILED,
      'Migrated application definition is invalid',
      {
        details: {
          issues: result.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message
          }))
        }
      }
    );
  }

  return result.data;
}
