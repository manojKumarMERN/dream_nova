import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req
} from '@nestjs/common';
import { requireActor } from '../common/actor.middleware';
import type { NovaRequest } from '../common/request-context';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { DataService } from './data.service';
import { applyDataMigrationSchema, dataQueryRequestSchema, dataRecordValuesSchema } from './dto';
import type { ApplyDataMigrationDto, DataQueryRequestDto, DataRecordValuesDto } from './dto';

@Controller('v1/data/apps/:appId')
export class DataController {
  constructor(@Inject(DataService) private readonly service: DataService) {}

  @Get('schema')
  schema(
    @Req() request: NovaRequest,
    @Param('appId') appId: string,
    @Query('environment') environment: string | undefined
  ) {
    return this.service.migrationStatus(requireActor(request), appId, environment);
  }

  @Post('migrations/plan')
  plan(
    @Req() request: NovaRequest,
    @Param('appId') appId: string,
    @Query('environment') environment: string | undefined
  ) {
    return this.service.planMigration(requireActor(request), appId, environment);
  }

  @Post('migrations/apply')
  apply(
    @Req() request: NovaRequest,
    @Param('appId') appId: string,
    @Query('environment') environment: string | undefined,
    @Body(new ZodValidationPipe(applyDataMigrationSchema)) body: ApplyDataMigrationDto
  ) {
    return this.service.applyMigration(requireActor(request), appId, environment, body.confirmed);
  }

  @Post('models/:model/records')
  create(
    @Req() request: NovaRequest,
    @Param('appId') appId: string,
    @Param('model') model: string,
    @Query('environment') environment: string | undefined,
    @Body(new ZodValidationPipe(dataRecordValuesSchema)) body: DataRecordValuesDto
  ) {
    return this.service.createRecord(requireActor(request), appId, model, environment, body.values);
  }

  @Post('models/:model/query')
  query(
    @Req() request: NovaRequest,
    @Param('appId') appId: string,
    @Param('model') model: string,
    @Query('environment') environment: string | undefined,
    @Body(new ZodValidationPipe(dataQueryRequestSchema)) body: DataQueryRequestDto
  ) {
    return this.service.query(requireActor(request), appId, model, environment, body);
  }

  @Get('models/:model/records/:recordId')
  get(
    @Req() request: NovaRequest,
    @Param('appId') appId: string,
    @Param('model') model: string,
    @Param('recordId') recordId: string,
    @Query('environment') environment: string | undefined
  ) {
    return this.service.getRecord(requireActor(request), appId, model, recordId, environment);
  }

  @Patch('models/:model/records/:recordId')
  update(
    @Req() request: NovaRequest,
    @Param('appId') appId: string,
    @Param('model') model: string,
    @Param('recordId') recordId: string,
    @Query('environment') environment: string | undefined,
    @Body(new ZodValidationPipe(dataRecordValuesSchema)) body: DataRecordValuesDto
  ) {
    return this.service.updateRecord(
      requireActor(request),
      appId,
      model,
      recordId,
      environment,
      body.values
    );
  }

  @Delete('models/:model/records/:recordId')
  remove(
    @Req() request: NovaRequest,
    @Param('appId') appId: string,
    @Param('model') model: string,
    @Param('recordId') recordId: string,
    @Query('environment') environment: string | undefined
  ) {
    return this.service.deleteRecord(requireActor(request), appId, model, recordId, environment);
  }
}
