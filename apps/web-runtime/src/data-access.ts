import type { RuntimeDataAccess } from '@nova/runtime-core';
import { novaClient } from './runtime';

function stringParam(params: Record<string, unknown>, key: string): string {
  const value = params[key] ?? params[`${key}Id`];
  return typeof value === 'string' && value.length > 0 ? value : '';
}

export function createWebRuntimeDataAccess(appId: string): RuntimeDataAccess {
  const environment =
    new URLSearchParams(window.location.search).get('environment') ?? 'development';
  return {
    async query(params) {
      const model = stringParam(params, 'model');
      if (model === '') {
        throw new Error('Data query requires a model');
      }
      return novaClient.queryDataRecords(
        appId,
        model,
        {
          ...(params.filters === undefined ? {} : { filters: params.filters }),
          ...(params.sort === undefined ? {} : { sort: params.sort as never }),
          ...(params.page === undefined ? {} : { page: Number(params.page) }),
          ...(params.pageSize === undefined ? {} : { pageSize: Number(params.pageSize) }),
          ...(params.fields === undefined ? {} : { fields: params.fields as string[] }),
          ...(params.expand === undefined ? {} : { expand: params.expand as string[] })
        },
        environment
      );
    },
    async create(params) {
      const model = stringParam(params, 'model');
      if (model === '') {
        throw new Error('Data create requires a model');
      }
      return novaClient.createDataRecord(
        appId,
        model,
        (params.values ?? {}) as Record<string, unknown>,
        environment
      );
    },
    async update(params) {
      const model = stringParam(params, 'model');
      const recordId = stringParam(params, 'record');
      if (model === '' || recordId === '') {
        throw new Error('Data update requires a model and recordId');
      }
      return novaClient.updateDataRecord(
        appId,
        model,
        recordId,
        (params.values ?? {}) as Record<string, unknown>,
        environment
      );
    },
    async delete(params) {
      const model = stringParam(params, 'model');
      const recordId = stringParam(params, 'record');
      if (model === '' || recordId === '') {
        throw new Error('Data delete requires a model and recordId');
      }
      await novaClient.deleteDataRecord(appId, model, recordId, environment);
      return { id: recordId, deleted: true };
    }
  };
}
