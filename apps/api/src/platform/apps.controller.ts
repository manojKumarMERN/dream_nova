import { Body, Controller, Get, Inject, Param, Post, Query, Req } from '@nestjs/common';
import type { AppRecord, AppVersionRecord } from '@nova/backend-adapters';
import type { ReleaseRecord } from '@nova/sdk';
import { NovaError, NovaErrorCodes } from '@nova/errors';
import { requireActor } from '../common/actor.middleware';
import type { NovaRequest } from '../common/request-context';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { createAppSchema, createVersionSchema, publishSchema } from './dto';
import type { CreateAppDto, CreateVersionDto, PublishDto } from './dto';
import { PlatformService } from './platform.service';

function requireQuery(value: string | undefined, name: string): string {
  if (value === undefined || value === '') {
    throw new NovaError(NovaErrorCodes.VALIDATION_FAILED, `${name} is required`, {
      details: { parameter: name }
    });
  }
  return value;
}

@Controller('v1/apps')
export class AppsController {
  constructor(@Inject(PlatformService) private readonly service: PlatformService) {}

  @Post()
  create(
    @Req() request: NovaRequest,
    @Body(new ZodValidationPipe(createAppSchema)) body: CreateAppDto
  ): Promise<AppRecord> {
    return this.service.createApp(requireActor(request), body);
  }

  @Get()
  list(
    @Req() request: NovaRequest,
    @Query('orgId') orgId: string | undefined
  ): Promise<AppRecord[]> {
    return this.service.listApps(requireActor(request), requireQuery(orgId, 'orgId'));
  }

  @Get(':appId')
  get(@Req() request: NovaRequest, @Param('appId') appId: string): Promise<AppRecord> {
    return this.service.getApp(requireActor(request), appId);
  }

  @Post(':appId/versions')
  createVersion(
    @Req() request: NovaRequest,
    @Param('appId') appId: string,
    @Body(new ZodValidationPipe(createVersionSchema)) body: CreateVersionDto
  ): Promise<AppVersionRecord> {
    return this.service.createVersion(requireActor(request), appId, body);
  }

  @Get(':appId/versions')
  listVersions(
    @Req() request: NovaRequest,
    @Param('appId') appId: string
  ): Promise<AppVersionRecord[]> {
    return this.service.listVersions(requireActor(request), appId);
  }

  @Post(':appId/publish')
  publish(
    @Req() request: NovaRequest,
    @Param('appId') appId: string,
    @Body(new ZodValidationPipe(publishSchema)) body: PublishDto
  ): Promise<ReleaseRecord> {
    return this.service.publish(requireActor(request), appId, body);
  }
}
