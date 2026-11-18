export interface ComponentSummary {
  type: string;
  version: string;
  displayName: string;
  category: string;
}

export interface ComponentContract {
  type: string;
  version: string;
  displayName: string;
  category: string;
  propsSchema: Record<string, unknown>;
  defaults: Record<string, unknown>;
  events: Record<string, unknown>;
  slots: Record<string, unknown>;
  capabilities: string[];
  supportedTargets: string[];
  renderers: Record<string, string>;
  constraints: Record<string, unknown>;
  migrations: Array<{ fromVersion: string; toVersion: string }>;
}

export interface AppRecord {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  description?: string | undefined;
}

export interface AppVersionRecord {
  id: string;
  appId: string;
  versionNumber: number;
  schemaVersion: string;
  definition: unknown;
  checksum: string;
  createdByUserId: string;
  createdAt: string;
  parentVersionId?: string | undefined;
  changeSummary?: string | undefined;
  sourceProposalId?: string | undefined;
}

export interface ValidationReport {
  valid: boolean;
  issues: Array<{
    code: string;
    path: string;
    message: string;
    severity: 'error' | 'warning';
  }>;
}

export interface ProposalValidation extends ValidationReport {
  riskLevel: string;
  definition: unknown;
}

export interface ApplyResult {
  version: AppVersionRecord;
  validation: ValidationReport;
  riskLevel: string;
  definition: unknown;
}

export interface ReleaseRecord {
  id: string;
  appId: string;
  appVersionId: string;
  environment: string;
  releaseNumber: number;
  status: string;
  publishedByUserId: string;
  createdAt: string;
}

export interface RuntimeBinding {
  source: string;
  path: string;
  transform?: string | undefined;
  kind?: 'model' | 'state' | 'prop' | 'collection' | undefined;
  collection?: string | undefined;
}

export interface RuntimeEventBinding {
  action: string;
  params?: Record<string, unknown> | undefined;
}

export interface RuntimeComponentNode {
  id: string;
  type: string;
  contractVersion: string;
  props: Record<string, unknown>;
  name?: string | undefined;
  bindings?: Record<string, RuntimeBinding> | undefined;
  events?: Record<string, RuntimeEventBinding> | undefined;
  children?: RuntimeComponentNode[] | undefined;
  slots?: Record<string, RuntimeComponentNode[]> | undefined;
  layout?: Record<string, unknown> | undefined;
  breakpointOverrides?: Record<string, Record<string, unknown>> | undefined;
  hidden?: boolean | undefined;
  targetOverrides?: Record<string, Record<string, unknown>> | undefined;
}

export interface RuntimePayload {
  schemaVersion: string;
  name: string;
  targets: string[];
  theme: Record<string, unknown>;
  runtimeAccess?: { publicAccess?: boolean } | undefined;
  pages: Array<{
    id: string;
    name: string;
    route: string;
    rootNodeId: string;
    settings?: Record<string, unknown> | undefined;
  }>;
  components: RuntimeComponentNode[];
}

export interface ChangeProposal {
  baseVersionId: string;
  summary: string;
  rationale?: string | undefined;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'DESTRUCTIVE';
  operations: unknown[];
}

export interface CreateAppInput {
  orgId: string;
  name: string;
  description?: string | undefined;
  definition: unknown;
}

export interface CreateVersionInput {
  definition: unknown;
  parentVersionId?: string | undefined;
  changeSummary?: string | undefined;
}

export interface ValidateProposalInput {
  baseVersionId: string;
  proposal: unknown;
}

export interface ApplyProposalInput extends ValidateProposalInput {
  approved?: boolean | undefined;
}

export interface PublishInput {
  versionId?: string | undefined;
  environment?: string | undefined;
}

export interface GenerateAiProposalInput {
  instruction: string;
  pageName?: string | undefined;
  selectedNodeIds?: string[] | undefined;
}

export interface NovaClientOptions {
  baseUrl: string;
  headers?: Record<string, string> | undefined;
  fetch?: typeof fetch | undefined;
}

export class NovaClientError extends Error {
  readonly status: number;
  readonly body: unknown;
  readonly code?: string | undefined;
  readonly details?: unknown;

  constructor(status: number, body: unknown, code?: string, details?: unknown) {
    const serialized = body === undefined ? '' : JSON.stringify(body);
    super(
      `NOVA API request failed with status ${status}${serialized === '' ? '' : `: ${serialized}`}`
    );
    this.name = 'NovaClientError';
    this.status = status;
    this.body = body;
    if (code !== undefined) {
      this.code = code;
    }
    if (details !== undefined) {
      this.details = details;
    }
  }
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.replace(/\/+$/, '');
  return /\/api$/i.test(trimmed) ? trimmed.slice(0, -4) : trimmed;
}

export class NovaClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: typeof fetch;

  constructor(options: NovaClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.headers = options.headers ?? {};
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async validateDefinition(definition: unknown): Promise<ValidationReport> {
    return this.request<ValidationReport>('/v1/spec/validate', {
      method: 'POST',
      body: JSON.stringify({ definition })
    });
  }

  async listComponents(): Promise<ComponentSummary[]> {
    return this.request<ComponentSummary[]>('/v1/registry/components');
  }

  async listComponentContracts(): Promise<ComponentContract[]> {
    return this.request<ComponentContract[]>('/v1/registry/components/full');
  }

  async createApp(input: CreateAppInput): Promise<AppRecord> {
    return this.request<AppRecord>('/v1/apps', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }

  async getApp(appId: string): Promise<AppRecord> {
    return this.request<AppRecord>(`/v1/apps/${encodeURIComponent(appId)}`);
  }

  async listApps(orgId: string): Promise<AppRecord[]> {
    return this.request<AppRecord[]>(`/v1/apps?orgId=${encodeURIComponent(orgId)}`);
  }

  async createVersion(appId: string, input: CreateVersionInput): Promise<AppVersionRecord> {
    return this.request<AppVersionRecord>(`/v1/apps/${encodeURIComponent(appId)}/versions`, {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }

  async listVersions(appId: string): Promise<AppVersionRecord[]> {
    return this.request<AppVersionRecord[]>(`/v1/apps/${encodeURIComponent(appId)}/versions`);
  }

  async getVersion(versionId: string): Promise<AppVersionRecord> {
    return this.request<AppVersionRecord>(`/v1/versions/${encodeURIComponent(versionId)}`);
  }

  async validateProposal(input: ValidateProposalInput): Promise<ProposalValidation> {
    return this.request<ProposalValidation>('/v1/proposals/validate', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }

  async applyProposal(appId: string, input: ApplyProposalInput): Promise<ApplyResult> {
    return this.request<ApplyResult>(`/v1/apps/${encodeURIComponent(appId)}/proposals/apply`, {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }

  async publish(appId: string, input: PublishInput = {}): Promise<ReleaseRecord> {
    return this.request<ReleaseRecord>(`/v1/apps/${encodeURIComponent(appId)}/publish`, {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }

  async getRuntime(appSlug: string, environment?: string | undefined): Promise<RuntimePayload> {
    const query =
      environment === undefined ? '' : `?environment=${encodeURIComponent(environment)}`;
    return this.request<RuntimePayload>(
      `/runtime/v1/apps/${encodeURIComponent(appSlug)}/releases/current${query}`
    );
  }

  async getRuntimePreview(
    appSlug: string,
    versionId?: string | undefined
  ): Promise<RuntimePayload> {
    const query = versionId === undefined ? '' : `?versionId=${encodeURIComponent(versionId)}`;
    return this.request<RuntimePayload>(
      `/runtime/v1/preview/${encodeURIComponent(appSlug)}${query}`
    );
  }

  async getPublicRuntime(
    appSlug: string,
    environment?: string | undefined
  ): Promise<RuntimePayload> {
    const query =
      environment === undefined ? '' : `?environment=${encodeURIComponent(environment)}`;
    return this.request<RuntimePayload>(
      `/runtime/v1/public/${encodeURIComponent(appSlug)}${query}`
    );
  }

  async generateAiProposal(appId: string, input: GenerateAiProposalInput): Promise<ChangeProposal> {
    return this.request<ChangeProposal>(`/v1/apps/${encodeURIComponent(appId)}/ai/proposals`, {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}/api${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...this.headers,
        ...(init.headers ?? {})
      }
    });

    const raw = await response.text();
    if (!response.ok) {
      let body: unknown = raw;
      let code: string | undefined;
      let details: unknown;
      try {
        const parsed = JSON.parse(raw) as {
          error?: { code?: string; message?: string; details?: unknown } | undefined;
        };
        body = parsed;
        code = parsed.error?.code;
        details = parsed.error?.details;
      } catch {
        body = raw;
      }
      throw new NovaClientError(response.status, body, code, details);
    }

    return raw === '' ? (undefined as T) : (JSON.parse(raw) as T);
  }
}
