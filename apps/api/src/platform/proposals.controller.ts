import { Body, Controller, Inject, Param, Post, Req } from '@nestjs/common';
import type { ApplyResult, ProposalValidation } from '@nova/sdk';
import { requireActor } from '../common/actor.middleware';
import type { NovaRequest } from '../common/request-context';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { applyProposalSchema, validateProposalSchema } from './dto';
import type { ApplyProposalDto, ValidateProposalDto } from './dto';
import { PlatformService } from './platform.service';

@Controller('v1/proposals')
export class ProposalValidationController {
  constructor(@Inject(PlatformService) private readonly service: PlatformService) {}

  @Post('validate')
  validate(
    @Req() request: NovaRequest,
    @Body(new ZodValidationPipe(validateProposalSchema)) body: ValidateProposalDto
  ): Promise<ProposalValidation> {
    return this.service.validateProposal(requireActor(request), body);
  }
}

@Controller('v1/apps/:appId/proposals')
export class ProposalApplyController {
  constructor(@Inject(PlatformService) private readonly service: PlatformService) {}

  @Post('apply')
  apply(
    @Req() request: NovaRequest,
    @Param('appId') appId: string,
    @Body(new ZodValidationPipe(applyProposalSchema)) body: ApplyProposalDto
  ): Promise<ApplyResult> {
    return this.service.applyProposal(requireActor(request), appId, body);
  }
}
