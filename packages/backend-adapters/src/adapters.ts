export interface BackendHealth {
  status: 'healthy' | 'unhealthy';
  details?: Record<string, unknown> | undefined;
}

export interface DataStoreAdapter {
  readonly name: string;
  health(): Promise<BackendHealth>;
}

export interface AuthProviderAdapter {
  readonly name: string;
  verifyToken(token: string): Promise<{
    userId: string;
    organizationId: string;
    roles: string[];
  }>;
}

export interface StoragePutResult {
  key: string;
  checksum?: string | undefined;
}

export interface StorageAdapter {
  readonly name: string;
  put(key: string, data: Uint8Array, contentType: string): Promise<StoragePutResult>;
  get(key: string): Promise<Uint8Array | undefined>;
}

export interface BackendAdapterBundle {
  dataStore: DataStoreAdapter;
  auth: AuthProviderAdapter;
  storage: StorageAdapter;
}

export interface BackendAdapterFactory {
  readonly name: string;
  create(config: Record<string, unknown>): BackendAdapterBundle;
}
