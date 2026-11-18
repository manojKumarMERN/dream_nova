import { Controller, Get, Inject, Param, Query, Req } from '@nestjs/common';
import type { RuntimePayload } from '@nova/sdk';
import { requireActor, requireExplicitActor } from '../common/actor.middleware';
import type { NovaRequest } from '../common/request-context';
import { PlatformService } from './platform.service';

@Controller('runtime/v1/apps/:appSlug/releases/current')
export class RuntimeController {
  constructor(@Inject(PlatformService) private readonly service: PlatformService) {}

  @Get()
  current(
    @Req() request: NovaRequest,
    @Param('appSlug') appSlug: string,
    @Query('environment') environment: string | undefined
  ): Promise<RuntimePayload> {
    return this.service.getRuntime(requireActor(request), appSlug, environment);
  }
}

@Controller('runtime/v1/preview/:appSlug')
export class RuntimePreviewController {
  constructor(@Inject(PlatformService) private readonly service: PlatformService) {}

  @Get()
  preview(
    @Req() request: NovaRequest,
    @Param('appSlug') appSlug: string,
    @Query('versionId') versionId: string | undefined
  ): Promise<RuntimePayload> {
    return this.service.getRuntimePreview(requireExplicitActor(request), appSlug, versionId);
  }
}

@Controller('runtime/v1/public/:appSlug')
export class RuntimePublicController {
  constructor(@Inject(PlatformService) private readonly service: PlatformService) {}

  @Get()
  current(
    @Param('appSlug') appSlug: string,
    @Query('environment') environment: string | undefined
  ): Promise<RuntimePayload> {
    return this.service.getPublicRuntime(appSlug, environment);
  }
}
