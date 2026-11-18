import { Module } from '@nestjs/common';
import { createProposalGenerator } from '@nova/ai-core';
import type { ProposalGenerator } from '@nova/ai-core';
import { InMemoryPlatformRepository, PrismaPlatformRepository } from '@nova/backend-adapters';
import type { PlatformRepository } from '@nova/backend-adapters';
import { prisma } from '@nova/db';
import { AiProposalController } from './ai.controller';
import { AppsController } from './apps.controller';
import { ProposalApplyController, ProposalValidationController } from './proposals.controller';
import { PlatformService } from './platform.service';
import { PLATFORM_REPOSITORY, PROPOSAL_GENERATOR } from './platform.tokens';
import {
  RuntimeController,
  RuntimePreviewController,
  RuntimePublicController
} from './runtime.controller';
import { VersionsController } from './versions.controller';

function createPlatformRepository(): PlatformRepository {
  const databaseUrl = process.env['DATABASE_URL'];
  if (
    process.env['NOVA_PLATFORM_REPOSITORY'] === 'prisma' &&
    databaseUrl !== undefined &&
    databaseUrl !== ''
  ) {
    return new PrismaPlatformRepository(prisma);
  }
  return new InMemoryPlatformRepository();
}

function createProposalGeneratorForPlatform(): ProposalGenerator {
  return createProposalGenerator();
}

@Module({
  controllers: [
    AppsController,
    VersionsController,
    ProposalValidationController,
    ProposalApplyController,
    RuntimeController,
    RuntimePreviewController,
    RuntimePublicController,
    AiProposalController
  ],
  providers: [
    PlatformService,
    { provide: PLATFORM_REPOSITORY, useFactory: createPlatformRepository },
    { provide: PROPOSAL_GENERATOR, useFactory: createProposalGeneratorForPlatform }
  ],
  exports: [PlatformService]
})
export class PlatformModule {}
