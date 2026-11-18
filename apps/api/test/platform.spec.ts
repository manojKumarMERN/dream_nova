import { describe, expect, it } from 'vitest';
import { TemplateProposalGenerator } from '@nova/ai-core';
import type { Actor } from '@nova/auth';
import { InMemoryPlatformRepository } from '@nova/backend-adapters';
import { createMinimalAppDefinition } from '@nova/spec';
import { AppsController } from '../src/platform/apps.controller';
import { PlatformService } from '../src/platform/platform.service';
import {
  RuntimePreviewController,
  RuntimePublicController
} from '../src/platform/runtime.controller';
import { RegistryController } from '../src/registry/registry.controller';
import type { NovaRequest } from '../src/common/request-context';

const owner: Actor = {
  organizationId: 'org-1',
  userId: 'user-1',
  role: 'OWNER',
  actorType: 'USER'
};

function makeService(): PlatformService {
  return new PlatformService(new InMemoryPlatformRepository(), new TemplateProposalGenerator());
}

function request(actor: Actor): NovaRequest {
  return {
    actor,
    header: (name: string) => {
      if (name === 'x-org-id') {
        return actor.organizationId;
      }
      if (name === 'x-user-id') {
        return actor.userId;
      }
      return undefined;
    }
  } as unknown as NovaRequest;
}

describe('PlatformService', () => {
  it('creates, reopens, applies a proposal, publishes and serves a runtime payload', async () => {
    const service = makeService();
    const definition = createMinimalAppDefinition();
    const app = await service.createApp(owner, {
      orgId: owner.organizationId,
      name: 'Builder App',
      definition
    });

    expect(app.id).toBeTruthy();
    expect(await service.getApp(owner, app.id)).toEqual(app);
    expect(await service.listApps(owner, 'org-1')).toHaveLength(1);
    const versions = await service.listVersions(owner, app.id);
    expect(versions).toHaveLength(1);
    expect(versions[0]?.versionNumber).toBe(1);

    const base = versions[0];
    if (base === undefined) {
      throw new Error('missing base version');
    }

    const proposal = await service.generateAiProposal(owner, app.id, {
      instruction: 'Create a contact form page',
      pageName: 'Contact'
    });
    const validation = await service.validateProposal(owner, {
      baseVersionId: base.id,
      proposal
    });
    expect(validation.valid).toBe(true);
    expect(validation.definition).toBeDefined();

    const applied = await service.applyProposal(owner, app.id, {
      baseVersionId: base.id,
      proposal,
      approved: true
    });
    expect(applied.version.versionNumber).toBe(2);
    expect(await service.listVersions(owner, app.id)).toHaveLength(2);
    expect(await service.getVersion(owner, applied.version.id)).toEqual(applied.version);

    const release = await service.publish(owner, app.id, { environment: 'production' });
    expect(release.status).toBe('PUBLISHED');
    expect(release.environment).toBe('PRODUCTION');

    const runtime = await service.getRuntime(owner, app.slug, 'production');
    expect(runtime.name).toBe('Minimal App');
    expect(runtime.components.length).toBeGreaterThan(0);
    expect(runtime).not.toHaveProperty('metadata');
    expect(runtime).not.toHaveProperty('integrations');
    expect(JSON.stringify(runtime)).not.toContain('secret');
  });

  it('enforces permissions and tenant scope', async () => {
    const service = makeService();
    const viewer: Actor = { ...owner, role: 'VIEWER' };
    const definition = createMinimalAppDefinition();

    await expect(
      service.createApp(viewer, { orgId: 'org-1', name: 'Denied', definition })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      service.createApp(owner, { orgId: 'org-2', name: 'Other', definition })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const app = await service.createApp(owner, {
      orgId: 'org-1',
      name: 'Scoped',
      definition
    });
    const other: Actor = { ...owner, organizationId: 'org-2' };
    await expect(service.getApp(other, app.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await service.listApps(other, 'org-2')).toEqual([]);
  });

  it('separates authenticated preview from deliberately public published runtime', async () => {
    const service = makeService();
    const definition = {
      ...createMinimalAppDefinition(),
      runtimeAccess: { publicAccess: true }
    };
    const app = await service.createApp(owner, {
      orgId: owner.organizationId,
      name: 'Public Runtime App',
      definition
    });
    const versions = await service.listVersions(owner, app.id);
    const version = versions[0];
    if (version === undefined) {
      throw new Error('missing version');
    }

    const preview = await service.getRuntimePreview(owner, app.slug, version.id);
    expect(preview.components.length).toBeGreaterThan(0);
    await expect(
      service.getRuntimePreview({ ...owner, organizationId: 'org-2' }, app.slug)
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(() =>
      new RuntimePreviewController(service).preview(
        { header: () => undefined } as unknown as NovaRequest,
        app.slug,
        undefined
      )
    ).toThrow('Actor headers are required for runtime preview');
    await expect(service.getPublicRuntime(app.slug)).rejects.toMatchObject({
      code: 'NOT_FOUND'
    });

    await service.publish(owner, app.id, { environment: 'production' });
    expect((await service.getPublicRuntime(app.slug)).name).toBe('Minimal App');
    expect(
      await new RuntimePublicController(service).current(app.slug, 'production')
    ).toMatchObject({ name: 'Minimal App' });
  });

  it('blocks public access to private published payloads', async () => {
    const service = makeService();
    const app = await service.createApp(owner, {
      orgId: owner.organizationId,
      name: 'Private Runtime App',
      definition: createMinimalAppDefinition()
    });
    await service.publish(owner, app.id, { environment: 'production' });
    await expect(service.getPublicRuntime(app.slug)).rejects.toMatchObject({
      code: 'FORBIDDEN'
    });
  });
});

describe('controller smoke tests', () => {
  it('creates apps through the apps controller and returns full contracts', async () => {
    const service = makeService();
    const controller = new AppsController(service);
    const app = await controller.create(request(owner), {
      orgId: 'org-1',
      name: 'Controller App',
      definition: createMinimalAppDefinition()
    });
    expect(app.slug).toBe('controller-app');

    const contracts = new RegistryController().listFull();
    expect(contracts.some((contract) => contract.type === 'nova.form')).toBe(true);
    expect(contracts[0]?.propsSchema).toBeDefined();
    expect(contracts[0]?.migrations).toEqual([]);
  });
});
