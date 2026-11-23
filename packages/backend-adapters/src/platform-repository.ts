import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@nova/db';
import type {
  ActorType,
  ArtifactStatus,
  ArtifactType,
  EnvironmentName,
  PlatformTarget,
  PrismaClient,
  ProposalStatus,
  ReleaseStatus,
  RiskLevel
} from '@nova/db';
import { NovaError, NovaErrorCodes } from '@nova/errors';

export type PlatformActorType = ActorType;
export type PlatformEnvironment = EnvironmentName;
export type PlatformProposalStatus = ProposalStatus;
export type PlatformRiskLevel = RiskLevel;
export type PlatformReleaseStatus = ReleaseStatus;

export interface AppRecord {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  status: string;
  createdByUserId: string;
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
  createdByActorType?: PlatformActorType | undefined;
}

export interface ProposalRecord {
  id: string;
  organizationId: string;
  appId: string;
  baseVersionId: string;
  status: PlatformProposalStatus;
  riskLevel: PlatformRiskLevel;
  rationale?: string | undefined;
  operations: unknown;
  validationResult?: unknown;
  createdByUserId: string;
  createdByActorType?: PlatformActorType | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface ReleaseRecord {
  id: string;
  appId: string;
  appVersionId: string;
  environment: PlatformEnvironment;
  releaseNumber: number;
  status: PlatformReleaseStatus;
  publishedByUserId: string;
  checksum?: string | undefined;
  createdAt: string;
}

export interface BuildArtifactRecord {
  id: string;
  appVersionId: string;
  target: PlatformTarget;
  artifactType: ArtifactType;
  storageKey: string;
  checksum: string;
  status: ArtifactStatus;
  createdAt: string;
}

export interface AuditLogRecord {
  id: string;
  organizationId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata: Record<string, unknown>;
  appId?: string | undefined;
  proposalId?: string | undefined;
  actorUserId?: string | undefined;
  actorType?: PlatformActorType | undefined;
  requestId?: string | undefined;
  createdAt: string;
}

export interface DataRecord {
  organizationId: string;
  appId: string;
  key: string;
  value: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAppInput {
  orgId: string;
  name: string;
  slug: string;
  description?: string | undefined;
  createdByUserId: string;
}

export interface CreateVersionInput {
  orgId: string;
  appId: string;
  versionNumber: number;
  schemaVersion: string;
  definition: unknown;
  checksum: string;
  createdByUserId: string;
  createdByActorType?: PlatformActorType | undefined;
  parentVersionId?: string | undefined;
  sourceProposalId?: string | undefined;
  changeSummary?: string | undefined;
}

export interface SaveProposalInput {
  orgId: string;
  appId: string;
  baseVersionId: string;
  operations: unknown;
  status: PlatformProposalStatus;
  riskLevel: PlatformRiskLevel;
  createdByUserId: string;
  createdByActorType?: PlatformActorType | undefined;
  rationale?: string | undefined;
  validationResult?: unknown;
}

export interface CreateReleaseInput {
  orgId: string;
  appId: string;
  appVersionId: string;
  environment: PlatformEnvironment;
  releaseNumber: number;
  status: PlatformReleaseStatus;
  publishedByUserId: string;
  checksum?: string | undefined;
}

export interface CreateBuildArtifactInput {
  appVersionId: string;
  target: PlatformTarget;
  artifactType: ArtifactType;
  storageKey: string;
  checksum: string;
  status: ArtifactStatus;
}

export interface CreateAuditLogInput {
  orgId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata: Record<string, unknown>;
  appId?: string | undefined;
  proposalId?: string | undefined;
  actorUserId?: string | undefined;
  actorType?: PlatformActorType | undefined;
  requestId?: string | undefined;
}

export interface CreateDataRecordInput {
  orgId: string;
  appId: string;
  key: string;
  value: unknown;
}

export interface UpdateDataRecordInput {
  value: unknown;
}

export interface PlatformRepository {
  createApp(input: CreateAppInput): Promise<AppRecord>;
  listApps(orgId: string): Promise<AppRecord[]>;
  getApp(orgId: string, appId: string): Promise<AppRecord | undefined>;
  getAppBySlug(orgId: string, slug: string): Promise<AppRecord | undefined>;
  getAppBySlugAnyOrg(slug: string): Promise<AppRecord | undefined>;
  createVersion(input: CreateVersionInput): Promise<AppVersionRecord>;
  listVersions(orgId: string, appId: string): Promise<AppVersionRecord[]>;
  getVersion(orgId: string, versionId: string): Promise<AppVersionRecord | undefined>;
  saveProposal(input: SaveProposalInput): Promise<ProposalRecord>;
  getProposal(orgId: string, proposalId: string): Promise<ProposalRecord | undefined>;
  createRelease(input: CreateReleaseInput): Promise<ReleaseRecord>;
  getCurrentRelease(
    orgId: string,
    appId: string,
    environment: PlatformEnvironment
  ): Promise<ReleaseRecord | undefined>;
  listReleases(orgId: string, appId: string): Promise<ReleaseRecord[]>;
  createBuildArtifact(input: CreateBuildArtifactInput): Promise<BuildArtifactRecord>;
  createAuditLog(input: CreateAuditLogInput): Promise<AuditLogRecord>;
  getData(orgId: string, appId: string, key: string): Promise<DataRecord | undefined>;
  createDataRecord(input: CreateDataRecordInput): Promise<DataRecord>;
  updateDataRecord(
    orgId: string,
    appId: string,
    key: string,
    input: UpdateDataRecordInput
  ): Promise<DataRecord | undefined>;
  deleteDataRecord(orgId: string, appId: string, key: string): Promise<boolean>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function now(): string {
  return new Date().toISOString();
}

function requireAppOwned(apps: Map<string, AppRecord>, orgId: string, appId: string): AppRecord {
  const app = apps.get(appId);
  if (app === undefined || app.organizationId !== orgId) {
    throw new NovaError(NovaErrorCodes.NOT_FOUND, 'Application not found', {
      details: { appId }
    });
  }
  return app;
}

export class InMemoryPlatformRepository implements PlatformRepository {
  private readonly apps = new Map<string, AppRecord>();
  private readonly versions = new Map<string, AppVersionRecord>();
  private readonly proposals = new Map<string, ProposalRecord>();
  private readonly releases = new Map<string, ReleaseRecord>();
  private readonly artifacts = new Map<string, BuildArtifactRecord>();
  private readonly auditLogs = new Map<string, AuditLogRecord>();
  private readonly data = new Map<string, DataRecord>();

  async createApp(input: CreateAppInput): Promise<AppRecord> {
    const timestamp = now();
    const record: AppRecord = {
      id: randomUUID(),
      organizationId: input.orgId,
      name: input.name,
      slug: input.slug,
      status: 'DRAFT',
      createdByUserId: input.createdByUserId,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(input.description === undefined ? {} : { description: input.description })
    };
    this.apps.set(record.id, clone(record));
    return clone(record);
  }

  async listApps(orgId: string): Promise<AppRecord[]> {
    return clone([...this.apps.values()].filter((app) => app.organizationId === orgId));
  }

  async getApp(orgId: string, appId: string): Promise<AppRecord | undefined> {
    const app = this.apps.get(appId);
    return app === undefined || app.organizationId !== orgId ? undefined : clone(app);
  }

  async getAppBySlug(orgId: string, slug: string): Promise<AppRecord | undefined> {
    const app = [...this.apps.values()].find(
      (candidate) => candidate.organizationId === orgId && candidate.slug === slug
    );
    return app === undefined ? undefined : clone(app);
  }

  async getAppBySlugAnyOrg(slug: string): Promise<AppRecord | undefined> {
    const app = [...this.apps.values()].find((candidate) => candidate.slug === slug);
    return app === undefined ? undefined : clone(app);
  }

  async createVersion(input: CreateVersionInput): Promise<AppVersionRecord> {
    requireAppOwned(this.apps, input.orgId, input.appId);
    const record: AppVersionRecord = {
      id: randomUUID(),
      appId: input.appId,
      versionNumber: input.versionNumber,
      schemaVersion: input.schemaVersion,
      definition: Object.freeze(clone(input.definition)),
      checksum: input.checksum,
      createdByUserId: input.createdByUserId,
      createdAt: now(),
      ...(input.createdByActorType === undefined
        ? {}
        : { createdByActorType: input.createdByActorType }),
      ...(input.parentVersionId === undefined ? {} : { parentVersionId: input.parentVersionId }),
      ...(input.sourceProposalId === undefined ? {} : { sourceProposalId: input.sourceProposalId }),
      ...(input.changeSummary === undefined ? {} : { changeSummary: input.changeSummary })
    };
    this.versions.set(record.id, record);
    return clone(record);
  }

  async listVersions(orgId: string, appId: string): Promise<AppVersionRecord[]> {
    requireAppOwned(this.apps, orgId, appId);
    return clone(
      [...this.versions.values()]
        .filter((version) => version.appId === appId)
        .sort((left, right) => left.versionNumber - right.versionNumber)
    );
  }

  async getVersion(orgId: string, versionId: string): Promise<AppVersionRecord | undefined> {
    const version = this.versions.get(versionId);
    if (version === undefined) {
      return undefined;
    }
    const app = this.apps.get(version.appId);
    return app === undefined || app.organizationId !== orgId ? undefined : clone(version);
  }

  async saveProposal(input: SaveProposalInput): Promise<ProposalRecord> {
    const baseVersion = this.versions.get(input.baseVersionId);
    if (baseVersion === undefined) {
      throw new NovaError(NovaErrorCodes.NOT_FOUND, 'Base version not found', {
        details: { baseVersionId: input.baseVersionId }
      });
    }
    requireAppOwned(this.apps, input.orgId, input.appId);
    const timestamp = now();
    const record: ProposalRecord = {
      id: randomUUID(),
      organizationId: input.orgId,
      appId: input.appId,
      baseVersionId: input.baseVersionId,
      status: input.status,
      riskLevel: input.riskLevel,
      operations: clone(input.operations),
      createdByUserId: input.createdByUserId,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(input.createdByActorType === undefined
        ? {}
        : { createdByActorType: input.createdByActorType }),
      ...(input.rationale === undefined ? {} : { rationale: input.rationale }),
      ...(input.validationResult === undefined
        ? {}
        : { validationResult: clone(input.validationResult) })
    };
    this.proposals.set(record.id, record);
    return clone(record);
  }

  async getProposal(orgId: string, proposalId: string): Promise<ProposalRecord | undefined> {
    const proposal = this.proposals.get(proposalId);
    return proposal === undefined || proposal.organizationId !== orgId
      ? undefined
      : clone(proposal);
  }

  async createRelease(input: CreateReleaseInput): Promise<ReleaseRecord> {
    requireAppOwned(this.apps, input.orgId, input.appId);
    const record: ReleaseRecord = {
      id: randomUUID(),
      appId: input.appId,
      appVersionId: input.appVersionId,
      environment: input.environment,
      releaseNumber: input.releaseNumber,
      status: input.status,
      publishedByUserId: input.publishedByUserId,
      createdAt: now(),
      ...(input.checksum === undefined ? {} : { checksum: input.checksum })
    };
    this.releases.set(record.id, record);
    return clone(record);
  }

  async getCurrentRelease(
    orgId: string,
    appId: string,
    environment: PlatformEnvironment
  ): Promise<ReleaseRecord | undefined> {
    requireAppOwned(this.apps, orgId, appId);
    const release = [...this.releases.values()]
      .filter(
        (candidate) =>
          candidate.appId === appId &&
          candidate.environment === environment &&
          candidate.status === 'PUBLISHED'
      )
      .sort((left, right) => right.releaseNumber - left.releaseNumber)[0];
    return release === undefined ? undefined : clone(release);
  }

  async listReleases(orgId: string, appId: string): Promise<ReleaseRecord[]> {
    requireAppOwned(this.apps, orgId, appId);
    return clone(
      [...this.releases.values()]
        .filter((release) => release.appId === appId)
        .sort((left, right) => left.releaseNumber - right.releaseNumber)
    );
  }

  async createBuildArtifact(input: CreateBuildArtifactInput): Promise<BuildArtifactRecord> {
    const record: BuildArtifactRecord = {
      id: randomUUID(),
      appVersionId: input.appVersionId,
      target: input.target,
      artifactType: input.artifactType,
      storageKey: input.storageKey,
      checksum: input.checksum,
      status: input.status,
      createdAt: now()
    };
    this.artifacts.set(record.id, record);
    return clone(record);
  }

  async createAuditLog(input: CreateAuditLogInput): Promise<AuditLogRecord> {
    const record: AuditLogRecord = {
      id: randomUUID(),
      organizationId: input.orgId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadata: clone(input.metadata),
      createdAt: now(),
      ...(input.appId === undefined ? {} : { appId: input.appId }),
      ...(input.proposalId === undefined ? {} : { proposalId: input.proposalId }),
      ...(input.actorUserId === undefined ? {} : { actorUserId: input.actorUserId }),
      ...(input.actorType === undefined ? {} : { actorType: input.actorType }),
      ...(input.requestId === undefined ? {} : { requestId: input.requestId })
    };
    this.auditLogs.set(record.id, record);
    return clone(record);
  }

  async getData(orgId: string, appId: string, key: string): Promise<DataRecord | undefined> {
    const record = this.data.get(dataKey(orgId, appId, key));
    if (
      record === undefined ||
      record.organizationId !== orgId ||
      record.appId !== appId ||
      record.key !== key
    ) {
      return undefined;
    }
    return clone(record);
  }

  async createDataRecord(input: CreateDataRecordInput): Promise<DataRecord> {
    requireAppOwned(this.apps, input.orgId, input.appId);
    const key = dataKey(input.orgId, input.appId, input.key);
    if (this.data.has(key)) {
      throw new NovaError(NovaErrorCodes.CONFLICT, 'Data record already exists');
    }
    const timestamp = now();
    const record: DataRecord = {
      organizationId: input.orgId,
      appId: input.appId,
      key: input.key,
      value: clone(input.value),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.data.set(key, record);
    return clone(record);
  }

  async updateDataRecord(
    orgId: string,
    appId: string,
    key: string,
    input: UpdateDataRecordInput
  ): Promise<DataRecord | undefined> {
    const existing = await this.getData(orgId, appId, key);
    if (existing === undefined) {
      return undefined;
    }
    const updated: DataRecord = {
      ...existing,
      value: clone(input.value),
      updatedAt: now()
    };
    this.data.set(dataKey(orgId, appId, key), updated);
    return clone(updated);
  }

  async deleteDataRecord(orgId: string, appId: string, key: string): Promise<boolean> {
    const existing = await this.getData(orgId, appId, key);
    if (existing === undefined) {
      return false;
    }
    return this.data.delete(dataKey(orgId, appId, key));
  }
}

function dataKey(orgId: string, appId: string, key: string): string {
  return `${orgId} ${appId} ${key}`;
}

interface PrismaAppRecord {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  status: string;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

function mapApp(record: PrismaAppRecord, description?: string | undefined): AppRecord {
  return {
    id: record.id,
    organizationId: record.organizationId,
    name: record.name,
    slug: record.slug,
    status: record.status,
    createdByUserId: record.createdByUserId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    ...(description === undefined ? {} : { description })
  };
}

interface PrismaVersionRecord {
  id: string;
  appId: string;
  versionNumber: number;
  schemaVersion: string;
  definition: Prisma.JsonValue;
  checksum: string;
  createdByUserId: string;
  createdByActorType: PlatformActorType;
  parentVersionId: string | null;
  sourceProposalId: string | null;
  changeSummary: string | null;
  createdAt: Date;
}

function mapVersion(record: PrismaVersionRecord): AppVersionRecord {
  return {
    id: record.id,
    appId: record.appId,
    versionNumber: record.versionNumber,
    schemaVersion: record.schemaVersion,
    definition: clone(record.definition),
    checksum: record.checksum,
    createdByUserId: record.createdByUserId,
    createdByActorType: record.createdByActorType,
    createdAt: record.createdAt.toISOString(),
    ...(record.parentVersionId === null ? {} : { parentVersionId: record.parentVersionId }),
    ...(record.sourceProposalId === null ? {} : { sourceProposalId: record.sourceProposalId }),
    ...(record.changeSummary === null ? {} : { changeSummary: record.changeSummary })
  };
}

interface PrismaProposalRecord {
  id: string;
  organizationId: string;
  appId: string;
  baseVersionId: string;
  status: PlatformProposalStatus;
  riskLevel: PlatformRiskLevel;
  rationale: string | null;
  operations: Prisma.JsonValue;
  validationResult: Prisma.JsonValue;
  createdByUserId: string;
  createdByActorType: PlatformActorType;
  createdAt: Date;
  updatedAt: Date;
}

function mapProposal(record: PrismaProposalRecord): ProposalRecord {
  return {
    id: record.id,
    organizationId: record.organizationId,
    appId: record.appId,
    baseVersionId: record.baseVersionId,
    status: record.status,
    riskLevel: record.riskLevel,
    operations: clone(record.operations),
    createdByUserId: record.createdByUserId,
    createdByActorType: record.createdByActorType,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    ...(record.rationale === null ? {} : { rationale: record.rationale }),
    ...(record.validationResult === null
      ? {}
      : { validationResult: clone(record.validationResult) })
  };
}

interface PrismaReleaseRecord {
  id: string;
  appId: string;
  appVersionId: string;
  environment: PlatformEnvironment;
  releaseNumber: number;
  status: PlatformReleaseStatus;
  publishedByUserId: string;
  createdAt: Date;
}

function mapRelease(record: PrismaReleaseRecord): ReleaseRecord {
  return {
    id: record.id,
    appId: record.appId,
    appVersionId: record.appVersionId,
    environment: record.environment,
    releaseNumber: record.releaseNumber,
    status: record.status,
    publishedByUserId: record.publishedByUserId,
    createdAt: record.createdAt.toISOString()
  };
}

interface PrismaArtifactRecord {
  id: string;
  appVersionId: string;
  target: PlatformTarget;
  artifactType: ArtifactType;
  storageKey: string;
  checksum: string;
  status: ArtifactStatus;
  createdAt: Date;
}

function mapArtifact(record: PrismaArtifactRecord): BuildArtifactRecord {
  return {
    id: record.id,
    appVersionId: record.appVersionId,
    target: record.target,
    artifactType: record.artifactType,
    storageKey: record.storageKey,
    checksum: record.checksum,
    status: record.status,
    createdAt: record.createdAt.toISOString()
  };
}

interface PrismaAuditRecord {
  id: string;
  organizationId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata: Prisma.JsonValue;
  appId: string | null;
  proposalId: string | null;
  actorUserId: string | null;
  actorType: PlatformActorType;
  requestId: string | null;
  createdAt: Date;
}

function mapAudit(record: PrismaAuditRecord): AuditLogRecord {
  return {
    id: record.id,
    organizationId: record.organizationId,
    action: record.action,
    resourceType: record.resourceType,
    resourceId: record.resourceId,
    metadata: clone(record.metadata) as Record<string, unknown>,
    createdAt: record.createdAt.toISOString(),
    ...(record.appId === null ? {} : { appId: record.appId }),
    ...(record.proposalId === null ? {} : { proposalId: record.proposalId }),
    ...(record.actorUserId === null ? {} : { actorUserId: record.actorUserId }),
    ...(record.requestId === null ? {} : { requestId: record.requestId }),
    actorType: record.actorType
  };
}

const DATA_PROVIDER_KEY = 'nova-data-record';

function dataId(orgId: string, appId: string, key: string): string {
  const hashed = createHash('sha256').update(`${orgId} ${appId} ${key}`).digest('hex');
  return `${hashed.slice(0, 8)}-${hashed.slice(8, 12)}-4${hashed.slice(13, 16)}-8${hashed.slice(17, 20)}-${hashed.slice(20, 32)}`;
}

function descriptionFromDefinition(definition: Prisma.JsonValue | undefined): string | undefined {
  if (
    definition === null ||
    definition === undefined ||
    typeof definition !== 'object' ||
    Array.isArray(definition)
  ) {
    return undefined;
  }
  const value = (definition as Record<string, unknown>)['description'];
  return typeof value === 'string' ? value : undefined;
}

async function requirePrismaAppOwned(
  client: PrismaClient,
  orgId: string,
  appId: string
): Promise<void> {
  const app = await client.app.findFirst({
    where: { id: appId, organizationId: orgId },
    select: { id: true }
  });
  if (app === null) {
    throw new NovaError(NovaErrorCodes.NOT_FOUND, 'Application not found', {
      details: { appId }
    });
  }
}

async function requirePrismaVersionOwned(
  client: PrismaClient,
  orgId: string,
  versionId: string,
  appId: string,
  message = 'Version not found'
): Promise<void> {
  const version = await client.appVersion.findFirst({
    where: { id: versionId, appId, app: { organizationId: orgId } },
    select: { id: true }
  });
  if (version === null) {
    throw new NovaError(NovaErrorCodes.NOT_FOUND, message, {
      details: { versionId }
    });
  }
}

export class PrismaPlatformRepository implements PlatformRepository {
  constructor(private readonly client: PrismaClient) {}

  async createApp(input: CreateAppInput): Promise<AppRecord> {
    const created = await this.client.app.create({
      data: {
        organizationId: input.orgId,
        slug: input.slug,
        name: input.name,
        status: 'DRAFT',
        createdByUserId: input.createdByUserId
      }
    });
    return mapApp(created, input.description);
  }

  async listApps(orgId: string): Promise<AppRecord[]> {
    const apps = await this.client.app.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'asc' }
    });
    return apps.map((app) => mapApp(app));
  }

  async getApp(orgId: string, appId: string): Promise<AppRecord | undefined> {
    const app = await this.client.app.findFirst({
      where: { id: appId, organizationId: orgId },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } }
    });
    if (app === null) {
      return undefined;
    }
    return mapApp(app, descriptionFromDefinition(app.versions[0]?.definition));
  }

  async getAppBySlug(orgId: string, slug: string): Promise<AppRecord | undefined> {
    const app = await this.client.app.findFirst({
      where: { organizationId: orgId, slug },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } }
    });
    if (app === null) {
      return undefined;
    }
    return mapApp(app, descriptionFromDefinition(app.versions[0]?.definition));
  }

  async getAppBySlugAnyOrg(slug: string): Promise<AppRecord | undefined> {
    const app = await this.client.app.findFirst({
      where: { slug },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } }
    });
    if (app === null) {
      return undefined;
    }
    return mapApp(app, descriptionFromDefinition(app.versions[0]?.definition));
  }

  async createVersion(input: CreateVersionInput): Promise<AppVersionRecord> {
    await requirePrismaAppOwned(this.client, input.orgId, input.appId);
    const created = await this.client.appVersion.create({
      data: {
        appId: input.appId,
        versionNumber: input.versionNumber,
        schemaVersion: input.schemaVersion,
        definition: input.definition as Prisma.InputJsonValue,
        checksum: input.checksum,
        createdByUserId: input.createdByUserId,
        createdByActorType: input.createdByActorType ?? 'USER',
        parentVersionId: input.parentVersionId ?? null,
        sourceProposalId: input.sourceProposalId ?? null,
        changeSummary: input.changeSummary ?? null
      }
    });
    return mapVersion(created);
  }

  async listVersions(orgId: string, appId: string): Promise<AppVersionRecord[]> {
    const versions = await this.client.appVersion.findMany({
      where: { appId, app: { organizationId: orgId } },
      orderBy: { versionNumber: 'asc' }
    });
    return versions.map(mapVersion);
  }

  async getVersion(orgId: string, versionId: string): Promise<AppVersionRecord | undefined> {
    const version = await this.client.appVersion.findFirst({
      where: { id: versionId, app: { organizationId: orgId } }
    });
    return version === null ? undefined : mapVersion(version);
  }

  async saveProposal(input: SaveProposalInput): Promise<ProposalRecord> {
    await requirePrismaAppOwned(this.client, input.orgId, input.appId);
    await requirePrismaVersionOwned(
      this.client,
      input.orgId,
      input.baseVersionId,
      input.appId,
      'Base version not found'
    );
    const created = await this.client.aiProposal.create({
      data: {
        organizationId: input.orgId,
        appId: input.appId,
        baseVersionId: input.baseVersionId,
        status: input.status,
        riskLevel: input.riskLevel,
        rationale: input.rationale ?? null,
        operations: input.operations as Prisma.InputJsonValue,
        validationResult:
          input.validationResult === undefined
            ? Prisma.JsonNull
            : (input.validationResult as Prisma.InputJsonValue),
        createdByUserId: input.createdByUserId,
        createdByActorType: input.createdByActorType ?? 'USER'
      }
    });
    return mapProposal(created);
  }

  async getProposal(orgId: string, proposalId: string): Promise<ProposalRecord | undefined> {
    const proposal = await this.client.aiProposal.findFirst({
      where: { id: proposalId, organizationId: orgId }
    });
    return proposal === null ? undefined : mapProposal(proposal);
  }

  async createRelease(input: CreateReleaseInput): Promise<ReleaseRecord> {
    await requirePrismaAppOwned(this.client, input.orgId, input.appId);
    await requirePrismaVersionOwned(this.client, input.orgId, input.appVersionId, input.appId);
    const created = await this.client.release.create({
      data: {
        appId: input.appId,
        appVersionId: input.appVersionId,
        environment: input.environment,
        releaseNumber: input.releaseNumber,
        status: input.status,
        publishedByUserId: input.publishedByUserId
      }
    });
    return mapRelease(created);
  }

  async getCurrentRelease(
    orgId: string,
    appId: string,
    environment: PlatformEnvironment
  ): Promise<ReleaseRecord | undefined> {
    await requirePrismaAppOwned(this.client, orgId, appId);
    const release = await this.client.release.findFirst({
      where: {
        appId,
        environment,
        status: 'PUBLISHED',
        appVersion: { app: { organizationId: orgId } }
      },
      orderBy: { releaseNumber: 'desc' }
    });
    return release === null ? undefined : mapRelease(release);
  }

  async listReleases(orgId: string, appId: string): Promise<ReleaseRecord[]> {
    await requirePrismaAppOwned(this.client, orgId, appId);
    const releases = await this.client.release.findMany({
      where: { appId, appVersion: { app: { organizationId: orgId } } },
      orderBy: { releaseNumber: 'asc' }
    });
    return releases.map(mapRelease);
  }

  async createBuildArtifact(input: CreateBuildArtifactInput): Promise<BuildArtifactRecord> {
    const created = await this.client.buildArtifact.create({
      data: {
        appVersionId: input.appVersionId,
        target: input.target,
        artifactType: input.artifactType,
        storageKey: input.storageKey,
        checksum: input.checksum,
        status: input.status
      }
    });
    return mapArtifact(created);
  }

  async createAuditLog(input: CreateAuditLogInput): Promise<AuditLogRecord> {
    const created = await this.client.auditLog.create({
      data: {
        organizationId: input.orgId,
        appId: input.appId ?? null,
        proposalId: input.proposalId ?? null,
        actorUserId: input.actorUserId ?? null,
        actorType: input.actorType ?? 'USER',
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        metadata: input.metadata as Prisma.InputJsonValue,
        requestId: input.requestId ?? null
      }
    });
    return mapAudit(created);
  }

  async getData(orgId: string, appId: string, key: string): Promise<DataRecord | undefined> {
    const record = await this.client.integration.findUnique({
      where: { id: dataId(orgId, appId, key) }
    });
    if (
      record === null ||
      record.organizationId !== orgId ||
      record.appId !== appId ||
      record.providerKey !== DATA_PROVIDER_KEY
    ) {
      return undefined;
    }
    const config = record.config as {
      key?: unknown;
      value?: unknown;
      createdAt?: unknown;
      updatedAt?: unknown;
    };
    if (config['key'] !== key) {
      return undefined;
    }
    return {
      organizationId: orgId,
      appId,
      key,
      value: clone(config['value']),
      createdAt:
        typeof config['createdAt'] === 'string'
          ? config['createdAt']
          : record.createdAt.toISOString(),
      updatedAt:
        typeof config['updatedAt'] === 'string'
          ? config['updatedAt']
          : record.updatedAt.toISOString()
    };
  }

  async createDataRecord(input: CreateDataRecordInput): Promise<DataRecord> {
    await requirePrismaAppOwned(this.client, input.orgId, input.appId);
    const timestamp = now();
    const created = await this.client.integration.create({
      data: {
        id: dataId(input.orgId, input.appId, input.key),
        organizationId: input.orgId,
        appId: input.appId,
        providerKey: DATA_PROVIDER_KEY,
        displayName: input.key,
        config: {
          key: input.key,
          value: input.value,
          createdAt: timestamp,
          updatedAt: timestamp
        } as Prisma.InputJsonValue,
        status: 'ACTIVE'
      }
    });
    const record = await this.getData(input.orgId, input.appId, input.key);
    if (record === undefined) {
      throw new NovaError(NovaErrorCodes.INTERNAL_ERROR, 'Failed to persist data record', {
        details: { id: created.id }
      });
    }
    return record;
  }

  async updateDataRecord(
    orgId: string,
    appId: string,
    key: string,
    input: UpdateDataRecordInput
  ): Promise<DataRecord | undefined> {
    const existing = await this.getData(orgId, appId, key);
    if (existing === undefined) {
      return undefined;
    }
    await this.client.integration.update({
      where: { id: dataId(orgId, appId, key) },
      data: {
        config: {
          key,
          value: input.value,
          createdAt: existing.createdAt,
          updatedAt: now()
        } as Prisma.InputJsonValue
      }
    });
    return this.getData(orgId, appId, key);
  }

  async deleteDataRecord(orgId: string, appId: string, key: string): Promise<boolean> {
    const id = dataId(orgId, appId, key);
    const existing = await this.getData(orgId, appId, key);
    if (existing === undefined) {
      return false;
    }
    await this.client.integration.delete({ where: { id } });
    return true;
  }
}
