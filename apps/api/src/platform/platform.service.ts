import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { ComponentContractInfo, ProposalGenerator } from '@nova/ai-core';
import type { Actor } from '@nova/auth';
import type {
  AppRecord,
  AppVersionRecord,
  PlatformEnvironment,
  PlatformRepository
} from '@nova/backend-adapters';
import { builtInComponentRegistry } from '@nova/component-registry';
import { NovaError, NovaErrorCodes } from '@nova/errors';
import { applyProposal as applyChangeProposal, changeProposalSchema } from '@nova/proposal-model';
import type { ChangeProposal } from '@nova/proposal-model';
import type {
  ApplyResult,
  ProposalValidation,
  ReleaseRecord,
  RuntimeComponentNode,
  RuntimePayload,
  ValidationReport
} from '@nova/sdk';
import { appDefinitionSchema } from '@nova/spec';
import type { AppDefinition, ComponentNode } from '@nova/spec';
import { validateAppDefinition } from '@nova/spec-validator';
import type {
  ApplyProposalDto,
  CreateAppDto,
  CreateVersionDto,
  GenerateAiProposalDto,
  PublishDto,
  ValidateProposalDto
} from './dto';
import { runtimePayloadSchema } from './dto';
import { assertPlatformPermission } from './permissions';
import { PLATFORM_REPOSITORY, PROPOSAL_GENERATOR } from './platform.tokens';

function checksum(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'app' : slug.slice(0, 80);
}

function mapEnvironment(value: string | undefined): PlatformEnvironment {
  switch ((value ?? 'production').toLowerCase()) {
    case 'production':
      return 'PRODUCTION';
    case 'staging':
      return 'STAGING';
    case 'development':
    case 'dev':
      return 'DEVELOPMENT';
    default:
      throw new NovaError(NovaErrorCodes.INVALID_CONFIGURATION, 'Unknown environment', {
        details: { environment: value }
      });
  }
}

function sanitizeNodes(nodes: readonly ComponentNode[]): RuntimeComponentNode[] {
  return nodes.map((node) => ({
    id: node.id,
    type: node.type,
    contractVersion: node.contractVersion,
    props: structuredClone(node.props),
    ...(node.name === undefined ? {} : { name: node.name }),
    ...(node.bindings === undefined ? {} : { bindings: structuredClone(node.bindings) }),
    ...(node.events === undefined ? {} : { events: structuredClone(node.events) }),
    ...(node.children === undefined ? {} : { children: sanitizeNodes(node.children) }),
    ...(node.slots === undefined
      ? {}
      : {
          slots: Object.fromEntries(
            Object.entries(node.slots).map(([name, slotNodes]) => [name, sanitizeNodes(slotNodes)])
          )
        }),
    ...(node.layout === undefined ? {} : { layout: structuredClone(node.layout) }),
    ...(node.breakpointOverrides === undefined
      ? {}
      : { breakpointOverrides: structuredClone(node.breakpointOverrides) }),
    ...(node.hidden === undefined ? {} : { hidden: node.hidden }),
    ...(node.targetOverrides === undefined
      ? {}
      : { targetOverrides: structuredClone(node.targetOverrides) })
  }));
}

function compileRuntimePayload(definition: AppDefinition): RuntimePayload {
  return {
    schemaVersion: definition.schemaVersion,
    name: definition.name,
    targets: [...definition.targets],
    theme: structuredClone(definition.theme) as unknown as Record<string, unknown>,
    ...(definition.runtimeAccess === undefined
      ? {}
      : { runtimeAccess: { publicAccess: definition.runtimeAccess.publicAccess } }),
    pages: definition.pages.map((page) => ({
      id: page.id,
      name: page.name,
      route: page.route,
      rootNodeId: page.rootNodeId,
      settings: structuredClone(page.settings)
    })),
    components: sanitizeNodes(definition.components)
  };
}

@Injectable()
export class PlatformService {
  constructor(
    @Inject(PLATFORM_REPOSITORY) private readonly repository: PlatformRepository,
    @Inject(PROPOSAL_GENERATOR) private readonly generator: ProposalGenerator
  ) {}

  async createApp(actor: Actor, input: CreateAppDto): Promise<AppRecord> {
    assertPlatformPermission(actor, 'app:create', input.orgId);
    const definition = this.validateDefinition(input.definition);
    const slug = await this.nextSlug(input.orgId, input.name);
    const app = await this.repository.createApp({
      orgId: input.orgId,
      name: input.name,
      slug,
      createdByUserId: actor.userId,
      ...(input.description === undefined ? {} : { description: input.description })
    });
    await this.repository.createVersion({
      orgId: input.orgId,
      appId: app.id,
      versionNumber: 1,
      schemaVersion: definition.schemaVersion,
      definition,
      checksum: checksum(definition),
      createdByUserId: actor.userId,
      createdByActorType: actor.actorType,
      changeSummary: 'Initial version'
    });
    await this.audit(actor, 'app.create', 'app', app.id, app.id, { slug: app.slug });
    return app;
  }

  async listApps(actor: Actor, orgId: string): Promise<AppRecord[]> {
    assertPlatformPermission(actor, 'app:read', orgId);
    return this.repository.listApps(orgId);
  }

  async getApp(actor: Actor, appId: string): Promise<AppRecord> {
    assertPlatformPermission(actor, 'app:read');
    return this.loadApp(actor.organizationId, appId);
  }

  async createVersion(
    actor: Actor,
    appId: string,
    input: CreateVersionDto
  ): Promise<AppVersionRecord> {
    assertPlatformPermission(actor, 'version:create');
    assertPlatformPermission(actor, 'app:update');
    const app = await this.loadApp(actor.organizationId, appId);
    const definition = this.validateDefinition(input.definition);
    const versions = await this.repository.listVersions(app.organizationId, app.id);
    const parentVersionId = input.parentVersionId ?? versions[versions.length - 1]?.id;
    const version = await this.repository.createVersion({
      orgId: app.organizationId,
      appId: app.id,
      versionNumber: versions.length + 1,
      schemaVersion: definition.schemaVersion,
      definition,
      checksum: checksum(definition),
      createdByUserId: actor.userId,
      createdByActorType: actor.actorType,
      ...(parentVersionId === undefined ? {} : { parentVersionId }),
      ...(input.changeSummary === undefined ? {} : { changeSummary: input.changeSummary })
    });
    await this.audit(actor, 'version.create', 'version', version.id, app.id, {
      versionNumber: version.versionNumber
    });
    return version;
  }

  async listVersions(actor: Actor, appId: string): Promise<AppVersionRecord[]> {
    assertPlatformPermission(actor, 'version:read');
    const app = await this.loadApp(actor.organizationId, appId);
    return this.repository.listVersions(app.organizationId, app.id);
  }

  async getVersion(actor: Actor, versionId: string): Promise<AppVersionRecord> {
    assertPlatformPermission(actor, 'version:read');
    const version = await this.repository.getVersion(actor.organizationId, versionId);
    if (version === undefined) {
      throw new NovaError(NovaErrorCodes.NOT_FOUND, 'Version not found', {
        details: { versionId }
      });
    }
    return version;
  }

  async validateProposal(actor: Actor, input: ValidateProposalDto): Promise<ProposalValidation> {
    assertPlatformPermission(actor, 'proposal:create');
    const base = await this.loadVersion(actor.organizationId, input.baseVersionId);
    const definition = this.validateDefinition(base.definition);
    const proposal = this.parseProposal(input.proposal, input.baseVersionId);
    const applied = applyChangeProposal(proposal, {
      baseDefinition: definition,
      approved: false,
      registry: builtInComponentRegistry
    });
    return {
      valid: applied.validation.valid,
      issues: applied.validation.issues,
      riskLevel: applied.riskLevel,
      definition: applied.definition
    };
  }

  async applyProposal(actor: Actor, appId: string, input: ApplyProposalDto): Promise<ApplyResult> {
    assertPlatformPermission(actor, 'proposal:apply');
    assertPlatformPermission(actor, 'app:update');
    const app = await this.loadApp(actor.organizationId, appId);
    const base = await this.loadVersion(app.organizationId, input.baseVersionId);
    const definition = this.validateDefinition(base.definition);
    const proposal = this.parseProposal(input.proposal, input.baseVersionId);
    const applied = applyChangeProposal(proposal, {
      baseDefinition: definition,
      approved: input.approved === true,
      registry: builtInComponentRegistry
    });
    const validation: ValidationReport = {
      valid: applied.validation.valid,
      issues: applied.validation.issues
    };

    const savedProposal = await this.repository.saveProposal({
      orgId: app.organizationId,
      appId: app.id,
      baseVersionId: base.id,
      operations: proposal.operations,
      status: 'APPLIED',
      riskLevel: applied.riskLevel,
      rationale: proposal.rationale,
      validationResult: validation,
      createdByUserId: actor.userId,
      createdByActorType: actor.actorType
    });
    const versions = await this.repository.listVersions(app.organizationId, app.id);
    const version = await this.repository.createVersion({
      orgId: app.organizationId,
      appId: app.id,
      versionNumber: versions.length + 1,
      schemaVersion: applied.definition.schemaVersion,
      definition: applied.definition,
      checksum: checksum(applied.definition),
      createdByUserId: actor.userId,
      createdByActorType: actor.actorType,
      parentVersionId: base.id,
      sourceProposalId: savedProposal.id,
      changeSummary: proposal.summary
    });
    await this.audit(actor, 'proposal.apply', 'proposal', savedProposal.id, app.id, {
      versionId: version.id,
      riskLevel: applied.riskLevel
    });
    return {
      version,
      validation,
      riskLevel: applied.riskLevel,
      definition: applied.definition
    };
  }

  async publish(actor: Actor, appId: string, input: PublishDto): Promise<ReleaseRecord> {
    assertPlatformPermission(actor, 'app:publish');
    const app = await this.loadApp(actor.organizationId, appId);
    const versions = await this.repository.listVersions(app.organizationId, app.id);
    const version =
      input.versionId === undefined
        ? versions[versions.length - 1]
        : await this.loadVersion(app.organizationId, input.versionId);
    if (version === undefined || version.appId !== app.id) {
      throw new NovaError(NovaErrorCodes.NOT_FOUND, 'Version not found', {
        details: { versionId: input.versionId }
      });
    }

    const definition = this.validateDefinition(version.definition);
    const payload = runtimePayloadSchema.parse(compileRuntimePayload(definition));
    const payloadChecksum = checksum(payload);
    const environment = mapEnvironment(input.environment);
    const key = `runtime:${environment.toLowerCase()}`;
    const existing = await this.repository.getData(app.organizationId, app.id, key);
    if (existing === undefined) {
      await this.repository.createDataRecord({
        orgId: app.organizationId,
        appId: app.id,
        key,
        value: payload
      });
    } else {
      await this.repository.updateDataRecord(app.organizationId, app.id, key, { value: payload });
    }

    const releases = await this.repository.listReleases(app.organizationId, app.id);
    const release = await this.repository.createRelease({
      orgId: app.organizationId,
      appId: app.id,
      appVersionId: version.id,
      environment,
      releaseNumber: releases.length + 1,
      status: 'PUBLISHED',
      publishedByUserId: actor.userId,
      checksum: payloadChecksum
    });
    await this.repository.createBuildArtifact({
      appVersionId: version.id,
      target: 'WEB',
      artifactType: 'RUNTIME_BUNDLE',
      storageKey: `runtime://${app.slug}/${environment.toLowerCase()}/${version.versionNumber}`,
      checksum: payloadChecksum,
      status: 'READY'
    });
    await this.audit(actor, 'app.publish', 'release', release.id, app.id, {
      environment,
      versionId: version.id
    });
    return release;
  }

  async getRuntime(
    actor: Actor,
    appSlug: string,
    environment?: string | undefined
  ): Promise<RuntimePayload> {
    assertPlatformPermission(actor, 'app:read');
    const app = await this.repository.getAppBySlug(actor.organizationId, appSlug);
    if (app === undefined) {
      throw new NovaError(NovaErrorCodes.NOT_FOUND, 'Application not found', {
        details: { appSlug }
      });
    }
    const target = mapEnvironment(environment);
    const release = await this.repository.getCurrentRelease(app.organizationId, app.id, target);
    if (release === undefined) {
      throw new NovaError(NovaErrorCodes.NOT_FOUND, 'No published release found', {
        details: { appSlug, environment: target }
      });
    }
    const record = await this.repository.getData(
      app.organizationId,
      app.id,
      `runtime:${target.toLowerCase()}`
    );
    if (record === undefined) {
      throw new NovaError(NovaErrorCodes.NOT_FOUND, 'Runtime payload not found', {
        details: { releaseId: release.id }
      });
    }
    return runtimePayloadSchema.parse(record.value);
  }

  async getRuntimePreview(
    actor: Actor,
    appSlug: string,
    versionId?: string | undefined
  ): Promise<RuntimePayload> {
    assertPlatformPermission(actor, 'app:read');
    const app = await this.repository.getAppBySlug(actor.organizationId, appSlug);
    if (app === undefined) {
      throw new NovaError(NovaErrorCodes.NOT_FOUND, 'Application not found', {
        details: { appSlug }
      });
    }
    const version = await this.loadPreviewVersion(app, versionId);
    const definition = this.validateDefinition(version.definition);
    return runtimePayloadSchema.parse(compileRuntimePayload(definition));
  }

  async getPublicRuntime(
    appSlug: string,
    environment?: string | undefined
  ): Promise<RuntimePayload> {
    const app = await this.repository.getAppBySlugAnyOrg(appSlug);
    if (app === undefined) {
      throw new NovaError(NovaErrorCodes.NOT_FOUND, 'Application not found', {
        details: { appSlug }
      });
    }
    const target = mapEnvironment(environment);
    const release = await this.repository.getCurrentRelease(app.organizationId, app.id, target);
    if (release === undefined) {
      throw new NovaError(NovaErrorCodes.NOT_FOUND, 'No published release found', {
        details: { appSlug, environment: target }
      });
    }
    const record = await this.repository.getData(
      app.organizationId,
      app.id,
      `runtime:${target.toLowerCase()}`
    );
    if (record === undefined) {
      throw new NovaError(NovaErrorCodes.NOT_FOUND, 'Runtime payload not found', {
        details: { releaseId: release.id }
      });
    }
    const payload = runtimePayloadSchema.parse(record.value);
    if (payload.runtimeAccess?.publicAccess !== true) {
      throw new NovaError(NovaErrorCodes.FORBIDDEN, 'Published runtime is not public', {
        details: { appSlug }
      });
    }
    return payload;
  }

  async generateAiProposal(
    actor: Actor,
    appId: string,
    input: GenerateAiProposalDto
  ): Promise<ChangeProposal> {
    assertPlatformPermission(actor, 'ai:propose');
    assertPlatformPermission(actor, 'app:read');
    const app = await this.loadApp(actor.organizationId, appId);
    const versions = await this.repository.listVersions(app.organizationId, app.id);
    const base = versions[versions.length - 1];
    if (base === undefined) {
      throw new NovaError(NovaErrorCodes.NOT_FOUND, 'Version not found', { details: { appId } });
    }
    const definition = this.validateDefinition(base.definition);
    const componentContracts: ComponentContractInfo[] = builtInComponentRegistry
      .list()
      .map((contract) => ({
        type: contract.type,
        version: contract.version,
        displayName: contract.displayName,
        category: contract.category,
        capabilities: contract.capabilities,
        propsSchema: contract.propsSchema,
        defaults: contract.defaults
      }));
    const proposal = await this.generator.generateProposal({
      definition,
      instruction: input.instruction,
      baseVersionId: base.id,
      appId: app.id,
      availableComponentTypes: componentContracts.map((contract) => contract.type),
      componentContracts,
      ...(input.pageName === undefined ? {} : { pageName: input.pageName }),
      ...(input.selectedNodeIds === undefined ? {} : { selectedNodeIds: input.selectedNodeIds })
    });
    if (!changeProposalSchema.safeParse(proposal).success) {
      throw new NovaError(NovaErrorCodes.INVALID_PROPOSAL, 'Generated proposal is invalid', {
        details: { appId }
      });
    }
    await this.audit(actor, 'ai.proposal_generated', 'proposal', app.id, app.id, {
      instructionLength: input.instruction.length
    });
    return proposal;
  }

  private async nextSlug(orgId: string, name: string): Promise<string> {
    const base = slugify(name);
    const apps = await this.repository.listApps(orgId);
    if (!apps.some((app) => app.slug === base)) {
      return base;
    }
    return `${base}-${randomUUID().slice(0, 8)}`;
  }

  private validateDefinition(input: unknown): AppDefinition {
    const validation = validateAppDefinition(input);
    if (!validation.valid) {
      throw new NovaError(NovaErrorCodes.VALIDATION_FAILED, 'Application definition is invalid', {
        details: { issues: validation.issues }
      });
    }
    return appDefinitionSchema.parse(input);
  }

  private async loadApp(orgId: string, appId: string): Promise<AppRecord> {
    const app = await this.repository.getApp(orgId, appId);
    if (app === undefined) {
      throw new NovaError(NovaErrorCodes.NOT_FOUND, 'Application not found', {
        details: { appId }
      });
    }
    return app;
  }

  private async loadVersion(orgId: string, versionId: string): Promise<AppVersionRecord> {
    const version = await this.repository.getVersion(orgId, versionId);
    if (version === undefined) {
      throw new NovaError(NovaErrorCodes.NOT_FOUND, 'Version not found', {
        details: { versionId }
      });
    }
    return version;
  }

  private async loadPreviewVersion(
    app: AppRecord,
    versionId?: string | undefined
  ): Promise<AppVersionRecord> {
    if (versionId !== undefined) {
      const version = await this.loadVersion(app.organizationId, versionId);
      if (version.appId !== app.id) {
        throw new NovaError(NovaErrorCodes.NOT_FOUND, 'Version not found', {
          details: { versionId }
        });
      }
      return version;
    }
    const versions = await this.repository.listVersions(app.organizationId, app.id);
    const version = versions[versions.length - 1];
    if (version === undefined) {
      throw new NovaError(NovaErrorCodes.NOT_FOUND, 'No application version found', {
        details: { appId: app.id }
      });
    }
    return version;
  }

  private parseProposal(input: unknown, baseVersionId: string): ChangeProposal {
    const parsed = changeProposalSchema.safeParse(input);
    if (!parsed.success) {
      throw new NovaError(NovaErrorCodes.INVALID_PROPOSAL, 'Change proposal is invalid', {
        details: {
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message
          }))
        }
      });
    }
    if (parsed.data.baseVersionId !== baseVersionId) {
      throw new NovaError(NovaErrorCodes.INVALID_PROPOSAL, 'Proposal base version mismatch', {
        details: { baseVersionId, proposalBaseVersionId: parsed.data.baseVersionId }
      });
    }
    return parsed.data;
  }

  private async audit(
    actor: Actor,
    action: string,
    resourceType: string,
    resourceId: string,
    appId: string | undefined,
    metadata: Record<string, unknown>
  ): Promise<void> {
    await this.repository.createAuditLog({
      orgId: actor.organizationId,
      action,
      resourceType,
      resourceId,
      metadata,
      actorUserId: actor.userId,
      actorType: actor.actorType,
      ...(appId === undefined ? {} : { appId })
    });
  }
}
