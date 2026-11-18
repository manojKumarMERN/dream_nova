import { Controller, Get, Inject, Param, Req } from '@nestjs/common';
import type { AppVersionRecord } from '@nova/backend-adapters';
import { requireActor } from '../common/actor.middleware';
import type { NovaRequest } from '../common/request-context';
import { PlatformService } from './platform.service';

@Controller('v1/versions')
export class VersionsController {
  constructor(@Inject(PlatformService) private readonly service: PlatformService) {}

  @Get(':versionId')
  get(
    @Req() request: NovaRequest,
    @Param('versionId') versionId: string
  ): Promise<AppVersionRecord> {
    return this.service.getVersion(requireActor(request), versionId);
  }
}
